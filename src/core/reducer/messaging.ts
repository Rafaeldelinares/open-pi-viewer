import { extractTextFromContent, parseMessageBlocks } from '../protocol';
import { isMessageEmpty } from '../prompt-controls-utils';
import type { AuthoritativeMessage } from '../types/events';
import type { ChatMessage, ToolCallBlock } from '../types/messages';
import type { ChatSessionState } from '../types/chat-state';
import type { ChatAction } from './index';

export type MessagingAction =
  | { type: 'PROMPT_SUBMIT'; payload: { id: string; message: string } }
  | { type: 'PROMPT_ACCEPTED'; payload: { id: string } }
  | { type: 'PROMPT_REJECTED'; payload: { id: string; error: string } }
  | {
      type: 'EVENT_MESSAGE_START';
      payload: { message: AuthoritativeMessage };
    }
  | {
      type: 'EVENT_MESSAGE_UPDATE';
      payload: { delta?: string; contentIndex?: number };
    }
  | {
      type: 'EVENT_THINKING_UPDATE';
      payload: { delta: string };
    }
  | {
      type: 'EVENT_MESSAGE_END';
      payload: { message: AuthoritativeMessage };
    }
  | { type: 'EVENT_AGENT_END'; payload?: { willRetry?: boolean } }
  | { type: 'EVENT_AGENT_SETTLED' }
  | { type: 'ABORT_CLICKED' }
  | { type: 'ABORT_COMPLETED'; payload?: { promptId?: string | null } };

/**
 * Messaging slice: prompt submission, streaming assistant deltas, message reconciliation, abort.
 */
