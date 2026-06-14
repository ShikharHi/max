export type ThreadStatus = "idle" | "busy" | "interrupted" | "error";

export type BackendMessage = {
  type?: string;
  content?: string;
  id?: string | null;
  additional_kwargs?: Record<string, unknown>;
};

export type ThreadValues = {
  messages?: BackendMessage[];
  user_input?: string;
  decision?: "answer" | "use_tools" | "use_agents" | string;
  plan?: string;
  invocations?: Invocation[];
  execution_results?: string[];
  final_answer?: string;
  iterations?: number;
};

export type Thread = {
  thread_id: string;
  metadata: Record<string, unknown>;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  values?: ThreadValues | null;
};

export type ThreadState = {
  values: ThreadValues;
  next: string[];
  metadata: Record<string, unknown>;
  created_at?: string;
  checkpoint_id?: string | null;
  parent_checkpoint_id?: string | null;
};

export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "thinking" | "streaming" | "error";
export type FeedbackValue = "up" | "down" | null;

export type ToolCallKind = "tool" | "agent";
export type ToolCallStatus = "pending" | "running" | "done" | "error";

export type ToolCall = {
  id: string;
  kind: ToolCallKind;
  name: string;
  input: unknown;
  result?: string;
  status: ToolCallStatus;
  expanded: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: MessageStatus;
  toolCalls?: ToolCall[];
  feedback?: FeedbackValue;
};

export type Invocation = {
  type: ToolCallKind | string;
  name: string;
  input?: Record<string, unknown>;
};

export type StepNode = "router" | "executor";

export type StepEvent = {
  id: string;
  node: StepNode;
  timestamp: number;
  elapsedMs: number;
  raw: unknown;
  decision?: "answer" | "use_tools" | "use_agents" | string;
  plan?: string;
  invocations?: Invocation[];
  results?: string[];
  status?: "running" | "done" | "error";
};

export type RunStatus = "idle" | "running" | "done" | "error";

export type RegistryKind = "tool" | "agent";

export type RegistryEntry = {
  kind: RegistryKind;
  name: string;
  display_name: string;
  description: string;
  active: boolean;
  version: string;
  tags: string[];
  input_schema?: unknown;
};

export type RegistryResponse = {
  tools: RegistryEntry[];
  agents: RegistryEntry[];
};

export type ActiveRegistryResponse = {
  tools: string[];
  agents: string[];
};

export type RunCreateBody = {
  assistant_id: "jarvis";
  input: {
    user_input: string;
  };
  stream_mode: Array<"updates" | "values" | "messages">;
  multitask_strategy: "enqueue";
};

export type SSECallbacks = {
  onMetadata?: (data: { run_id?: string; thread_id?: string | null }) => void;
  onUpdates?: (data: unknown) => void;
  onValues?: (data: ThreadValues) => void;
  onToken?: (data: { content?: string; type?: string; metadata?: Record<string, unknown> }) => void;
  onError?: (data: { error?: string; run_id?: string }) => void;
  onEnd?: () => void;
};
