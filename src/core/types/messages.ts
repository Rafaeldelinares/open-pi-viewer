export type AgentActivity = 'idle' | 'busy';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  isStreaming?: boolean;
}

export type ToolExecutionStatus = 'running' | 'completed' | 'error';

export interface ToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  args?: Record<string, unknown> | string;
  status: ToolExecutionStatus;
  output?: string;
  isError?: boolean;
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolCallBlock;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isCancelled?: boolean;
  blocks?: MessageBlock[];
}
