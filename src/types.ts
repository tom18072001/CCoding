// Kiểu dữ liệu dùng chung cho toàn bộ CCoding.
import type { AcceptMode, Slim } from './slim.js';
export type { AcceptMode, Slim } from './slim.js';

/** cto: nghiệm thu kết quả của các phòng sau khi tổng hợp (pha `accept`), không thuộc phòng ban làm việc nào. */
export type Role = 'lead' | 'member' | 'reviewer' | 'router' | 'cto';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
/** agent: giao việc riêng cho MỘT agent (bỏ định tuyến/lập kế hoạch/họp; vẫn review nếu bật). */
export type TaskMode = 'auto' | 'department' | 'project' | 'joint' | 'agent';
export type Phase = 'route' | 'plan' | 'discuss' | 'finalize' | 'execute' | 'review' | 'revise' | 'synthesize' | 'accept';
export type TaskStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
/** pause: chạm trần thì tạm dừng chờ quyết định · complete: chạy tới khi hoàn thành (chấp nhận vượt trần, chỉ cảnh báo). */
export type BudgetMode = 'pause' | 'complete';
/** Quyền công cụ của agent trong thư mục làm việc: không · chỉ đọc · đọc/ghi file · đọc/ghi + chạy lệnh. */
export type ToolAccess = 'none' | 'read' | 'write' | 'exec';
export type ToolName = 'list_files' | 'read_file' | 'search' | 'write_file' | 'edit_file' | 'run_command' | 'git_read' | 'search_papers' | 'web_search' | 'fetch_url';
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
  /** Ép làn xử lý cho mọi nhiệm vụ của dự án (B-02): 'auto' hoặc bỏ trống = không ép; options.lane của nhiệm vụ ưu tiên hơn. */
  lane?: 'auto' | 'single' | 'fast' | 'full';
  /** B-11: ghi đè công tắc làm gọn làn đơn cho dự án (thấp hơn options.slim của nhiệm vụ). */
  slim?: Partial<Slim>;
  /** Điểm xuất phát của nhánh worktree (vd. origin/main); mặc định HEAD hiện tại của repo. */
  baseRef?: string;
  /** File chưa track (vd. .env) cần chép vào worktree để chạy test/migration ([] = không chép gì). */
  worktreeCopy?: string[];
  /** Hạng mục chạy lệnh làm song song, mỗi hạng mục một worktree con (mặc định theo tools.parallelWorktrees); false = lần lượt. */
  parallelWorktrees?: boolean;
  /** Mọi nhiệm vụ của dự án chờ giám đốc duyệt kế hoạch trước khi thực thi (nhiệm vụ có thể ghi đè bằng options.planApproval). */
  planApproval?: boolean;
  /** Mẫu regex lệnh bị cấm riêng cho dự án (vd. container/cổng DB của môi trường đang chạy). */
  denyCommands?: string[];
  /** Lệnh chuẩn bị chạy một lần mỗi worktree trước lệnh kiểm tra (vd. cài dependency). */
  setupCommands?: string[];
  /** Lệnh kiểm tra CCoding tự chạy trước khi sửa, sau thực thi/sửa và đưa cho reviewer (vd. test, typecheck). */
  checkCommands?: string[];
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
  /** Trọng số token đọc từ cache khi so với maxInputTokens (mặc định 0,1 — cache đọc tính giá ~10% đầu vào thường). */
  cachedInputWeight?: number;
  commandTimeoutSec: number;
  maxOutputChars: number;
  /** Hạn mức ký tự riêng cho read_file (đọc trọn file mã nguồn cỡ vừa trong một lần); mặc định = maxOutputChars. */
  maxReadChars?: number;
  /** Mẫu regex lệnh bị cấm (bổ sung cho danh sách mặc định). */
  denyCommands: string[];
  /** Pha phải tạo sản phẩm bằng tệp (thực thi/sửa): chưa ghi tệp nào khi đã dùng ~1/3 lượt thì nhắc dừng khảo sát. */
  expectWrites?: boolean;
  /** Số lần đọc/tìm liên tiếp không ghi tệp: tới N thì nhắc ghi, tới 2N thì từ chối đọc thêm cho tới khi ghi (0 = tắt). */
  readsBeforeWrite?: number;
  /** Cho phép git commit (chỉ khi làm trên nhánh/worktree riêng). */
  allowGitCommit: boolean;
  /** Runtime CLI (claude-cli): công cụ shell chỉ để chạy git chỉ đọc — vai trò không có quyền chạy lệnh (tương ứng `git_read`). */
  gitReadOnly?: boolean;
  /** Tệp trạng thái của hook claude-guard trong lượt gọi này (đếm số lần đọc liên tiếp chưa ghi) — nằm trong data/runs/<task>/guard. */
  guardState?: string;
  /** Runtime CLI (claude-cli): cắt đầu ra lệnh shell ở N ký tự (biến BASH_MAX_OUTPUT_LENGTH của Claude Code); bỏ trống = mặc định của CLI. */
  bashMaxOutput?: number;
  /** B-08: công tắc hook claude-guard (config.guard) — undefined = mặc định bật. */
  guard?: { useEventCwd?: boolean; allowOwnToolResults?: boolean };
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
  /** Nhãn đường xác thực của claude-cli (apiKeySource, đã lọc — D4). Không bao giờ chứa khóa. */
  authSource?: string;
  /** claude-cli: nhãn xác thực là khóa API trong khi useApiKey không bật (để call() ghi cảnh báo). */
  authSourceUnexpected?: boolean;
  runtime: string;
  durationMs: number;
  error?: string;
  errorKind?: ErrorKind;
  /** Lý do dừng của model (stop, length, tool_calls…). */
  finishReason?: string;
  /** stop_reason nguyên văn của runtime khi có (api: stop_reason/finish_reason; claude-cli: stop_reason của sự kiện result/thông điệp cuối). */
  stopReason?: string;
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
  /** Prompt LỚN NHẤT trong các vòng của lượt gọi (token, gồm phần đọc từ cache) — để biết vòng nào sát/vượt cửa sổ ngữ cảnh. */
  maxPromptTokens?: number;
  /** false: runtime không ghi lại thao tác công cụ (vd. Codex CLI, Kimi CLI) — không biết agent đã chạy lệnh gì trong lượt này. */
  toolsTracked?: boolean;
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
  /** Header giới hạn tốc độ/hạn mức nhà cung cấp trả về ở lượt gọi gần nhất, theo model (không chứa khóa). */
  rateLimits?: Map<string, RateLimitInfo>;
}

