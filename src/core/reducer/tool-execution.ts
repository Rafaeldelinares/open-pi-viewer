import type { ChatMessage, ThinkingBlock, ToolCallBlock, ToolExecutionStatus } from '../types/messages';
import type { ChatSessionState } from '../types/chat-state';
import type { ChatAction } from './index';

export type ToolExecutionAction =
  | {
      type: 'EVENT_TOOL_EXECUTION_START';
      payload: {
        toolCallId: string;
        toolName: string;
        args?: Record<string, unknown> | string;
      };
    }
  | {
      type: 'EVENT_TOOL_EXECUTION_UPDATE';
      payload: {
        toolCallId: string;
        output: string;
      };
    }
  | {
      type: 'EVENT_TOOL_EXECUTION_END';
      payload: {
        toolCallId: string;
        output?: string;
        isError?: boolean;
      };
    };

/**
 * Tool execution slice: tool call lifecycle and approval flow.
 */
export function toolExecutionReducer(
  state: ChatSessionState,
  action: ChatAction
): ChatSessionState | undefined {
  switch (action.type) {
    case 'EVENT_TOOL_EXECUTION_START': {
      if (state.connectionStatus !== 'connected') {
        return state;
      }
      const { toolCallId, toolName, args } = action.payload;

      // 1. Target resolution:
      // Priority A: The specific message that already contains this toolCallId
      let targetIndex = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const msg = state.messages[i];
        if (msg.blocks?.some((b) => b.type === 'tool_call' && b.id === toolCallId)) {
          targetIndex = i;
          break;
        }
      }

      // Priority B: If not found by toolCallId, target the active assistant message
      if (targetIndex === -1 && state.activeAssistantMessageId) {
        targetIndex = state.messages.findIndex((m) => m.id === state.activeAssistantMessageId);
      }

      // Priority C: If still not found, target the latest assistant message AFTER the last user prompt
      if (targetIndex === -1) {
        let lastUserIndex = -1;
        for (let i = state.messages.length - 1; i >= 0; i--) {
          if (state.messages[i].role === 'user') {
            lastUserIndex = i;
            break;
          }
        }
        for (let i = state.messages.length - 1; i > lastUserIndex; i--) {
          if (state.messages[i].role === 'assistant') {
            targetIndex = i;
            break;
          }
        }
      }

      // Priority D: If no assistant message exists for the current turn, create one
      if (targetIndex === -1) {
        const newAssistantId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newAssistantMessage: ChatMessage = {
          id: newAssistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toLocaleTimeString(),
          isStreaming: true,
          blocks: [
            {
              type: 'tool_call',
              id: toolCallId,
              name: toolName,
              args,
              status: 'running',
              output: '',
              isError: false,
            },
          ],
        };
        return {
          ...state,
          messages: [...state.messages, newAssistantMessage],
          activeAssistantMessageId: newAssistantId,
        };
      }

      // Update ONLY the single target message (never mutate past assistant messages)
      const updatedMessages = state.messages.map((m, idx) => {
        if (idx === targetIndex) {
          const blocks = m.blocks ? [...m.blocks] : [];
          // Mark any in-flight thinking blocks as complete
          for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].type === 'thinking' && (blocks[i] as ThinkingBlock).isStreaming) {
              blocks[i] = { ...(blocks[i] as ThinkingBlock), isStreaming: false };
            }
          }

          const existingIndex = blocks.findIndex(
            (b) => b.type === 'tool_call' && b.id === toolCallId
          );
          if (existingIndex >= 0) {
            blocks[existingIndex] = {
              ...(blocks[existingIndex] as ToolCallBlock),
              name: toolName || (blocks[existingIndex] as ToolCallBlock).name,
              args: args !== undefined ? args : (blocks[existingIndex] as ToolCallBlock).args,
              status: 'running',
            };
          } else {
            blocks.push({
              type: 'tool_call',
              id: toolCallId,
              name: toolName,
              args,
              status: 'running',
              output: '',
              isError: false,
            });
          }

          return {
            ...m,
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

    case 'EVENT_TOOL_EXECUTION_UPDATE': {
      if (state.connectionStatus !== 'connected') {
        return state;
      }
      const { toolCallId, output } = action.payload;

      // Find the specific message that contains this toolCallId
      let targetIndex = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].blocks?.some((b) => b.type === 'tool_call' && b.id === toolCallId)) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        return state;
      }

      const updatedMessages = state.messages.map((m, idx) => {
        if (idx === targetIndex && m.blocks) {
          const blocks = m.blocks.map((b) => {
            if (b.type === 'tool_call' && b.id === toolCallId) {
              return {
                ...b,
                output,
                status: 'running' as const,
              };
            }
            return b;
          });
          return { ...m, blocks };
        }
        return m;
      });

      return {
        ...state,
        messages: updatedMessages,
      };
    }

    case 'EVENT_TOOL_EXECUTION_END': {
      if (state.connectionStatus !== 'connected') {
        return state;
      }
      const { toolCallId, output, isError } = action.payload;

      // Find the specific message that contains this toolCallId
      let targetIndex = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].blocks?.some((b) => b.type === 'tool_call' && b.id === toolCallId)) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        return state;
      }

      const updatedMessages = state.messages.map((m, idx) => {
        if (idx === targetIndex && m.blocks) {
          const blocks = m.blocks.map((b) => {
            if (b.type === 'tool_call' && b.id === toolCallId) {
              const nextStatus: ToolExecutionStatus = isError ? 'error' : 'completed';
              return {
                ...b,
                output: output !== undefined ? output : b.output,
                status: nextStatus,
                isError: Boolean(isError),
              };
            }
            return b;
          });
          return { ...m, blocks };
        }
        return m;
      });

      return {
        ...state,
        messages: updatedMessages,
      };
    }

    default:
      return undefined;
  }
}
