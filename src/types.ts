// Kiểu dữ liệu dùng chung cho toàn bộ CCoding.

export type Role = 'lead' | 'member' | 'reviewer' | 'router';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type TaskMode = 'auto' | 'department' | 'project' | 'joint';
export type Phase = 'route' | 'plan' | 'discuss' | 'finalize' | 'execute' | 'review' | 'revise' | 'synthesize';
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type SubtaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'discussing' | 'reviewing' | 'waiting' | 'error';

export interface AgentLook { hair: string; shirt: string; skin: string }

export interface AgentDef {
  id: string;
  name: string;
  title: string;
  department: string;
  role: Role;
  model: string;
  runtime: string; // 'inherit' hoặc id runtime
  tools: string[];
  skills: string[];
  summary: string;
  look: AgentLook;
  sources: string[];
  body: string;
  file: string;
}

export interface DepartmentDef {
  id: string;
  name: string;
  short: string;
  purpose: string;
  lead: string;
  reviewer: string;
  members: string[];
  color: string;
  keywords: string[];
  body: string;
  file: string;
}

export interface ProjectDef {
  id: string;
  name: string;
  description?: string;
  department?: string; // 'auto' | id phòng ban | 'joint'
  workspace?: string; // thư mục làm việc của agent
  classification: Classification;
  runtime?: string;
  agents?: string[]; // giới hạn tập agent tham gia (tùy chọn)
  models?: Record<string, string>; // agentId -> model override
  budgetTokens?: number;
  createdAt: string;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  calls: number;
  estimatedCalls: number;
}

export interface RunRequest {
  agent: AgentDef;
  phase: Phase;
  /** Hồ sơ vị trí (agent.md) + quy tắc chung — gửi làm system prompt với runtime API. */
  system: string;
  /** Nội dung công việc của lượt gọi này. */
  prompt: string;
  model: string;
  cwd: string;
  tools: string[];
  allowTools: boolean;
  timeoutMs: number;
  meta: { taskId: string; subtaskId?: string; department: string; projectId?: string; callId: string };
  /** Dữ liệu có cấu trúc kèm theo (runtime mock dùng để mô phỏng; runtime thật bỏ qua). */
  hints?: Record<string, unknown>;
}

export interface RunHooks {
  signal?: AbortSignal;
  onText?: (chunk: string) => void;
  onActivity?: (text: string) => void;
}

export interface RunResult {
  text: string;
  usage: Omit<Usage, 'calls' | 'estimatedCalls'>;
  estimated: boolean;
  model: string;
  runtime: string;
  durationMs: number;
  error?: string;
}

export interface RuntimeAvailability { ok: boolean; detail: string; models?: string[] }

export interface Runtime {
  id: string;
  label: string;
  /** Dữ liệu có ở lại trên máy (không gửi ra nhà cung cấp bên ngoài) hay không. */
  local: boolean;
  supportsTools: boolean;
  available(): Promise<RuntimeAvailability>;
  run(req: RunRequest, hooks: RunHooks): Promise<RunResult>;
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dependsOn: string[];
  deliverable?: string;
  status: SubtaskStatus;
  output?: string; // đường dẫn file đầu ra (tương đối data/runs/<task>)
  summary?: string;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  usage: Usage;
  error?: string;
}

export interface ReviewIssue { subtask: string; severity: 'blocker' | 'major' | 'minor'; comment: string }

export interface DeptRun {
  department: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  phase?: Phase;
  planSummary?: string;
  decisions?: string;
  subtasks: Subtask[];
  review?: { approved: boolean; summary: string; issues: ReviewIssue[] };
  finalPath?: string;
  usage: Usage;
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskOptions {
  discussionRounds: number;
  review: boolean;
  maxParallel: number;
  maxRevisions: number;
  budgetTokens: number;
  runtime?: string;
}

export interface Task {
  id: string;
  title: string;
  brief: string;
  mode: TaskMode;
  department?: string;
  projectId?: string;
  classification: Classification;
  status: TaskStatus;
  phase?: Phase;
  departments: string[];
  routing?: { departments: string[]; reason: string; by: string };
  runs: DeptRun[];
  options: TaskOptions;
  usage: Usage;
  finalPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ChatMessage {
  id: string;
  ts: string;
  taskId: string;
  department: string;
  from: string;
  kind: 'plan' | 'discussion' | 'decision' | 'handoff' | 'review' | 'final' | 'system';
  text: string;
  round?: number;
  subtaskId?: string;
}

export interface UsageRecord {
  ts: string;
  callId: string;
  taskId: string;
  subtaskId?: string;
  projectId?: string;
  department: string;
  agentId: string;
  phase: Phase;
  runtime: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  durationMs: number;
  estimated: boolean;
  error?: string;
}

export interface AgentState {
  id: string;
  status: AgentStatus;
  activity?: string;
  taskId?: string;
  subtaskId?: string;
  phase?: Phase;
  runtime?: string;
  since: string;
}

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  kind: string;
  msg: string;
  taskId?: string;
  subtaskId?: string;
  agentId?: string;
  department?: string;
  projectId?: string;
  phase?: Phase;
  data?: Record<string, unknown>;
}

export interface NewTaskInput {
  brief: string;
  title?: string;
  mode?: TaskMode;
  department?: string;
  projectId?: string;
  options?: Partial<TaskOptions>;
}

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, calls: 0, estimatedCalls: 0 };
}

export function addUsage(target: Usage, u: Partial<Usage> & { estimated?: boolean }): Usage {
  target.input += u.input ?? 0;
  target.output += u.output ?? 0;
  target.cacheRead += u.cacheRead ?? 0;
  target.cacheWrite += u.cacheWrite ?? 0;
  target.costUsd += u.costUsd ?? 0;
  target.calls += u.calls ?? 1;
  if (typeof u.estimatedCalls === 'number') target.estimatedCalls += u.estimatedCalls;
  else if (u.estimated) target.estimatedCalls += 1;
  return target;
}

export function totalTokens(u: Pick<Usage, 'input' | 'output' | 'cacheRead' | 'cacheWrite'>): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}