export interface RateLimitInfo {
  at: string;
  status: number;
  /** Header x-ratelimit-* / ratelimit-* / retry-after nguyên văn. */
  headers: Record<string, string>;
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  /** Tên người nhận LLM viết nhưng không khớp roster (assignee đã rơi về agent khác) — cổng B báo. */
  assigneeUnmatched?: string;
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
  /** Lần chạy gần nhất dừng giữa chừng (đã ghi một phần vào workspace) — lần sau làm tiếp từ bàn giao dở dang thay vì làm lại. */
  incomplete?: boolean;
  /** Ghi chú bàn giao khi lượt gọi bị ngắt giữa vòng công cụ rồi nhiệm vụ tạm dừng (vd. chờ model nhanh) — lần chạy sau làm tiếp, không làm lại. */
  handover?: string;
  /** Chạy song song: worktree con riêng của hạng mục (tách từ nhánh nhiệm vụ) — CCoding commit rồi gộp vào nhánh nhiệm vụ khi xong. */
  /** `resolve`: worktree con này để GIẢI QUYẾT xung đột — CCoding đã `git merge <resolve>` (nhánh của lần làm trước) vào đây khi tách. */
  worktree?: { path: string; branch: string; base?: string; setup?: boolean; resolve?: string };
  /**
   * Làm lại trong worktree CHÍNH của nhiệm vụ, lần lượt (nhánh cũ giữ lại để agent tự merge) — chỉ còn là đường dự phòng: xung đột lặp
   * quá `tools.resolveRounds` lần, hoặc không tách/gộp được worktree con để giải quyết.
   */
  mainOnly?: boolean;
  /**
   * Lần gộp bị xung đột: nhánh của lần làm trước + tệp xung đột. `rounds`: số lần xung đột; `done`: lần trước đã làm xong (chỉ còn gộp);
   * `handover`: bàn giao dở dang của lần trước (nếu chưa xong) — ghép vào hướng dẫn giải quyết xung đột.
   */
  conflict?: { branch: string; files: string[]; rounds?: number; done?: boolean; handover?: string };
  /** Đã làm xong nhưng CCoding chưa commit/gộp được worktree con (hook, khóa index…) — gộp được ở lần sau thì coi là xong, không làm lại. */
  mergePending?: boolean;
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
  /** Làn nhanh: hạng mục kiểm thử riêng của người review được chuyển thành trọng tâm review (không nằm trên đường găng). */
  reviewFocus?: string;
  subtasks: Subtask[];
  review?: {
    approved: boolean;
    summary: string;
    issues: ReviewIssue[];
    /** FX4: không có review nào (tắt/không có reviewer) và không có lệnh kiểm tra — không có bằng chứng gì để duyệt. */
    skipped?: boolean;
    reason?: string;
    /** Lệnh kiểm tra reviewer khai báo + lệnh thực sự chạy qua công cụ. */
    checks?: ReviewCheck[];
    /** false: reviewer có quyền chạy lệnh nhưng không chạy lệnh nào → kết luận chưa có bằng chứng chạy thật. */
    verified?: boolean;
    /** 'director': kết luận do giám đốc (người dùng) quyết bằng tay — duyệt, hoặc yêu cầu sửa (chạy một vòng sửa + review lại). */
    by?: 'director';
    /**
     * Kết luận GỐC của reviewer trước khi CCoding can thiệp (vd. lệnh kiểm tra hồi quy → ép `approved=false`) — KPI dùng trường này
     * để chấm độ đúng của reviewer, vì `approved` có thể đã bị ép.
     */
    reviewerApproved?: boolean;
  };
  /** Vòng review hiện tại (0 = review đầu) — giữ qua tạm dừng/tiếp tục để không vượt maxRevisions. */
  reviewRound?: number;
  /** B-02: số vòng sửa của cổng chất lượng đã dùng (gồm sửa định dạng) — gate.maxFixRounds là ngân sách cho cả nhiệm vụ, lưu trước mỗi vòng. */
  gateFixRoundsUsed?: number;
  /** B-02: run đã nâng từ làn đơn lên fast/full — tiếp tục sau tạm dừng thì nạp lại LANE-HANDOVER.md vào `prior`. */
  escalatedFrom?: 'single';
  /** B-10: kết quả cổng phủ kế hoạch (sau parsePlan, trước execute). */
  planGate?: { uncovered: string[]; reasons: string[]; rules: ('A' | 'B' | 'brief-item')[]; replanned?: boolean };
  /** Hạng mục còn phải sửa trong vòng hiện tại — tiếp tục sau tạm dừng thì sửa tiếp theo review đã có, không review lại. */
  revising?: string[];
  /** Ước lượng token của kế hoạch (sau khi lập/chốt) để cảnh báo nhiệm vụ quá lớn. */
  estimate?: { tokens: number; budget: number; at: string; basis?: string; work?: number; criticalPathEstimate?: number; parallelism?: number };
  /** Duyệt kế hoạch trước khi thực thi: nhân sự được chọn (kèm năng lực công cụ) lúc chờ duyệt, ai/khi nào duyệt. */
  planReview?: {
    at: string;
    roster: Array<{ id: string; name: string; cap: string }>;
    approvedAt?: string;
    by?: 'director' | 'timeout';
    edits?: number;
    /** Đã cảnh báo ước tính so với ngân sách sau khi duyệt (chỉ một lần). */
    estimateChecked?: boolean;
  };
  finalPath?: string;
  usage: Usage;
  startedAt?: string;
  finishedAt?: string;
  /** Vòng bổ sung sau nghiệm thu (K3): id phòng của run gốc được làm tiếp. */
  followupOf?: string;
  /** Số thứ tự vòng bổ sung (1, 2…); run thường không có. */
  round?: number;
  /** Tiêu chí 'in' của vòng bổ sung (cổng kế hoạch và resume đọc lại). */
  followupCriteria?: { name: string; detail: string }[];
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
  /**
   * Biến thể tối ưu token chỉ cho nhiệm vụ này (benchtest — `ccoding bench`); bỏ trống = theo cấu hình. Đổi mặc định chỉ khi bench chứng minh.
   * `bashMaxOutput`: cắt đầu ra lệnh shell của claude-cli ở N ký tự (Claude Code mặc định 30.000; 0 = không đặt).
   * `repoMapMode`: bản đồ repo 'full' (cũ, ≤ 28k ký tự) hay 'compact' (≤ 6k + chỉ mục `repo-index.md` để tra).
   * `phaseModels`: model theo pha cho riêng nhiệm vụ, vd. `{ "synthesize": "sonnet" }` (ưu tiên hơn model theo agent của dự án).
   */
  bashMaxOutput?: number;
  repoMapMode?: 'full' | 'compact';
  phaseModels?: Partial<Record<Phase, string>>;
  /**
   * Nhãn lượt benchtest (`<bench>/<biến thể>#<lần>`). Đặt nhãn = nhiệm vụ đo đạc: không nhận lịch sử dự án, không vào lịch sử của
   * nhiệm vụ khác, không tự xóa góp ý trong hồ sơ agent — để mọi lượt cùng đầu vào.
   */
  variant?: string;
  /** Dừng sau khi chốt kế hoạch, chờ giám đốc duyệt (sửa người làm/phụ thuộc/bỏ hạng mục) rồi mới thực thi. */
  planApproval?: boolean;
  /**
   * Làn xử lý: 'fast' — việc nhỏ: điều phối lập kế hoạch nhanh (Sonnet), chia 2–4 phần độc lập chạy SONG SONG, không họp, báo cáo theo
   * mẫu (không gọi model); 'full' — quy trình đầy đủ; 'auto' (mặc định) — tự chọn theo cỡ đề bài và repo (cấu hình `fastLane`).
   */
  lane?: 'auto' | 'single' | 'fast' | 'full';
  /** CTO nghiệm thu sau khi các phòng tổng hợp xong (mặc định theo cấu hình; việc giao riêng một agent thì bỏ qua). */
  acceptance?: boolean;
  /** B-11: ghi đè công tắc làm gọn làn đơn cho riêng nhiệm vụ (ưu tiên cao nhất, xem src/slim.ts). */
  slim?: Partial<Slim>;
}

