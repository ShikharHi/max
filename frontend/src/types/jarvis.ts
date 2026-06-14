export type RunStatus = "idle" | "running" | "done" | "error";
export type RegistryKind = "tool" | "agent";
export type InvocationStatus = "planned" | "running" | "done" | "error";
export type StepNode = "router" | "executor";

export interface Thread {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: "idle" | "busy";
  values?: unknown;
}

export interface ToolCall {
  id: string;
  type: RegistryKind;
  name: string;
  input?: unknown;
  result?: unknown;
  status: InvocationStatus;
  expanded?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "done" | "error";
  toolCalls?: ToolCall[];
  updates?: string[];
}

export interface StepInvocation {
  id: string;
  type: RegistryKind;
  name: string;
  status: InvocationStatus;
  input?: unknown;
  result?: unknown;
}

export interface StepEvent {
  id: string;
  node: StepNode;
  elapsedMs: number;
  decision?: "answer" | "use_tools" | "use_agents";
  plan?: string;
  invocations?: StepInvocation[];
  raw: unknown;
}

export interface RegistryEntry {
  name: string;
  type: RegistryKind;
  version?: string;
  description?: string;
  tags?: string[];
  active: boolean;
  icon?: string;
}

export interface StreamCallbacks {
  onMetadata?: (data: unknown) => void;
  onUpdates?: (data: unknown) => void;
  onValues?: (data: unknown) => void;
  onToken?: (token: string, data: unknown) => void;
  onError?: (error: Error | unknown) => void;
  onEnd?: () => void;
}
