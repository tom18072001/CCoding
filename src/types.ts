// Kiểu dữ liệu dùng chung cho toàn bộ CCoding.

export type Role = 'lead' | 'member' | 'reviewer' | 'router';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type TaskMode = 'auto' | 'department' | 'project' | 'joint';
export type Phase = 'route' | 'plan' | 'discuss' | 'finalize' | 'execute' | 'review' | 'revise' | 'synthesize';
export type TaskStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
/** pause: chạm trần thì tạm dừng chờ quyết định · complete: chạy tới khi hoàn thành (chấp nhận vượt trần, chỉ cảnh báo). */
export type BudgetMode = 'pause' | 'complete';
/** Quyền công cụ của agent trong thư mục làm việc: không · chỉ đọc · đọc/ghi file · đọc/ghi + chạy lệnh. */
export type ToolAccess = 'none' | 'read' | 'write' | 'exec';
export type ToolName = 'list_files' | 'read_file' | 'search' | 'write_file' | 'edit_file' | 'run_command' | 'search_papers' | 'web_search' | 'fetch_url';
/** Nhóm lỗi runtime — quyết định có chuyển sang tài nguyên khác hay không. */
export type ErrorKind = 'quota' | 'rate' | 'auth' | 'transient' | 'timeout' | 'model' | 'context' | 'empty' | 'fatal';
export type SubtaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'discussing' | 'reviewing' | 'waiting' | 'error';

export interface AgentLook { hair: string; shirt: string; skin: string }