export interface AcceptanceCriterion {
  name: string;
  result: 'pass' | 'fail' | 'unknown';
  evidence: string;
  /** Tiêu chí fail/unknown: in = phòng tự làm tiếp được; decision = cần giám đốc/người ngoài/quyền mới (thiếu = decision). */
  scope?: 'in' | 'decision';
}

export interface Acceptance {
  at: string;
  by: string;
  /** Mọi tiêu chí đạt (đọc được kết luận). */
  accepted: boolean;
  /** Đọc được khối JSON kết luận của CTO. */
  parsed: boolean;
  /** B-11: chế độ nghiệm thu đã dùng ở làn đơn (bỏ trống = full). */
  mode?: AcceptMode;
  summary: string;
  criteria: AcceptanceCriterion[];
  risks: string[];
  followUps: Array<{ title: string; brief: string; department?: string }>;
  /** Tệp ACCEPTANCE.md trong thư mục chạy của nhiệm vụ. */
  path?: string;
  /** Dấu vân tay báo cáo tổng hợp lúc nghiệm thu — báo cáo viết lại thì nghiệm thu lại. */
  sig: string;
  error?: string;
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
  /** plan: kế hoạch đã chốt, chờ giám đốc duyệt trước khi thực thi (tùy chọn planApproval). */
  /** backlog (UI-8): giám đốc xếp vào backlog — chưa chạy cho tới khi chuyển sang "Chờ chạy". */
  reason: 'budget' | 'quota' | 'interrupted' | 'manual' | 'plan' | 'backlog';
  detail: string;
  at: string;
  /** Tự tiếp tục lúc này (khi hết thời gian chờ quota). */
  resumeAt?: string;
  /** Số lần tạm dừng liên tiếp cùng lý do "không còn runtime" — để giãn thời gian tự tiếp tục rồi dừng hẳn. */
  streak?: number;
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export const TASK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

export interface Task {
  id: string;
  /** UI-7: mức ưu tiên do giám đốc đặt (sắp xếp, lọc) — không ảnh hưởng thứ tự chạy. */
  priority?: TaskPriority;
  /** Số thứ tự nhiệm vụ (mã ngắn hiển thị `<tiền tố>-<seq>`, vd. CC-94) — gán lúc tạo, nhiệm vụ cũ được đánh số bù theo lúc tạo. */
  seq?: number;
  title: string;
  brief: string;
  mode: TaskMode;
  department?: string;
  projectId?: string;
  /** Chế độ "agent": agent nhận việc riêng. */
  agentId?: string;
  /** Số lần liên tiếp tạm dừng vì "không còn runtime" (tự tiếp tục giãn dần, quá 5 lần thì dừng hẳn). */
  noRuntimeStreak?: number;
  /** Số vòng bổ sung sau nghiệm thu đã mở (lưu bền, chống lặp vô hạn). */
  acceptFollowups?: number;
  /** Chỉ dẫn bổ sung người dùng gửi trong lúc nhiệm vụ chạy — đưa vào bối cảnh các lượt gọi sau. */
  notes?: Array<{ id: string; at: string; text: string }>;
  /** Nhiệm vụ này tiếp nối nhiệm vụ trước (giao việc tiếp nối từ màn hình nhiệm vụ). */
  followUpOf?: string;
  /** Do việc định kỳ này tạo (UX-4d). */
  routineId?: string;
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
  /** Worktree tách từ ref này thay cho nhánh xuất phát của dự án (việc nối làm tiếp trên nhánh của nhiệm vụ trước). */
  startFrom?: string;
  /** Lần đẩy nhánh gần nhất do giám đốc bấm (đẩy nhánh / đẩy vào nhánh xuất phát). */
  shipped?: Array<{ at: string; action: 'push' | 'ff'; ref: string; head: string }>;
  /** Tóm tắt thay đổi git (diff --stat) và kết quả commit trên nhánh nhiệm vụ. */
  changes?: string;
  commit?: string;
  resumes?: number;
  /** Nhiệm vụ gốc (khi được tách ra từ một hạng mục) và các nhiệm vụ đã tách ra từ nhiệm vụ này. */
  splitFrom?: { taskId: string; subtaskId: string };
  splitInto?: string[];
  /** Chỉ bắt đầu khi các nhiệm vụ này đã xong (thứ tự phụ thuộc giữa các nhiệm vụ đã tách). */
  after?: string[];
  /** Làn đã chọn khi bắt đầu chạy (xem TaskOptions.lane). */
  lane?: 'single' | 'fast' | 'full';
  /** Lệnh kiểm tra của dự án do CCoding tự chạy: trước khi sửa (baseline) và sau thực thi/sửa (latest). */
  projectChecks?: ProjectChecks;
  /** Nhiệm vụ đã chạy xong nhưng cần người xem lại (vd. review cuối chưa duyệt). */
  attention?: { reason: 'review' | 'checks' | 'acceptance' | 'plan-coverage' | 'plan-unreadable'; detail: string; at: string };
  /** Kết luận nghiệm thu của CTO sau khi các phòng tổng hợp xong (UX-4c). */
  acceptance?: Acceptance;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

/** Kết quả một lệnh kiểm tra của dự án (CCoding tự chạy, không qua agent). */
/** B-02: cổng chất lượng — số vòng sửa theo kiểm tra tối đa (tách khỏi maxRevisions của review). */
export interface GateConfig {
  maxFixRounds: number;
}

export interface CheckResult {
  command: string;
  code: number | null;
  ok: boolean;
  timedOut?: boolean;
  ms: number;
  /** Dòng tổng kết (số test pass/fail, lỗi…) trích từ đầu ra. */
  summary: string;
  /** Phần cuối đầu ra (đã cắt) để reviewer xem lỗi. */
  tail: string;
  /** Lệnh bị chặn theo chính sách an toàn (không chạy). */
  denied?: string;
}

export interface ProjectChecks {
  setupDone?: boolean;
  /** Dấu vân tay tệp khai báo phụ thuộc (package.json, lockfile…) lúc chạy lệnh chuẩn bị — đổi sau đó thì chạy lại lệnh chuẩn bị. */
  setupManifests?: Record<string, string>;
  setup?: CheckResult[];
  baseline?: CheckResult[];
  baselineAt?: string;
  latest?: CheckResult[];
  latestAt?: string;
  latestAfter?: 'execute' | 'revise';
  /** Workspace có thể đã đổi sau lần kiểm tra gần nhất (bắt đầu một lượt sửa) — review sau đó phải chạy lại lệnh kiểm tra. */
  staleAt?: string;
  /**
   * Kết quả theo phòng (các phòng chạy lần lượt trên cùng workspace): `before` = trạng thái ngay trước khi phòng này sửa (kết quả
   * gần nhất của phòng trước, hoặc baseline), `latest` = lần kiểm tra gần nhất do phòng này chạy. KPI gán kết quả thật theo phòng.
   * Không lưu `tail` (đầu ra) để task.json gọn.
   */
  depts?: Record<string, { before?: CheckResult[]; latest?: CheckResult[]; at?: string }>;
}

export interface ChatMessage {
  id: string;
  ts: string;
  taskId: string;
  department: string;
  from: string;
  kind: 'plan' | 'discussion' | 'decision' | 'handoff' | 'review' | 'final' | 'system' | 'note' | 'acceptance';
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
  /** Nhãn đường xác thực (claude-cli apiKeySource đã lọc). */
  authSource?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  durationMs: number;
  estimated: boolean;
  toolCalls?: number;
  finishReason?: string;
  /** stop_reason nguyên văn của runtime (khi runtime trả về). */
  stopReason?: string;
  /** Chạm trần vòng công cụ (lượt hết lượt/trần token đầu vào) — KPI ưu tiên trường này hơn regex trên diag. */
  turnCapped?: boolean;
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

/** Góp ý của người dùng (giám đốc) cho một agent — các góp ý đang bật được đưa vào hồ sơ của agent ở các lượt sau. */
export interface AgentFeedback {
  id: string;
  agentId: string;
  text: string;
  rating?: 'up' | 'down';
  taskId?: string;
  active: boolean;
  at: string;
  /** Tạo từ một mục "việc cần sửa" của KPI (khóa mục) — tự xóa khi mục đó đã sửa (đánh dấu tay hoặc tự hết). */
  finding?: string;
}

/** Prompt mẫu trong thư viện (data/prompts.json). */
export interface PromptDef {
  id: string;
  title: string;
  body: string;
  tags?: string[];
  /** Gợi ý cách giao khi chèn: chế độ / phòng / dự án / agent. */
  mode?: TaskMode;
  department?: string;
  projectId?: string;
  agentId?: string;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTaskInput {
  brief: string;
  title?: string;
  mode?: TaskMode;
  department?: string;
  projectId?: string;
  /** Chế độ "agent": id agent nhận việc riêng. */
  agentId?: string;
  /** Giao việc tiếp nối nhiệm vụ này: kế thừa chế độ/dự án/agent, báo cáo trước vào inputs/NHIEM-VU-TRUOC.md. */
  followUp?: string;
  /** Việc nối: worktree mới tách từ NHÁNH của nhiệm vụ trước (làm tiếp trên kết quả chưa gộp) thay vì nhánh xuất phát của dự án. Mặc định: có khi nhánh trước còn. */
  continueBranch?: boolean;
  options?: Partial<TaskOptions>;
  /** id các file đã tải lên (POST /api/uploads). */
  attachments?: string[];
  /** Tạo bởi việc định kỳ này (UX-4d) — chỉ bộ lập lịch đặt, API giao việc bỏ qua. */
  routineId?: string;
  /** UI-8: tạo vào backlog (tạm dừng lý do "backlog", không vào hàng đợi). */
  backlog?: boolean;
  /** Việc định kỳ do giám đốc bấm "Chạy ngay" (không phải tới lịch) — để trang Kiểm toán ghi đúng người thao tác. */
  routineManual?: boolean;
}

/** Lịch của việc định kỳ — giờ theo đồng hồ máy chạy server. */
export interface RoutineSchedule {
  kind: 'daily' | 'weekly' | 'interval';
  /** HH:MM (daily, weekly). */
  time?: string;
  /** Thứ trong tuần (0 = Chủ nhật … 6 = Thứ bảy) — weekly. */
  days?: number[];
  /** Mỗi N giờ (1–168) — interval. */
  everyHours?: number;
}

/** Việc định kỳ: giao lại một nhiệm vụ mẫu theo lịch (UX-4d). */
export interface Routine {
  id: string;
  name: string;
  enabled: boolean;
  schedule: RoutineSchedule;
  template: Pick<NewTaskInput, 'brief' | 'title' | 'mode' | 'department' | 'projectId' | 'agentId' | 'options'>;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastTaskId?: string;
  /** Lần bỏ qua gần nhất (lần chạy trước chưa xong, lỡ lịch quá lâu, lỗi giao việc). */
  lastSkip?: { at: string; reason: string };
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