export function messagingReducer(
  state: ChatSessionState,
  action: ChatAction
): ChatSessionState | undefined {
  switch (action.type) {
    case 'PROMPT_SUBMIT': {
      const userMessage: ChatMessage = {
        id: action.payload.id,
        role: 'user',
        content: action.payload.message,
        timestamp: new Date().toLocaleTimeString(),
      };

      return {
        ...state,
        messages: [...state.messages, userMessage],
        agentActivity: 'busy',
        pendingPromptId: action.payload.id,
        statusLabel: 'Running',
        statusDetail: 'Prompt sent, waiting for agent response...',
        lastError: null,
      };
    }

    case 'PROMPT_ACCEPTED': {
      // Must be connected, have an active pending prompt, and require explicit matching ID
      if (
        state.connectionStatus !== 'connected' ||
        !state.pendingPromptId ||
        !action.payload?.id ||
        state.pendingPromptId !== action.payload.id
      ) {
        return state;
      }

      return {
        ...state,
        statusDetail: 'Prompt accepted by Pi; streaming response...',
      };
    }

    case 'PROMPT_REJECTED': {
      // Must have an active pending prompt and require explicit matching ID
      if (
        !state.pendingPromptId ||
        !action.payload?.id ||
        state.pendingPromptId !== action.payload.id
      ) {
        return state;
      }

      const isConnected = state.connectionStatus === 'connected';

      return {
        ...state,
        agentActivity: 'idle',
        pendingPromptId: null,
        lastError: action.payload.error,
        statusLabel: isConnected ? 'Connected' : state.statusLabel,
        statusDetail: isConnected
          ? `Prompt rejected: ${action.payload.error}`
          : state.statusDetail,
      };
    }

    case 'EVENT_MESSAGE_START': {
      if (state.connectionStatus !== 'connected') {
        return state;
      }

      const msg = action.payload.message;
      if (msg.role !== 'assistant') {
        return state;
      }

      const assistantMsgId =
        msg.id || `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const initialText = extractTextFromContent(msg.content);
      const initialBlocks = parseMessageBlocks(msg.content);

      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: initialText,
        timestamp: new Date().toLocaleTimeString(),
        isStreaming: true,
        blocks: initialBlocks.length > 0 ? initialBlocks : undefined,
      };

      return {
        ...state,
        messages: [...state.messages, assistantMessage],
        activeAssistantMessageId: assistantMsgId,
        agentActivity: 'busy',
      };
    }

    case 'EVENT_MESSAGE_UPDATE': {
      const delta = action.payload.delta;
      if (
        !delta ||
        !state.activeAssistantMessageId ||
        state.connectionStatus !== 'connected' ||
        state.agentActivity !== 'busy'
      ) {
        return state;
      }

      const updatedMessages = state.messages.map((m) => {
        if (m.id === state.activeAssistantMessageId) {
          const existingBlocks = m.blocks ? [...m.blocks] : [];
          // If a thinking block was streaming, text arrival marks it complete
          const normalizedBlocks = existingBlocks.map((b) =>
            b.type === 'thinking' && b.isStreaming ? { ...b, isStreaming: false } : b
          );
          const lastBlock = normalizedBlocks[normalizedBlocks.length - 1];
          if (lastBlock && lastBlock.type === 'text') {
            normalizedBlocks[normalizedBlocks.length - 1] = {
              ...lastBlock,
              text: lastBlock.text + delta,
            };
          } else {
            normalizedBlocks.push({
              type: 'text',
              text: delta,
            });
          }

          return {
            ...m,
            content: m.content + delta,
            isStreaming: true,
            blocks: normalizedBlocks,
          };
        }
        return m;
      });

      return {
        ...state,
        messages: updatedMessages,
      };
    }

    case 'EVENT_THINKING_UPDATE': {
      const delta = action.payload.delta;
      if (
        !delta ||
        !state.activeAssistantMessageId ||
        state.connectionStatus !== 'connected' ||
        state.agentActivity !== 'busy'
      ) {
        return state;
      }

      const updatedMessages = state.messages.map((m) => {
        if (m.id === state.activeAssistantMessageId) {
          const blocks = m.blocks ? [...m.blocks] : [];
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock && lastBlock.type === 'thinking') {
            blocks[blocks.length - 1] = {
              ...lastBlock,
              thinking: lastBlock.thinking + delta,
              isStreaming: true,
            };
          } else {
            blocks.push({
              type: 'thinking',
              thinking: delta,
              isStreaming: true,
            });
          }

          return {
            ...m,
            isStreaming: true,
            blocks,
          };
        }
        return m;
      });

      return {
        ...state,
        messages: updatedMessages,
      };
    }

    case 'EVENT_MESSAGE_END': {
      if (state.connectionStatus !== 'connected') {
        return state;
      }

      const msg = action.payload.message;
      // Strictly ignore non-assistant message_end events (e.g. user echo or tool messages)
      if (msg.role !== 'assistant') {
        return state;
      }

      const authoritativeText = extractTextFromContent(msg.content);
      const parsedBlocks = parseMessageBlocks(msg.content);

      // Reconcile authoritative text and blocks without duplicate tokens
      let found = false;
      const updatedMessages = state.messages.map((m) => {
        if (
          m.id === state.activeAssistantMessageId ||
          (msg.id && m.id === msg.id)
        ) {
          found = true;

          // Build index of existing tool execution outputs and statuses
          const existingToolMap = new Map<string, ToolCallBlock>();
          if (m.blocks) {
            for (const b of m.blocks) {
              if (b.type === 'tool_call') {
                existingToolMap.set(b.id, b);
              }
            }
          }

          let reconciledBlocks: typeof parsedBlocks;
          if (parsedBlocks.length > 0) {
            reconciledBlocks = parsedBlocks.map((block) => {
              if (block.type === 'tool_call') {
                const existing = existingToolMap.get(block.id);
                if (existing) {
                  return {
                    ...block,
                    status: existing.status,
                    output: existing.output || block.output,
                    isError: existing.isError ?? block.isError,
                  };
                }
              }
              if (block.type === 'thinking') {
                return {
                  ...block,
                  isStreaming: false,
                };
              }
              return block;
            });
          } else if (m.blocks && m.blocks.length > 0) {
            // Keep existing blocks if parsedBlocks is empty (e.g. string content)
            reconciledBlocks = m.blocks.map((b) =>
              b.type === 'thinking' ? { ...b, isStreaming: false } : b
            );
          } else {
            reconciledBlocks = [];
          }

          return {
            ...m,
            content: authoritativeText, // authoritative replacement
            isStreaming: false,
            blocks: reconciledBlocks.length > 0 ? reconciledBlocks : undefined,
          };
        }
        return m;
      });

      // If no matching message was tracked yet, only add if there was an active assistant
      // message in flight, preventing unsolicited late messages after abort/disconnect.
      if (!found && state.activeAssistantMessageId && (authoritativeText.length > 0 || parsedBlocks.length > 0)) {
        updatedMessages.push({
          id:
            msg.id ||
            `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: authoritativeText,
          timestamp: new Date().toLocaleTimeString(),
          isStreaming: false,
          blocks: parsedBlocks.length > 0 ? parsedBlocks : undefined,
        });
      }

      return {
        ...state,
        messages: updatedMessages,
        activeAssistantMessageId: null,
      };
    }

    case 'EVENT_AGENT_END': {
      // Diagnostic/turn event. Does NOT set agentActivity = 'idle'!
      // Pi may still perform automatic retries, branch summarization, or follow-ups.
      return {
        ...state,
        statusDetail: action.payload?.willRetry
          ? 'Agent turn completed (retry pending)...'
          : 'Agent turn completed, settling...',
      };
    }

    case 'EVENT_AGENT_SETTLED': {
      // Settled uses agent_settled, NOT agent_end per docs/rpc.md and requirements!
      // This is the authoritative moment when the full session-level run settles.
      return {
        ...state,
        agentActivity: 'idle',
        pendingPromptId: null,
        statusLabel: 'Connected',
        statusDetail: 'Agent settled — ready for next prompt',
      };
    }

    case 'ABORT_CLICKED': {
      return {
        ...state,
        statusDetail: 'Aborting current agent operation...',
      };
    }

    case 'ABORT_COMPLETED': {
      // If abort is correlated to a specific prompt and a different prompt is already pending, ignore
      if (
        action.payload?.promptId &&
        state.pendingPromptId &&
        state.pendingPromptId !== action.payload.promptId
      ) {
        return state;
      }

      const isConnected = state.connectionStatus === 'connected';

      const updatedMessages = state.messages
        .map((m) => {
          const isActiveAssistant =
            m.id === state.activeAssistantMessageId ||
            (m.role === 'assistant' && m.isStreaming);

          if (isActiveAssistant) {
            const updatedBlocks = m.blocks?.map((b) =>
              b.type === 'thinking' && b.isStreaming
                ? { ...b, isStreaming: false }
                : b
            );
            return {
              ...m,
              isStreaming: false,
              isCancelled: true,
              blocks: updatedBlocks,
            };
          }

          const hasStreamingThinking = m.blocks?.some(
            (b) => b.type === 'thinking' && b.isStreaming
          );
          if (m.isStreaming || hasStreamingThinking) {
            const updatedBlocks = m.blocks?.map((b) =>
              b.type === 'thinking' && b.isStreaming
                ? { ...b, isStreaming: false }
                : b
            );
            return { ...m, isStreaming: false, blocks: updatedBlocks };
          }

          return m;
        })
        .filter((m) => !isMessageEmpty(m));

      return {
        ...state,
        agentActivity: 'idle',
        pendingPromptId: null,
        activeAssistantMessageId: null,
        pendingApprovals: [],
        messages: updatedMessages,
        statusLabel: isConnected ? 'Connected' : state.statusLabel,
        statusDetail: isConnected
          ? 'Agent operation aborted'
          : state.statusDetail,
      };
    }

    default:
      return undefined;
  }
}