export interface AgentDef {
  id: string;
  /** Tên vị trí (role), ví dụ "Backend Developer". */
  name: string;
  /** Nhãn ngắn hiển thị trên sơ đồ văn phòng, ví dụ "Backend". */
  short: string;
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
  budgetMode?: BudgetMode;
  /** Quyền công cụ của agent trong workspace dự án (mặc định theo cấu hình tools.projectAccess). */
  toolAccess?: ToolAccess;
  /** "worktree": nếu workspace là repo git, mỗi nhiệm vụ làm trên git worktree + nhánh ccoding/<task> riêng. */
  isolation?: 'none' | 'worktree';
  /** Điểm xuất phát của nhánh worktree (vd. origin/main); mặc định HEAD hiện tại của repo. */
  baseRef?: string;
  /** File chưa track (vd. .env) cần chép vào worktree để chạy test/migration ([] = không chép gì). */
  worktreeCopy?: string[];
  /** Mẫu regex lệnh bị cấm riêng cho dự án (vd. container/cổng DB của môi trường đang chạy). */
  denyCommands?: string[];
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

export interface ToolPolicy {
  /** Thư mục gốc agent được làm việc (đọc/ghi) — mọi đường dẫn bị giới hạn trong đây. */
  root: string;
  allow: ToolName[];
  maxTurns: number;
  /** Trần token đầu vào cộng dồn của cả vòng lặp công cụ trong một lượt gọi (mỗi lượt gửi lại toàn bộ lịch sử). */
  maxInputTokens?: number;
  commandTimeoutSec: number;
  maxOutputChars: number;
  /** Mẫu regex lệnh bị cấm (bổ sung cho danh sách mặc định). */
  denyCommands: string[];
  /** Cho phép git commit (chỉ khi làm trên nhánh/worktree riêng). */
  allowGitCommit: boolean;
}

export interface ToolCallRecord {
  name: string;
  args: string;
  ok: boolean;
  ms: number;
  outputChars: number;
  error?: string;
}

export interface RunRequest {
  agent: AgentDef;
  phase: Phase;
  /** Hồ sơ vị trí (agent.md) + quy tắc chung của văn phòng. */
  system: string;
  /** Bối cảnh chung của nhiệm vụ (giống nhau giữa các agent trong cùng pha) — đặt đầu prompt để tận dụng cache. */
  context?: string;
  /** Nội dung công việc riêng của lượt gọi này. */
  prompt: string;
  model: string;
  cwd: string;
  tools: string[];
  allowTools: boolean;
  timeoutMs: number;
  /** Giới hạn token đầu ra của lượt gọi (theo pha). */
  maxTokens?: number;
  /** Công cụ workspace (đọc/ghi file, chạy lệnh) cho runtime API có vòng lặp tool. */
  toolPolicy?: ToolPolicy;
  /** Che bí mật/PII trong kết quả công cụ trước khi gửi lại cho model (runtime bên ngoài). */
  redact?: { secrets: boolean; pii: boolean };
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
  errorKind?: ErrorKind;
  /** Lý do dừng của model (stop, length, tool_calls…). */
  finishReason?: string;
  /** Đầu ra bị cắt do chạm giới hạn max_tokens. */
  truncated?: boolean;
  turns?: number;
  /** Thời điểm tài nguyên mở lại (khi lỗi hết hạn mức). */
  retryAt?: number;
  toolCalls?: ToolCallRecord[];
  /** Chẩn đoán khi đầu ra rỗng/lạ (không chứa nội dung bí mật). */
  diag?: string;
  /** Vòng lặp công cụ bị dừng vì hết lượt ('turns') hoặc hết trần token đầu vào ('input') — sản phẩm có thể còn dang dở. */
  capped?: 'turns' | 'input';
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
  /** Bản trước khi chạy lại hạng mục (vd. bản nháp văn bản cần áp dụng vào repo). */
  draft?: string;
  summary?: string;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  usage: Usage;
  error?: string;
  /** Mốc cảnh báo ngân sách riêng của hạng mục đã phát (100, 200, … % phần ngân sách của hạng mục). */
  budgetAlerted?: number;
  /** Lần chạy đã cảnh báo (≥ 3: vòng sửa có thể không tiến triển). */
  attemptAlerted?: number;
  /** Nhiệm vụ mới được tách ra từ hạng mục này. */
  splitTo?: string;
  /** Số lần chạy tiếp (ngữ cảnh mới) sau khi chạm trần công cụ khi chưa xong. */
  continuations?: number;
}

export interface ReviewIssue { subtask: string; severity: 'blocker' | 'major' | 'minor'; comment: string }

/** Lệnh kiểm tra reviewer đã chạy (bằng chứng cho kết luận review). */
export interface ReviewCheck { command: string; exitCode?: number; ok?: boolean; note?: string }

/** Mốc đã hoàn thành của một phòng — dùng để tiếp tục từ checkpoint. */
export type RunStage = 'planned' | 'finalized' | 'executed' | 'reviewed' | 'done';

export interface DeptRun {
  department: string;
  status: 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
  stage?: RunStage;
  phase?: Phase;
  planSummary?: string;
  decisions?: string;
  subtasks: Subtask[];
  review?: {
    approved: boolean;
    summary: string;
    issues: ReviewIssue[];
    /** Lệnh kiểm tra reviewer khai báo + lệnh thực sự chạy qua công cụ. */
    checks?: ReviewCheck[];
    /** false: reviewer có quyền chạy lệnh nhưng không chạy lệnh nào → kết luận chưa có bằng chứng chạy thật. */
    verified?: boolean;
  };
  /** Ước lượng token của kế hoạch (sau khi lập/chốt) để cảnh báo nhiệm vụ quá lớn. */
  estimate?: { tokens: number; budget: number; at: string };
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
  budgetMode: BudgetMode;
  runtime?: string;
  /** Trần token của MỖI hạng mục (cộng dồn mọi lần chạy/sửa); 0 hoặc bỏ trống = tự tính (2 × ngân sách / số hạng mục). */
  subtaskBudgetTokens?: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  kind: string;
  chars: number;
  /** Tương đối data/runs/<task>/ — file gốc và bản chữ đã trích xuất. */
  path: string;
  textPath?: string;
  note?: string;
}

export interface Alert {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'error';
  kind: string;
  title: string;
  msg: string;
  taskId?: string;
  runtime?: string;
}

export interface PauseInfo {
  reason: 'budget' | 'quota' | 'interrupted' | 'manual';
  detail: string;
  at: string;
  /** Tự tiếp tục lúc này (khi hết thời gian chờ quota). */
  resumeAt?: string;
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
  attachments?: Attachment[];
  pause?: PauseInfo;
  /** Mốc cảnh báo ngân sách đã phát (80, 100). */
  budgetAlerted?: number;
  /** Thư mục làm việc thực tế (worktree) và nhánh git của nhiệm vụ. */
  workspace?: string;
  branch?: string;
  /** Commit gốc khi tạo worktree — để thống kê thay đổi của agent. */
  baseRef?: string;
  /** Tóm tắt thay đổi git (diff --stat) và kết quả commit trên nhánh nhiệm vụ. */
  changes?: string;
  commit?: string;
  resumes?: number;
  /** Nhiệm vụ gốc (khi được tách ra từ một hạng mục) và các nhiệm vụ đã tách ra từ nhiệm vụ này. */
  splitFrom?: { taskId: string; subtaskId: string };
  splitInto?: string[];
  /** Chỉ bắt đầu khi các nhiệm vụ này đã xong (thứ tự phụ thuộc giữa các nhiệm vụ đã tách). */
  after?: string[];
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
  /** Model đã yêu cầu (id trong cấu hình) — dùng đếm hạn mức theo ngày. */
  requestedModel?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  durationMs: number;
  estimated: boolean;
  toolCalls?: number;
  finishReason?: string;
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
  /** id các file đã tải lên (POST /api/uploads). */
  attachments?: string[];
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
