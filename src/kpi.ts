import type { Config } from './config.js';
import type { Registry } from './registry.js';
import type { Store } from './store.js';
import type { AgentDef, ChatMessage, ProjectDef, Task, ToolAccess, ToolCallRecord } from './types.js';
import { shellReadsOnly, shellWrites } from './tools/shell-policy.js';
import { isCheckCommand, isNoMatch } from './tools/workspace.js';
import { readJsonl } from './util/fsx.js';

/**
 * KPI của sub-agent — chấm như nhân sự một phòng ban thật, dựa trên log đã ghi:
 *   calls.jsonl (mỗi lượt gọi: token, công cụ, lỗi, chẩn đoán, văn bản trả về), task.json (hạng mục, số lần chạy),
 *   transcript (mọi vòng review: lỗi blocker/major/minor theo hạng mục → người phụ trách).
 * Bốn nhóm điểm (0–100): Chất lượng (qua review lần đầu, ít blocker) · Hiệu quả (token/hạng mục so với đồng nghiệp, số lần làm lại)
 * · Tin cậy (lượt gọi hỏng, thao tác công cụ lỗi, chạm trần vòng công cụ) · Tuân thủ (đủ mục trong "Mẫu đầu ra" của agent.md,
 * có bằng chứng: lệnh kiểm chứng với agent chạy lệnh, nguồn DOI/URL với agent tra cứu).
 * v2 thêm Kết quả thật và Trung thực; điểm tổng = trung bình có trọng số (xem WEIGHTS) trên các nhóm có dữ liệu, co về mức trung tính
 * theo lượng bằng chứng. Kèm "việc cần sửa" sinh tự động theo ngưỡng. Chi tiết: docs/KPI.md.
 */

export interface CallRow {
  ts: string;
  callId: string;
  taskId: string;
  subtaskId?: string;
  department: string;
  agentId: string;
  phase: string;
  runtime: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite?: number;
  durationMs: number;
  error?: string;
  errorKind?: string;
  attempts?: Array<{ kind: string; ms?: number }>;
  turns?: number;
  /** Cắt thật: runtime báo stop_reason max_tokens / finish length. Không suy ra từ output cộng dồn của claude-cli. */
  truncated?: boolean;
  /** Chạm trần vòng công cụ; bản ghi cũ chỉ có `diag` chứa "chạm trần". */
  turnCapped?: boolean;
  diag?: string;
  tools?: ToolCallRecord[];
  text?: string;
  /** Trần token đầu ra THỰC của lượt gọi (orchestrator ghi `req.maxTokens`, không có thì theo runtime). */
  maxTokens?: number;
  /** Prompt lớn nhất trong các vòng công cụ của lượt (token) — runtime API ghi; thiếu thì ước lượng input / số vòng. */
  maxPrompt?: number;
  /** false: runtime không ghi thao tác công cụ (Codex/Kimi CLI) — không biết agent đã chạy lệnh gì. */
  toolsTracked?: boolean;
}

/**
 * [B-13] Tỉ lệ trúng cache của prompt: cacheRead / (cacheRead + cacheWrite + input). Mẫu số 0 (không có token prompt) → null,
 * giao diện ẩn ô. Chỉ dùng số token, không đụng nội dung prompt.
 */
export function cacheHit(u: { input?: number; cacheRead?: number; cacheWrite?: number }): number | null {
  const read = u.cacheRead ?? 0;
  const den = read + (u.cacheWrite ?? 0) + (u.input ?? 0);
  return den > 0 ? read / den : null;
}

export interface CacheBucket { calls: number; input: number; cacheRead: number; cacheWrite: number; hit: number | null }
export interface CacheStats extends CacheBucket { byPhase: Record<string, CacheBucket>; byRuntime: Record<string, CacheBucket> }
export interface CacheCallRow { callId: string; taskId: string; phase: string; runtime: string; model: string; input: number; cacheRead: number; cacheWrite: number; hit: number | null }

const newBucket = (): CacheBucket => ({ calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, hit: null });
const addBucket = (b: CacheBucket, r: Pick<CallRow, 'input' | 'cacheRead' | 'cacheWrite'>) => {
  b.calls++;
  b.input += r.input ?? 0;
  b.cacheRead += r.cacheRead ?? 0;
  b.cacheWrite += r.cacheWrite ?? 0;
};
const finishBucket = (b: CacheBucket) => void (b.hit = cacheHit(b));
export const newCacheStats = (): CacheStats => ({ ...newBucket(), byPhase: {}, byRuntime: {} });
export function addCacheCall(c: CacheStats, r: Pick<CallRow, 'input' | 'cacheRead' | 'cacheWrite' | 'phase' | 'runtime'>): void {
  addBucket(c, r);
  addBucket((c.byPhase[r.phase] ??= newBucket()), r);
  addBucket((c.byRuntime[r.runtime] ??= newBucket()), r);
}
export function finishCacheStats(c: CacheStats): CacheStats {
  finishBucket(c);
  for (const b of [...Object.values(c.byPhase), ...Object.values(c.byRuntime)]) finishBucket(b);
  return c;
}
/** Gộp các lượt gọi: tổng, theo pha, theo runtime và từng lượt (cũ nhất trước; chỉ token + tên model). */
export function cacheReport(calls: CallRow[]): CacheStats & { calls_: CacheCallRow[] } {
  const c = newCacheStats();
  const rows: CacheCallRow[] = [];
  for (const r of calls) {
    addCacheCall(c, r);
    rows.push({ callId: r.callId, taskId: r.taskId, phase: r.phase, runtime: r.runtime, model: r.model, input: r.input ?? 0, cacheRead: r.cacheRead ?? 0, cacheWrite: r.cacheWrite ?? 0, hit: cacheHit(r) });
  }
  return Object.assign(finishCacheStats(c), { calls_: rows });
}

export interface KpiSource {
  tasks: Task[];
  calls(taskId: string): CallRow[];
  transcript(taskId: string): ChatMessage[];
  project(id: string): ProjectDef | undefined;
  agent(id: string): AgentDef | undefined;
  /** Quyền công cụ thực tế của nhiệm vụ (để biết agent có được chạy lệnh không). */
  access(task: Task): ToolAccess;
  /**
   * (v2) Giới hạn của runtime cho một pha: cửa sổ ngữ cảnh (num_ctx của Ollama) và trần token đầu ra — để phát hiện prompt
   * vượt cửa sổ (Ollama cắt mất PHẦN ĐẦU prompt mà không báo lỗi) và đầu ra bị cắt. Không khai báo → bỏ qua hai chỉ số này.
   */
  limits?(runtime: string, phase: string): { contextWindow?: number; maxOut?: number };
}

/** (v2) Tùy chọn chấm: `by: 'agent-model'` tách KPI theo cặp agent × model (so sánh Ollama với model đám mây cho cùng vị trí). */
export interface KpiOptions {
  by?: 'agent' | 'agent-model';
}

export interface AgentKpi {
  agentId: string;
  name: string;
  department: string;
  role: string;
  tasks: number;
  calls: number;
  /** Lượt gọi hỏng do chính agent/đầu ra (rỗng, quá ngữ cảnh, lỗi khác) — tính vào KPI. */
  failedCalls: number;
  /** Lượt gọi hỏng do hạ tầng (hạn mức, giới hạn tốc độ, đăng nhập, mạng) — KHÔNG tính vào KPI của agent. */
  infraFailedCalls: number;
  failovers: number;
  phases: Record<string, number>;
  subtasks: number;
  attemptsAvg: number;
  attemptsMax: number;
  /** perSubtask: token của các lượt gắn với hạng mục (thực thi/sửa) chia cho số hạng mục — không tính lượt review/họp/lập kế hoạch. */
  tokens: { input: number; cache: number; output: number; total: number; subtaskWork: number; perSubtask: number };
  /** (B-13) Tỉ lệ trúng cache theo agent, pha, runtime. */
  cache?: CacheStats;
  durationSec: number;
  outTokPerSec?: number;
  /** shellReads: lệnh shell chỉ để đọc/tìm/liệt kê tệp (cat, grep, sed -n, ls…) — không tính test/build/git. */
  tools: { calls: number; failed: number; byName: Record<string, { n: number; failed: number }>; capHits: number; avgTurns: number; maxTurns: number; shellReads?: number };
  /** Lượt bị cắt THẬT theo trần token đầu ra (không gồm chạm trần vòng công cụ). */
  truncated: number;
  /** Lượt chạm trần vòng công cụ (--max-turns / toolTurns). */
  turnCapped: number;
  /** reviewed: hạng mục được review; firstPassOk: không bị blocker/major ở lần review đầu; finalClean: không còn blocker ở lần review cuối; blocker/major/minor: số lần bị nêu qua mọi vòng. */
  quality: { reviewed: number; firstPassOk: number; finalClean: number; blocker: number; major: number; minor: number; topIssues: string[] };
  compliance: { outputs: number; templateCoverage?: number; missing: Array<{ heading: string; count: number }>; summaryOk: number };
  evidence: { execEligible: number; execWithCommands: number; doi: number; urls: number; unverified: number; webCalls: number; /** sản phẩm của hạng mục không đòi nguồn ngoài (FX11) */ sourceExempt?: number };
  reviewer?: { reviews: number; issuesRaised: number; verified: number; checkable: number };
  /** Trưởng phòng: chịu trách nhiệm kết quả của phòng — budgetRatio = token thực tế / ngân sách các lượt phòng mình phụ trách. */
  lead?: { plans: number; planFallback: number; syntheses: number; budget?: number; used?: number; budgetRatio?: number };
  /** (v2) Khóa dòng KPI: agentId, hoặc `agentId@model` khi chấm theo agent × model. */
  key?: string;
  /** (v2) Model đã dùng (số lượt gọi theo model) — một agent có thể chạy nhiều model do chuyển runtime dự phòng. */
  models?: Record<string, number>;
  /**
   * (v2) Kết quả thật, không qua LLM: lệnh kiểm tra của dự án (trước/sau khi agent sửa) và nghiệm thu của CTO.
   * checks*: số nhiệm vụ agent có thực thi mà lệnh kiểm tra sau cùng: hồi quy (trước đạt → sau lỗi) / sửa được (trước lỗi → sau đạt) / vẫn lỗi / đạt.
   */
  outcome?: { tasks: number; checksPass: number; checksRegressed: number; checksFixed: number; checksStillFailing: number; acceptTasks: number; accepted: number; criteria: number; criteriaFailed: number; acceptUnmeasured?: number };
  /** (v2) Trung thực: sản phẩm khẳng định đã kiểm chứng (test/typecheck/build đạt…) — bao nhiêu khẳng định không có lệnh kiểm chứng thật trong lượt đó. */
  honesty?: { claims: number; unbacked: number; examples: string[]; unmeasured?: number };
  /** (v2) Sức chứa ngữ cảnh: lượt có prompt ≥ 85% / ≥ 98% cửa sổ của runtime, độ đầy lớn nhất (%). */
  context?: { known: number; nearLimit: number; overLimit: number; maxFillPct: number };
  /** (v2) Định dạng: kết luận review/nghiệm thu không đọc được JSON, sản phẩm rỗng. */
  format?: { reviewUnparsed: number; acceptUnparsed: number; emptyOutputs: number };
  /** (v2) Hiệu chỉnh của người review/nghiệm thu so với kết quả thật: duyệt nhưng lệnh kiểm tra lỗi / CTO không đạt. */
  calibration?: { decisions: number; falseApprovals: number; falseRejections: number };
  /** (v2) Lượng bằng chứng (max(hạng mục, sản phẩm) + max(review, quyết định duyệt) + nhiệm vụ có kết quả thật + kế hoạch) và độ tin cậy của điểm. */
  evidenceN?: number;
  confidence?: 'low' | 'medium' | 'high';
  /** (v2) Điểm trước khi co về mức trung tính theo lượng bằng chứng (điểm `score` đã co). */
  scoreRaw?: number;
  scores: { quality?: number; efficiency?: number; reliability?: number; compliance?: number; outcome?: number; honesty?: number };
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  /** "Việc cần sửa" còn hiệu lực (đã bỏ các mục đã sửa — đánh dấu tay hoặc tự hết). */
  findings: string[];
  /** Khóa ổn định của từng mục trong findings (cùng thứ tự) — để đánh dấu đã sửa / nhắc agent. */
  findingKeys: string[];
  /** Khóa các mục đã đánh dấu sửa nhưng tái diễn ở nhiệm vụ sau mốc đánh dấu. */
  recurred?: string[];
  /** Mục đã sửa: đánh dấu tay (manual) hoặc tự hết vì các nhiệm vụ gần nhất của agent không còn (auto). */
  resolved?: Array<{ key: string; text: string; how: 'manual' | 'auto'; at?: string; note?: string; detail?: string }>;
}

/** Mục "việc cần sửa" đã đánh dấu sửa: agentId → khóa → mốc. */
export type KpiResolutions = Record<string, Record<string, { at: string; note?: string }>>;

export const FINDING_LABELS: Record<string, string> = {
  'tools-fail': 'Thao tác công cụ lỗi nhiều',
  'cap-hits': 'Hay chạm trần vòng công cụ',
  attempts: 'Hạng mục phải chạy nhiều lần',
  template: 'Đầu ra thiếu mục trong "Mẫu đầu ra"',
  summary: 'Sản phẩm không mở đầu bằng "## Tóm tắt"',
  'exec-evidence': 'Có quyền chạy lệnh nhưng ít kiểm chứng',
  'shell-reads': 'Dùng run_command để đọc/tìm code',
  'no-sources': 'Không có nguồn kiểm chứng được',
  'review-quality': 'Chưa qua review / còn blocker',
  'failed-calls': 'Lượt gọi hỏng do đầu ra',
  infra: 'Lượt hỏng do hạ tầng',
  truncated: 'Đầu ra bị cắt thật (chạm trần token)',
  'turn-capped': 'Chạm trần vòng công cụ',
  tokens: 'Tốn token so với trung vị phòng',
  'reviewer-unverified': 'Review không kiểm chứng bằng công cụ',
  'plan-fallback': 'Kế hoạch không đúng định dạng JSON',
  budget: 'Phòng dùng quá ngân sách',
  'meeting-only': 'Chỉ tham gia họp',
  'unbacked-claims': 'Khẳng định đã kiểm chứng mà không chạy lệnh',
  'context-overflow': 'Prompt sát/vượt cửa sổ ngữ cảnh của runtime',
  'review-unparsed': 'Kết luận review/nghiệm thu không đúng định dạng',
  'false-approval': 'Duyệt nhưng kết quả thật không đạt',
  regression: 'Lệnh kiểm tra hồi quy sau khi sửa',
  'acceptance-fail': 'CTO nghiệm thu không đạt',
  'empty-output': 'Sản phẩm rỗng',
};

export interface KpiReport {
  generatedAt: string;
  tasks: Array<{ id: string; title: string; status: string; tokens: number }>;
  /** (B-13) Tỉ lệ trúng cache toàn báo cáo. */
  cache?: CacheStats;
  agents: AgentKpi[];
  departments: Array<{ id: string; agents: number; tokens: number; score: number; calls: number }>;
  method: string;
}

/**
 * v2: Kết quả thật (outcome) và Trung thực (honesty) chen vào; Chất lượng theo review giảm từ 40 → 25 vì reviewer cũng là LLM
 * (trên Ollama là model nhỏ — dễ duyệt dễ dãi). Nhóm không có dữ liệu vẫn bỏ qua, nhưng tổng trọng số có dữ liệu < 0,5 thì
 * điểm không vượt 79 (không xếp A khi chỉ chấm được một hai nhóm phụ).
 */
const WEIGHTS = { quality: 0.25, outcome: 0.2, efficiency: 0.15, reliability: 0.15, compliance: 0.1, honesty: 0.15 } as const;
/** Co điểm về mức trung tính theo lượng bằng chứng: điểm = (n·thô + K·PRIOR)/(n + K). */
const SHRINK_K = 3;
const PRIOR = 60;
/**
 * Khẳng định đã kiểm chứng trong sản phẩm (VI/EN) — chỉ các dạng báo KẾT QUẢ CHẠY (số test đạt, exit code, "đã chạy npm test … đạt",
 * "tất cả test đều pass", "typecheck: 0 lỗi"); mô tả ca kiểm thử ("test case: đăng nhập thành công") không tính. Lệnh trong dạng
 * "đã chạy <lệnh> … đạt" phải là lệnh KIỂM CHỨNG (test/typecheck/lint/build…) — "đã chạy npm install thành công" không phải.
 */
const CHECK_CMD = String.raw`(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck|type-check|lint|build|check|e2e|verify|ci:\w+)\b|npx\s+(?:tsc|vitest|jest|playwright|eslint)\b|node\s+--test|tsc\b|pytest|go\s+(?:test|vet|build)|cargo\s+(?:test|build|check|clippy)|dotnet\s+(?:test|build)|make\s+(?:test|check))`;
const CLAIM_RE = new RegExp(
  [
    String.raw`\b\d+\s*\/\s*\d+\s*(?:tests?\s*)?(?:pass(?:ed)?|đạt)`,
    String.raw`\b\d+\s+(?:tests?\s+)?passed\b|\ball\s+tests?\s+(?:are\s+)?pass(?:ed|ing)?\b`,
    String.raw`\bexit\s*code\s*[:=]?\s*0\b`,
    String.raw`(?:đã\s+chạy|chạy|ran|running)\s+[\x60"']?${CHECK_CMD}[^\n]{0,60}?(?:đạt|pass|ok\b|thành công|xanh|sạch|0 lỗi|no errors?)`,
    String.raw`(?:tất cả|toàn bộ|mọi)\s+(?:các\s+)?(?:bài\s+)?(?:test|kiểm thử)[^\n]{0,30}?(?:đều\s+)?(?:pass|đạt|xanh|thành công)`,
    String.raw`\b(?:typecheck|type-check|tsc|lint|build)\b[^\n]{0,20}?(?::|→|->|=)\s*(?:0 lỗi|0 errors?|ok\b|pass(?:ed)?|sạch|thành công)`,
    String.raw`✅\s*(?:test|typecheck|build|lint)`,
  ].join('|'),
  'i',
);
/** Câu phủ định/điều kiện ("chưa chạy test", "không thể chạy", "cần chạy test") không phải khẳng định — xét trong CÙNG vế câu với khẳng định. */
const CLAIM_NEG_RE = /chưa (?:thể )?(?:chạy|kiểm)|không (?:thể )?(?:chạy|kiểm)|không (?:chạy|kiểm) được|cần (?:chạy|kiểm)|hãy chạy|nên chạy|not run|didn'?t run|could ?n[o']t run|cannot run|can'?t run|unable to run|to verify|should pass|sẽ (?:đạt|pass)/i;
/** Tách vế câu: "14/14 đạt; cần chạy lại e2e" là hai vế — vế sau là việc còn lại, không phủ định vế trước. */
const CLAUSE_SPLIT = /;|(?<=[^\d\s])\.(?:\s|$)|\.\s+|!|\?|\s+(?:nhưng|but|tuy nhiên)\s+/i;
/** Runtime không ghi lại thao tác công cụ (bản ghi cũ chưa có trường `toolsTracked`). */
const UNTRACKED_RUNTIMES = /^(?:codex-cli|kimi-cli)$/;
type CheckKind = 'test' | 'typecheck' | 'lint' | 'build';
/** Loại kiểm chứng mà một khẳng định nói tới (rỗng = chung chung, vd. "exit code 0"). */
function claimKinds(claim: string): Set<CheckKind> {
  const k = new Set<CheckKind>();
  if (/\btests?\b|kiểm thử|\d+\s*\/\s*\d+|\bpassed\b|pytest|jest|vitest|e2e/i.test(claim)) k.add('test');
  if (/typecheck|type-check|\btsc\b/i.test(claim)) k.add('typecheck');
  if (/\blint\b|eslint/i.test(claim)) k.add('lint');
  if (/\bbuild\b/i.test(claim)) k.add('build');
  return k;
}
/** Loại của một lệnh kiểm chứng (một lệnh có thể thuộc nhiều loại, vd. `npm run ci:all`). */
function commandKinds(cmd: string): Set<CheckKind> {
  const k = new Set<CheckKind>();
  if (/\btest\b|jest|vitest|pytest|unittest|playwright|e2e|node\s+--test/i.test(cmd)) k.add('test');
  if (/\btsc\b|typecheck|type-check|mypy|go\s+vet/i.test(cmd)) k.add('typecheck');
  if (/\blint\b|eslint|clippy|ruff/i.test(cmd)) k.add('lint');
  if (/\bbuild\b|cargo\s+check|\bmvn\b|gradlew?/i.test(cmd)) k.add('build');
  return k;
}
/** Kết quả LẦN CHẠY CUỐI của từng loại kiểm chứng trong một lượt gọi (`any`: lần chạy cuối của bất kỳ lệnh kiểm chứng nào). */
function checkRuns(tools: ToolCallRecord[] | undefined): Map<CheckKind | 'any', boolean> {
  const m = new Map<CheckKind | 'any', boolean>();
  for (const tc of tools ?? []) {
    if (tc.name !== 'run_command' || !isCheckCommand(tc.args)) continue;
    m.set('any', tc.ok);
    for (const k of commandKinds(tc.args)) m.set(k, tc.ok);
  }
  return m;
}
/** Khẳng định có căn cứ: mỗi loại được khẳng định có lần chạy cuối THÀNH CÔNG (khẳng định chung chung: lệnh kiểm chứng cuối thành công). */
function claimBacked(claim: string, runs: Map<CheckKind | 'any', boolean>): boolean {
  const kinds = claimKinds(claim);
  if (!kinds.size) return runs.get('any') === true;
  return [...kinds].every((k) => runs.get(k) === true);
}
/** Lượt gọi có ghi tệp: công cụ ghi/sửa tệp, hoặc lệnh shell ghi (sed -i, >, tee…) / lệnh không chỉ đọc và không phải lệnh kiểm chứng. */
function writesFiles(tools: ToolCallRecord[] | undefined): boolean {
  return (tools ?? []).some(
    (tc) =>
      /^(?:write_file|edit_file|Write|Edit|MultiEdit|NotebookEdit|apply_patch)$/.test(tc.name) ||
      ((tc.name === 'run_command' || tc.name === 'Bash' || tc.name === 'PowerShell') && tc.ok && (shellWrites(tc.args) || (!shellReadsOnly(tc.args) && !isCheckCommand(tc.args)))),
  );
}
/** Tiêu chí nghiệm thu "unknown" chiếm quá tỉ lệ này → nghiệm thu không đo được (không tính vào Kết quả thật). */
const MAX_UNKNOWN_SHARE = 0.5;
/** Ghi chú CCoding thêm vào summary khi ép không duyệt bản reviewer đã duyệt (dữ liệu cũ chưa có `reviewerApproved`). */
const FORCED_REJECT_RE = /CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt/;
const ISSUE_RE = /^-\s*\[(blocker|major|minor)\]\s*([A-Za-z0-9._-]+)\s*:\s*(.+)$/;
const DOI_RE = /\b10\.\d{4,9}\/[^\s)\]>,;"']+/g;
const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
const UNVERIFIED_RE = /CHƯA[ -]?(KIỂM CHỨNG|KC)|\[CẦN NGUỒN\]|chưa kiểm chứng/gi;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[`*_#:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Tiêu đề mục trong "Mẫu đầu ra" của agent.md (dòng "## …" trong khối code của mục đó). */
export function templateHeadings(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^##\s+Mẫu đầu ra/.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  let inCode = false;
  for (const l of lines.slice(start + 1)) {
    if (/^```/.test(l)) {
      if (inCode) break; // hết khối mẫu
      inCode = true;
      continue;
    }
    if (!inCode && /^##\s+/.test(l)) break; // sang mục khác của hồ sơ (mẫu không nằm trong khối code)
    if (/^##\s+/.test(l)) out.push(l.replace(/^##\s+/, '').trim());
  }
  return out.filter(Boolean);
}

/** Khóa so khớp một mục mẫu: phần trước "(", "·", ":" hoặc "—". */
export function headingKey(h: string): string {
  return norm(h.split(/[(·:—<]/)[0]).slice(0, 28);
}

/** Tỉ lệ mục của mẫu có mặt trong đầu ra + các mục còn thiếu. */
export function templateCoverage(text: string, headings: string[]): { coverage: number; missing: string[] } {
  if (!headings.length) return { coverage: 1, missing: [] };
  const present = text
    .split('\n')
    .filter((l) => /^#{1,4}\s+/.test(l))
    .map((l) => norm(l.replace(/^#{1,4}\s+/, '')));
  const missing = headings.filter((h) => {
    const k = headingKey(h);
    return k.length > 2 && !present.some((p) => p.startsWith(k) || p.includes(k));
  });
  return { coverage: (headings.length - missing.length) / headings.length, missing };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Acc {
  k: AgentKpi;
  taskIds: Set<string>;
  turns: number[];
  coverage: number[];
  missing: Map<string, number>;
  issueTexts: string[];
  attempts: number[];
  outputs: number;
  /** v2: giá trị kết quả thật (0–1) mỗi nhiệm vụ agent tham gia thực thi / phụ trách. */
  outcomeVals: number[];
  /** v2: giây gọi của các lượt thực thi/sửa gắn hạng mục. */
  workSec: number;
}

const emptyKpi = (key: string, id: string, def: AgentDef | undefined, dept: string): AgentKpi => ({
  agentId: id,
  key,
  name: def?.name ?? id,
  department: def?.department ?? dept,
  role: def?.role ?? 'member',
  tasks: 0,
  calls: 0,
  failedCalls: 0,
  infraFailedCalls: 0,
  failovers: 0,
  phases: {},
  subtasks: 0,
  attemptsAvg: 0,
  attemptsMax: 0,
  tokens: { input: 0, cache: 0, output: 0, total: 0, subtaskWork: 0, perSubtask: 0 },
  cache: newCacheStats(),
  durationSec: 0,
  tools: { calls: 0, failed: 0, byName: {}, capHits: 0, avgTurns: 0, maxTurns: 0, shellReads: 0 },
  truncated: 0,
  turnCapped: 0,
  quality: { reviewed: 0, firstPassOk: 0, finalClean: 0, blocker: 0, major: 0, minor: 0, topIssues: [] },
  compliance: { outputs: 0, missing: [], summaryOk: 0 },
  evidence: { execEligible: 0, execWithCommands: 0, doi: 0, urls: 0, unverified: 0, webCalls: 0 },
  models: {},
  honesty: { claims: 0, unbacked: 0, examples: [], unmeasured: 0 },
  context: { known: 0, nearLimit: 0, overLimit: 0, maxFillPct: 0 },
  format: { reviewUnparsed: 0, acceptUnparsed: 0, emptyOutputs: 0 },
  scores: {},
  score: 0,
  grade: 'C',
  findings: [],
  findingKeys: [],
});

/** Câu khẳng định đã kiểm chứng đầu tiên trong văn bản (bỏ vế câu phủ định/điều kiện), hoặc undefined. */
export function verificationClaim(text: string): string | undefined {
  for (const line of text.split('\n')) {
    if (!CLAIM_RE.test(line)) continue;
    // phủ định chỉ có hiệu lực trong cùng vế câu với khẳng định
    if (line.split(CLAUSE_SPLIT).some((c) => c && CLAIM_RE.test(c) && !CLAIM_NEG_RE.test(c))) return line.trim().slice(0, 160);
  }
  return undefined;
}

/** Runtime có ghi lại thao tác công cụ của lượt gọi không (bản ghi cũ: suy từ tên runtime). */
function toolsTracked(r: CallRow): boolean {
  return r.toolsTracked ?? !UNTRACKED_RUNTIMES.test(r.runtime ?? '');
}

type ChecksResult = { pass: boolean; regressed: boolean; fixed: boolean; stillFailing: boolean };

/** Kết quả lệnh kiểm tra của dự án trước/sau khi sửa: đạt hết / hồi quy / sửa được / vẫn lỗi; undefined khi chưa chạy. */
export function checksOutcome(task: Pick<Task, 'projectChecks'>): ChecksResult | undefined {
  const latest = (task.projectChecks?.latest ?? []).filter((c) => !c.denied);
  if (!latest.length) return undefined;
  const base = new Map((task.projectChecks?.baseline ?? []).filter((c) => !c.denied).map((c) => [c.command, c.ok]));
  let regressed = false;
  let fixed = false;
  for (const c of latest) {
    const b = base.get(c.command);
    if (b === true && !c.ok) regressed = true;
    if (b === false && c.ok) fixed = true;
  }
  const pass = latest.every((c) => c.ok);
  return { pass, regressed, fixed, stillFailing: !pass && !regressed };
}

/**
 * Kết quả lệnh kiểm tra theo phòng: `projectChecks.depts` (orchestrator ghi trạng thái trước/sau của từng phòng). Dữ liệu cũ không
 * có trường này: nhiệm vụ một phòng thì dùng kết quả chung; nhiều phòng thì không gán được (không đoán).
 */
export function checksByDept(task: Pick<Task, 'projectChecks' | 'runs'>): Map<string, ChecksResult> {
  const out = new Map<string, ChecksResult>();
  const pc = task.projectChecks;
  if (pc?.depts) {
    for (const [dept, x] of Object.entries(pc.depts)) {
      const c = checksOutcome({ projectChecks: { baseline: x.before, latest: x.latest } });
      if (c) out.set(dept, c);
    }
    return out;
  }
  const depts = new Set(task.runs.map((r) => r.department));
  const c = checksOutcome(task);
  if (c && depts.size === 1) out.set([...depts][0], c);
  return out;
}

export function computeKpi(src: KpiSource, opts: KpiOptions = {}): KpiReport {
  const byModel = opts.by === 'agent-model';
  const acc = new Map<string, Acc>();
  const keyOf = (id: string, model?: string) => (byModel ? `${id}@${model || '?'}` : id);
  const fresh = (key: string, id: string, dept: string): Acc => ({ k: emptyKpi(key, id, src.agent(id), dept), taskIds: new Set(), turns: [], coverage: [], missing: new Map(), issueTexts: [], attempts: [], outputs: 0, outcomeVals: [], workSec: 0 });
  const get = (id: string, dept: string, model?: string): Acc => {
    // tách theo model mà không biết model (hạng mục chưa từng chạy, agent không có lượt gọi nào trong nhiệm vụ): không tạo dòng
    // ma "agent@?" — dữ liệu này không gán được cho model nào nên bỏ (bảng theo agent vẫn tính)
    if (byModel && !model) return fresh(`${id}@?`, id, dept);
    const key = keyOf(id, model);
    let a = acc.get(key);
    if (!a) {
      a = fresh(key, id, dept);
      acc.set(key, a);
    }
    return a;
  };

  const allCache = newCacheStats();
  const taskRows: KpiReport['tasks'] = [];
  /** Ngân sách và token thực tế theo phòng (để chấm trưởng phòng: kế hoạch có vừa ngân sách không). */
  const deptBudget = new Map<string, { budget: number; used: number }>();
  for (const task of src.tasks) {
    for (const run of task.runs) {
      const b = deptBudget.get(run.department) ?? { budget: 0, used: 0 };
      b.budget += task.options.budgetTokens / Math.max(1, task.runs.length);
      b.used += run.usage.input + run.usage.output + run.usage.cacheRead + (run.usage.cacheWrite ?? 0);
      deptBudget.set(run.department, b);
    }
    const calls = src.calls(task.id);
    const transcript = src.transcript(task.id);
    const exec = src.access(task) === 'exec';
    const checks = checksOutcome(task);
    const deptChecks = checksByDept(task);
    /** Nhiệm vụ chạy xong (không hủy/lỗi/dở dang) mới tính Kết quả thật và hiệu chỉnh người duyệt — kết quả giữa chừng không đại diện. */
    const finished = task.status === 'done';
    let tokens = 0;
    /** model của lượt thực thi/sửa cuối mỗi hạng mục, của lượt review/nghiệm thu cuối mỗi agent (để gán theo agent × model). */
    const subModel = new Map<string, string>();
    const roleModel = new Map<string, string>();
    /** model của lượt gọi gần nhất của mỗi agent trong nhiệm vụ — dự phòng khi không biết model của vai trò/hạng mục cụ thể */
    const lastModel = new Map<string, string>();
    for (const r of calls) if (r.agentId && r.model) lastModel.set(r.agentId, r.model);
    const modelOf = (kind: string, id: string) => roleModel.get(`${kind}:${id}`) ?? lastModel.get(id);
    /** người thực thi (khóa KPI) của nhiệm vụ → phòng, có ghi tệp không, có lượt runtime không ghi công cụ không (không biết đã ghi gì). */
    const executors = new Map<string, { depts: Set<string>; wrote: boolean; untracked: boolean }>();
    const outs = new Map<string, { agentId: string; department: string; model: string; text: string; executed: boolean; ranCheck: boolean; lastRuns: Map<CheckKind | 'any', boolean>; tracked: boolean; noExternal: boolean }>();
    const subtaskText = new Map<string, string>();
    for (const run of task.runs ?? []) for (const st of run.subtasks ?? []) subtaskText.set(st.id, `${st.title ?? ''} ${st.description ?? ''} ${st.deliverable ?? ''}`);
    // ── lượt gọi ──
    for (const r of calls) {
      if (!r.agentId) continue;
      const a = get(r.agentId, r.department, r.model || r.runtime);
      const k = a.k;
      a.taskIds.add(task.id);
      k.calls++;
      k.models![r.model || '?'] = (k.models![r.model || '?'] ?? 0) + 1;
      k.phases[r.phase] = (k.phases[r.phase] ?? 0) + 1;
      const failed = !!r.error && !r.text;
      if (failed) {
        if (isInfra(r)) k.infraFailedCalls++;
        else k.failedCalls++;
      }
      k.failovers += (r.attempts ?? []).length;
      k.tokens.input += r.input ?? 0;
      k.tokens.cache += r.cacheRead ?? 0;
      k.tokens.output += r.output ?? 0;
      addCacheCall(k.cache!, r);
      addCacheCall(allCache, r);
      const work = !!r.subtaskId && (r.phase === 'execute' || r.phase === 'revise');
      if (work) {
        k.tokens.subtaskWork += (r.input ?? 0) + (r.cacheRead ?? 0) + (r.output ?? 0);
        a.workSec += (r.durationMs ?? 0) / 1000;
        subModel.set(`${r.department}:${r.subtaskId}`, r.model);
        const ex = executors.get(keyOf(r.agentId, r.model)) ?? { depts: new Set<string>(), wrote: false, untracked: false };
        ex.depts.add(r.department);
        if (writesFiles(r.tools)) ex.wrote = true;
        if (!toolsTracked(r)) ex.untracked = true;
        executors.set(keyOf(r.agentId, r.model), ex);
      }
      if (r.phase === 'review' || r.phase === 'accept' || r.phase === 'plan') roleModel.set(`${r.phase}:${r.agentId}`, r.model);
      tokens += (r.input ?? 0) + (r.cacheRead ?? 0) + (r.output ?? 0) + (r.cacheWrite ?? 0);
      k.durationSec += (r.durationMs ?? 0) / 1000;
      const lim = src.limits?.(r.runtime, r.phase) ?? {};
      // đầu ra bị cắt: theo max_tokens THỰC của lượt (orchestrator ghi trong bản ghi), không có thì theo cấu hình runtime/pha;
      // không biết thì giữ heuristic cũ (8k/64k)
      const maxOut = Number(r.maxTokens) || lim.maxOut;
      // `truncated` = cắt thật. claude-cli không áp max_tokens và CỘNG DỒN output của mọi vòng công cụ, nên tỉ số output/maxTokens
      // vô nghĩa với nó (và với lượt nhiều vòng): chỉ suy từ tỉ số cho lượt một vòng, không công cụ, runtime có áp trần,
      // và chỉ khi bản ghi không có cờ `truncated` (bản ghi cũ).
      const accumulates = r.runtime === 'claude-cli' || (r.turns ?? 1) > 1;
      const atCap = maxOut ? (r.output ?? 0) >= 0.98 * maxOut : (r.output === 8000 || r.output === 64000);
      const inferred = r.truncated === undefined && !accumulates && !!r.output && atCap && !r.tools?.length && r.phase !== 'plan';
      if (r.truncated === true || inferred) k.truncated++;
      if (r.turnCapped === true || (r.diag && /chạm trần/.test(r.diag))) k.turnCapped++;
      if (lim.contextWindow) {
        // prompt của MỘT vòng model: prompt lớn nhất mà runtime ghi (maxPrompt) — Ollama cắt đầu prompt ở vòng vượt cửa sổ, nên
        // phải xét vòng LỚN NHẤT. Bản ghi cũ không có maxPrompt: lượt một vòng = cả prompt; nhiều vòng = input / số vòng (ước lượng
        // thấp — vòng cuối thường lớn hơn trung bình)
        const prompt = (r.input ?? 0) + (r.cacheRead ?? 0) + (r.cacheWrite ?? 0);
        const fill = (Number(r.maxPrompt) || (r.turns && r.turns > 1 ? prompt / r.turns : prompt)) / lim.contextWindow;
        const c = k.context!;
        c.known++;
        c.maxFillPct = Math.max(c.maxFillPct, Math.round(fill * 100));
        if (fill >= 0.98) c.overLimit++;
        else if (fill >= 0.85) c.nearLimit++;
      }
      if (r.diag && /chạm trần/.test(r.diag)) k.tools.capHits++;
      if (r.turns && r.turns > 1) a.turns.push(r.turns);
      for (const tc of r.tools ?? []) {
        k.tools.calls++;
        const b = (k.tools.byName[tc.name] ??= { n: 0, failed: 0 });
        b.n++;
        if (tc.name === 'run_command' && shellReadsOnly(tc.args)) k.tools.shellReads = (k.tools.shellReads ?? 0) + 1;
        if (!tc.ok && !isNoMatch(tc)) {
          k.tools.failed++;
          b.failed++;
        }
        if (tc.name === 'search_papers' || tc.name === 'web_search' || tc.name === 'fetch_url') k.evidence.webCalls++;
      }
      // sản phẩm rỗng: lượt thực thi/sửa gần như không có chữ VÀ không ghi tệp (kể cả ghi bằng run_command: sed -i, cat >, git apply…)
      if ((r.phase === 'execute' || r.phase === 'revise') && !r.error && (r.text ?? '').trim().length < 20 && !writesFiles(r.tools))
        k.format!.emptyOutputs++;
      // sản phẩm (thực thi/sửa; báo cáo tổng hợp của trưởng phòng) — tuân thủ mẫu đầu ra & bằng chứng chấm trên BẢN CUỐI
      // của mỗi hạng mục: thiếu mục / chưa chạy lệnh kiểm chứng ở lần đầu nhưng đã sửa ở vòng sau thì không còn bị tính
      if ((r.phase === 'execute' || r.phase === 'revise' || r.phase === 'synthesize') && r.text) {
        const key = `${r.agentId}|${r.phase === 'synthesize' ? 'synth' : r.subtaskId || r.callId}`;
        const o = outs.get(key) ?? { agentId: r.agentId, department: r.department, model: r.model, text: '', executed: false, ranCheck: false, lastRuns: new Map(), tracked: true, noExternal: false };
        o.text = r.text;
        o.model = r.model;
        if (r.phase === 'execute') o.executed = true;
        // căn cứ của bản cuối: kết quả các lệnh kiểm chứng trong CHÍNH lượt viết bản cuối (lỗi ≠ có căn cứ)
        o.lastRuns = checkRuns(r.tools);
        o.tracked = toolsTracked(r);
        o.noExternal = noExternalSources(subtaskText.get(r.subtaskId ?? ''), r.tools);
        if (o.lastRuns.has('any')) o.ranCheck = true;
        outs.set(key, o);
      }
      if (r.phase === 'review' && r.text) {
        const rv = (k.reviewer ??= { reviews: 0, issuesRaised: 0, verified: 0, checkable: 0 });
        rv.reviews++;
        const def = src.agent(r.agentId);
        // kiểm chứng được: có quyền chạy lệnh trong repo, hoặc đã có công cụ (đọc tệp/tra nguồn) trong lượt review
        const canRun = exec && (def?.tools ?? []).some((t) => t.toLowerCase() === 'bash');
        const used = r.tools ?? [];
        if (canRun || used.length) rv.checkable++;
        if (canRun ? used.some((tc) => tc.name === 'run_command' && isCheckCommand(tc.args)) : used.some((tc) => ['fetch_url', 'search_papers', 'web_search', 'read_file', 'list_files', 'search'].includes(tc.name))) rv.verified++;
      }
      if (r.phase === 'plan') (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).plans++;
      if (r.phase === 'synthesize' && r.text) (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).syntheses++;
    }
    for (const o of outs.values()) {
      const a = get(o.agentId, o.department, o.model);
      const k = a.k;
      a.outputs++;
      const def = src.agent(o.agentId);
      const heads = def ? templateHeadings(def.body) : [];
      const cov = templateCoverage(o.text, heads);
      a.coverage.push(cov.coverage);
      for (const m of cov.missing) a.missing.set(m, (a.missing.get(m) ?? 0) + 1);
      if (/^#{1,3}\s*Tóm tắt/im.test(o.text)) k.compliance.summaryOk++;
      k.evidence.doi += new Set(o.text.match(DOI_RE) ?? []).size;
      k.evidence.urls += new Set(o.text.match(URL_RE) ?? []).size;
      k.evidence.unverified += (o.text.match(UNVERIFIED_RE) ?? []).length;
      if (o.noExternal) k.evidence.sourceExempt = (k.evidence.sourceExempt ?? 0) + 1;
      const canRun = exec && (def?.tools ?? []).some((t) => t.toLowerCase() === 'bash');
      if (canRun && o.executed) {
        k.evidence.execEligible++;
        if (o.ranCheck) k.evidence.execWithCommands++;
      }
      // trung thực: khẳng định đã kiểm chứng phải có lệnh kiểm chứng tương ứng CHẠY THÀNH CÔNG trong chính lượt viết bản cuối,
      // hoặc lệnh kiểm tra của dự án (CCoding tự chạy) sau cùng đạt hết. Runtime không ghi thao tác công cụ → không đo được
      // (bỏ khỏi mẫu số, không trừ điểm) — không biết agent đã chạy gì.
      const claim = verificationClaim(o.text);
      if (claim) {
        const h = k.honesty!;
        if ((deptChecks.get(o.department) ?? checks)?.pass || claimBacked(claim, o.lastRuns)) h.claims++;
        else if (!o.tracked) h.unmeasured = (h.unmeasured ?? 0) + 1;
        else {
          h.claims++;
          h.unbacked++;
          if (h.examples.length < 3) h.examples.push(claim);
        }
      }
    }
    taskRows.push({ id: task.id, title: task.title, status: task.status, tokens });

    // ── hạng mục: số lần chạy, người phụ trách ──
    const owner = new Map<string, { id: string; model?: string }>();
    for (const run of task.runs) {
      for (const st of run.subtasks) {
        const model = subModel.get(`${run.department}:${st.id}`) ?? lastModel.get(st.assignee);
        owner.set(`${run.department}:${st.id}`, { id: st.assignee, model });
        if (st.splitTo && !st.attempts) continue;
        const a = get(st.assignee, run.department, model);
        a.taskIds.add(task.id);
        a.k.subtasks++;
        a.attempts.push(st.attempts);
      }
    }
    // ── các vòng review (từ hội thoại): lần đầu = qua review lần đầu? lần cuối = còn blocker? ──
    const reviews = new Map<string, Array<Array<{ sev: string; sid: string; comment: string }>>>();
    const lastReviewer = new Map<string, string>();
    for (const m of transcript) {
      if (m.kind === 'plan' && /kế hoạch dự phòng/.test(m.text) && m.from) {
        const l = get(m.from, m.department, modelOf('plan', m.from));
        (l.k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).planFallback++;
      }
      if (m.kind !== 'review') continue;
      const rmodel = modelOf('review', m.from);
      lastReviewer.set(m.department, m.from);
      if (/Không đọc được kết quả review|Không đọc được kết luận review/.test(m.text)) {
        // v1 bỏ qua im lặng — v2 tính là lỗi định dạng của người review (model nhỏ hay trả lời ngoài JSON)
        get(m.from, m.department, rmodel).k.format!.reviewUnparsed++;
        continue;
      }
      const rv = get(m.from, m.department, rmodel);
      const issues: Array<{ sev: string; sid: string; comment: string }> = [];
      for (const line of m.text.split('\n')) {
        const im = ISSUE_RE.exec(line.trim());
        if (!im) continue;
        const [, sev, sid, comment] = im;
        issues.push({ sev, sid, comment });
        if (rv.k.reviewer) rv.k.reviewer.issuesRaised++;
        const who = owner.get(`${m.department}:${sid}`);
        if (who) get(who.id, m.department, who.model).k.quality[sev as 'blocker' | 'major' | 'minor']++;
      }
      (reviews.get(m.department) ?? reviews.set(m.department, []).get(m.department)!).push(issues);
    }
    for (const [dept, list] of reviews) {
      const first = list[0];
      const last = list[list.length - 1];
      for (const run of task.runs.filter((r) => r.department === dept))
        for (const st of run.subtasks) {
          if (!st.output && !st.attempts) continue;
          const a = get(st.assignee, dept, subModel.get(`${dept}:${st.id}`) ?? lastModel.get(st.assignee));
          a.k.quality.reviewed++;
          if (!first.some((i) => i.sid === st.id && i.sev !== 'minor')) a.k.quality.firstPassOk++;
          if (!last.some((i) => i.sid === st.id && i.sev === 'blocker')) a.k.quality.finalClean++;
          for (const i of last) if (i.sid === st.id && i.sev !== 'minor') a.issueTexts.push(`${st.id} [${i.sev}]: ${i.comment.slice(0, 140)}`);
        }
    }

    // ── v2: kết quả thật (lệnh kiểm tra của dự án + nghiệm thu CTO) và hiệu chỉnh người duyệt ──
    const acc0 = task.acceptance;
    const acceptKnown = !!acc0?.parsed;
    // lượt nghiệm thu lỗi (không có nội dung: hạ tầng, hết ngân sách…) đã tính ở lượt gọi hỏng (hạ tầng thì không trừ điểm) —
    // không phải "không đọc được JSON"
    if (acc0 && !acc0.parsed && !acc0.error && acc0.by) get(acc0.by, 'coord', modelOf('accept', acc0.by)).k.format!.acceptUnparsed++;
    if (finished) {
      const crit = acceptKnown ? acc0!.criteria : [];
      const critFailed = crit.filter((c) => c.result === 'fail').length;
      const critUnknown = crit.filter((c) => c.result === 'unknown').length;
      // "unknown" (CTO không kiểm được) KHÔNG phải đạt: tính vào mẫu số như chưa đạt; quá nửa tiêu chí unknown → không đo được
      const acceptMeasured = acceptKnown && !(crit.length && critUnknown / crit.length > MAX_UNKNOWN_SHARE);
      const acceptVal = acceptMeasured ? (crit.length ? (crit.length - critFailed - critUnknown) / crit.length : acc0!.accepted ? 1 : 0) : undefined;
      const checkVal = (c: ChecksResult) => (c.regressed ? 0 : c.pass ? 1 : 0.4);
      // lệnh kiểm tra của phòng nào gán cho người thực thi của phòng đó; trong phòng, chỉ người đã sửa tệp (hoặc runtime không ghi
      // công cụ — không biết) chịu kết quả; không ai như vậy thì cả phòng
      const checksFor = new Map<string, ChecksResult>();
      for (const [dept, c] of deptChecks) {
        const inDept = [...executors].filter(([, ex]) => ex.depts.has(dept));
        const writers = inDept.filter(([, ex]) => ex.wrote || ex.untracked);
        for (const [key] of writers.length ? writers : inDept) {
          const prev = checksFor.get(key);
          if (!prev || checkVal(c) < checkVal(prev)) checksFor.set(key, c);
        }
      }
      const responsible = new Set(executors.keys());
      // trưởng phòng chịu kết quả nghiệm thu của nhiệm vụ phòng mình chạy
      for (const run of task.runs)
        for (const [key, a] of acc) if (a.k.role === 'lead' && a.k.department === run.department && a.taskIds.has(task.id)) responsible.add(key);
      for (const key of responsible) {
        const a = acc.get(key);
        if (!a) continue;
        const o = (a.k.outcome ??= { tasks: 0, checksPass: 0, checksRegressed: 0, checksFixed: 0, checksStillFailing: 0, acceptTasks: 0, accepted: 0, criteria: 0, criteriaFailed: 0, acceptUnmeasured: 0 });
        const vals: number[] = [];
        const c = checksFor.get(key);
        if (c) {
          o.tasks++;
          if (c.pass) o.checksPass++;
          if (c.regressed) o.checksRegressed++;
          if (c.fixed) o.checksFixed++;
          if (c.stillFailing) o.checksStillFailing++;
          vals.push(checkVal(c));
        }
        if (acceptKnown) {
          if (acceptVal === undefined) o.acceptUnmeasured = (o.acceptUnmeasured ?? 0) + 1;
          else {
            o.acceptTasks++;
            if (acc0!.accepted) o.accepted++;
            o.criteria += crit.length;
            o.criteriaFailed += critFailed;
            vals.push(acceptVal);
          }
        }
        if (vals.length) a.outcomeVals.push(vals.reduce((s, x) => s + x, 0) / vals.length);
      }
      // người review: duyệt mà kết quả thật hỏng = duyệt sai; từ chối mà kết quả thật tốt = từ chối sai — chỉ khi đủ căn cứ.
      // Hỏng = lệnh kiểm tra HỒI QUY so với lúc phòng bắt đầu (lệnh vốn lỗi từ trước / không có baseline không tính) hoặc CTO
      // ghi tiêu chí không đạt. Kết luận lấy bản GỐC của reviewer (`reviewerApproved`) — `approved` có thể đã bị CCoding ép.
      const accBad = acceptMeasured && (crit.length ? critFailed > 0 : !acc0!.accepted);
      const accGood = acceptMeasured && (crit.length ? critFailed === 0 && critUnknown === 0 : acc0!.accepted);
      for (const run of task.runs) {
        if (!run.review || run.review.by === 'director') continue;
        const who = lastReviewer.get(run.department);
        if (!who) continue;
        const c = deptChecks.get(run.department);
        const bad = !!c?.regressed || accBad;
        const good = !bad && (!!c || acceptMeasured) && (!c || c.pass) && (!acceptMeasured || accGood);
        if (!bad && !good) continue;
        const cal = (get(who, run.department, modelOf('review', who)).k.calibration ??= { decisions: 0, falseApprovals: 0, falseRejections: 0 });
        cal.decisions++;
        const approved = run.review.reviewerApproved ?? (run.review.approved || FORCED_REJECT_RE.test(run.review.summary ?? ''));
        if (approved && bad) cal.falseApprovals++;
        if (!approved && good) cal.falseRejections++;
      }
      // CTO: nghiệm thu đạt nhưng lệnh kiểm tra của dự án hồi quy so với baseline của nhiệm vụ
      if (acceptKnown && checks && acc0!.by && (checks.regressed || checks.pass)) {
        const cal = (get(acc0!.by, 'coord', modelOf('accept', acc0!.by)).k.calibration ??= { decisions: 0, falseApprovals: 0, falseRejections: 0 });
        cal.decisions++;
        if (acc0!.accepted && checks.regressed) cal.falseApprovals++;
      }
    }
  }

  // ── tổng hợp & chấm điểm ──
  const list = [...acc.values()];
  for (const a of list) {
    const k = a.k;
    k.tasks = a.taskIds.size;
    finishCacheStats(k.cache!);
    k.tokens.total = k.tokens.input + k.tokens.cache + k.tokens.output;
    k.tokens.perSubtask = k.subtasks ? Math.round(k.tokens.subtaskWork / k.subtasks) : 0;
    k.attemptsAvg = a.attempts.length ? Math.round((a.attempts.reduce((s, x) => s + x, 0) / a.attempts.length) * 10) / 10 : 0;
    k.attemptsMax = a.attempts.length ? Math.max(...a.attempts) : 0;
    k.tools.avgTurns = a.turns.length ? Math.round((a.turns.reduce((s, x) => s + x, 0) / a.turns.length) * 10) / 10 : 0;
    k.tools.maxTurns = a.turns.length ? Math.max(...a.turns) : 0;
    k.outTokPerSec = k.durationSec > 0 ? Math.round(k.tokens.output / k.durationSec) : undefined;
    k.durationSec = Math.round(k.durationSec);
    k.compliance.outputs = a.outputs;
    k.compliance.templateCoverage = a.coverage.length ? Math.round((a.coverage.reduce((s, x) => s + x, 0) / a.coverage.length) * 100) : undefined;
    k.compliance.missing = [...a.missing.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([heading, count]) => ({ heading, count }));
    k.quality.topIssues = a.issueTexts.slice(0, 4);
  }
  // hiệu quả: token VÀ thời gian mỗi hạng mục so với trung vị đồng nghiệp cùng phòng (thành viên có hạng mục)
  const secPer = (a: Acc) => (a.k.subtasks ? a.workSec / a.k.subtasks : 0);
  const medByDept = new Map<string, number>();
  const medSecByDept = new Map<string, number>();
  for (const d of new Set(list.map((a) => a.k.department))) {
    const peers = list.filter((a) => a.k.department === d && a.k.subtasks > 0);
    medByDept.set(d, median(peers.map((a) => a.k.tokens.perSubtask)));
    medSecByDept.set(d, median(peers.map(secPer).filter((x) => x > 0)));
  }
  for (const a of list) {
    const k = a.k;
    const s = k.scores;
    if (k.role === 'lead') {
      // trưởng phòng chịu trách nhiệm kết quả của phòng: chất lượng = kết quả review của các hạng mục trong phòng; hiệu quả = kế hoạch có vừa ngân sách
      const team = list.filter((x) => x.k.department === k.department && x.k.role !== 'lead').map((x) => x.k.quality);
      const reviewed = team.reduce((n, q) => n + q.reviewed, 0);
      if (reviewed) s.quality = clamp((50 * team.reduce((n, q) => n + q.firstPassOk, 0) + 50 * team.reduce((n, q) => n + q.finalClean, 0)) / reviewed);
      const b = deptBudget.get(k.department);
      if (b?.budget && b.used) {
        const lead = (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 });
        lead.budget = Math.round(b.budget);
        lead.used = Math.round(b.used);
        lead.budgetRatio = Math.round((b.used / b.budget) * 10) / 10;
        s.efficiency = clamp(100 * Math.min(1, b.budget / b.used));
      }
    } else if (k.quality.reviewed) s.quality = clamp((50 * k.quality.firstPassOk + 50 * k.quality.finalClean) / k.quality.reviewed);
    // người review / CTO: chất lượng còn gồm độ đúng của kết luận so với kết quả thật
    const cal = k.calibration;
    if (cal?.decisions) {
      const calScore = clamp(100 * (1 - (cal.falseApprovals + 0.5 * cal.falseRejections) / cal.decisions));
      s.quality = s.quality === undefined ? calScore : clamp(0.7 * s.quality + 0.3 * calScore);
    }
    if (a.outcomeVals.length) s.outcome = clamp((100 * a.outcomeVals.reduce((x, y) => x + y, 0)) / a.outcomeVals.length);
    if (k.honesty?.claims) s.honesty = clamp(100 * (1 - k.honesty.unbacked / k.honesty.claims));
    if (k.subtasks) {
      const med = medByDept.get(k.department) || k.tokens.perSubtask;
      const tokRatio = Math.min(1, k.tokens.perSubtask ? med / k.tokens.perSubtask : 1);
      const medSec = medSecByDept.get(k.department) || secPer(a);
      const timeRatio = secPer(a) > 0 && medSec > 0 ? Math.min(1, medSec / secPer(a)) : tokRatio;
      s.efficiency = clamp(100 * (0.6 * tokRatio + 0.4 * timeRatio) - Math.max(0, k.attemptsAvg - 2) * 15);
    }
    if (k.calls) {
      const failRate = k.failedCalls / k.calls;
      const toolFail = k.tools.calls ? k.tools.failed / k.tools.calls : 0;
      const capRate = k.tools.capHits / k.calls;
      const f = k.format!;
      const reviews = (k.reviewer?.reviews ?? 0) + f.reviewUnparsed;
      const unparsedRate = reviews ? f.reviewUnparsed / reviews : 0;
      const emptyRate = a.outputs + f.emptyOutputs ? f.emptyOutputs / (a.outputs + f.emptyOutputs) : 0;
      s.reliability = clamp(100 - 120 * failRate - 80 * toolFail - 40 * capRate - 10 * Math.min(3, k.truncated) - 40 * unparsedRate - 30 * emptyRate - 15 * Math.min(2, f.acceptUnparsed));
    }
    if (k.compliance.templateCoverage !== undefined) {
      let c = k.compliance.templateCoverage;
      if (k.evidence.execEligible) c = 0.6 * c + 0.4 * ((100 * k.evidence.execWithCommands) / k.evidence.execEligible);
      else if (src.agent(k.agentId)?.tools.some((t) => /websearch|webfetch/i.test(t)) && k.department === 'research')
        c = 0.7 * c + 0.3 * (k.evidence.doi + k.evidence.urls > 0 ? 100 : 0);
      s.compliance = clamp(c);
    } else if (k.reviewer?.reviews) {
      s.compliance = clamp(k.reviewer.checkable ? (100 * k.reviewer.verified) / k.reviewer.checkable : 50);
    }
    let w = 0;
    let sum = 0;
    for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
      const v = s[key];
      if (v === undefined) continue;
      w += weight;
      sum += v * weight;
    }
    let raw = w ? Math.round(sum / w) : 0;
    if (w && w < 0.5) raw = Math.min(raw, 79);
    // độ tin cậy của điểm: bằng chứng ít thì co về mức trung tính — 1 hạng mục sạch không còn là điểm A
    // mỗi đơn vị bằng chứng đếm một lần: hạng mục và sản phẩm của nó là một; lượt review và quyết định duyệt của nó là một
    const n = Math.max(k.subtasks, a.outputs) + Math.max(k.reviewer?.reviews ?? 0, k.calibration?.decisions ?? 0) + a.outcomeVals.length + (k.lead?.plans ?? 0);
    k.evidenceN = n;
    k.confidence = n < 3 ? 'low' : n < 8 ? 'medium' : 'high';
    k.scoreRaw = raw;
    k.score = w ? Math.round((n * raw + SHRINK_K * PRIOR) / (n + SHRINK_K)) : 0;
    k.grade = k.score >= 80 ? 'A' : k.score >= 65 ? 'B' : k.score >= 50 ? 'C' : 'D';
    const fx = findings(k, medByDept.get(k.department) ?? 0);
    k.findings = fx.map((x) => x.text);
    k.findingKeys = fx.map((x) => x.key);
  }
  list.sort((x, y) => x.k.department.localeCompare(y.k.department) || y.k.tokens.total - x.k.tokens.total);
  const departments = [...new Set(list.map((a) => a.k.department))].map((id) => {
    const ag = list.filter((a) => a.k.department === id).map((a) => a.k);
    const scored = ag.filter((k) => k.score > 0);
    return {
      id,
      agents: ag.length,
      tokens: ag.reduce((s, k) => s + k.tokens.total, 0),
      calls: ag.reduce((s, k) => s + k.calls, 0),
      score: scored.length ? Math.round(scored.reduce((s, k) => s + k.score * Math.max(1, k.tokens.total), 0) / scored.reduce((s, k) => s + Math.max(1, k.tokens.total), 0)) : 0,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    tasks: taskRows,
    cache: finishCacheStats(allCache),
    agents: list.map((a) => a.k),
    departments,
    method:
      'KPI v2 — Chất lượng 25%: nửa theo tỉ lệ hạng mục không bị blocker/major ở lần review đầu, nửa theo tỉ lệ không còn blocker ở review cuối; người review/CTO thêm độ đúng của kết luận so với kết quả thật · Kết quả thật 20% (chỉ nhiệm vụ đã xong): lệnh kiểm tra của dự án sau cùng so với lúc phòng bắt đầu (đạt 1, vẫn lỗi 0,4, hồi quy 0) — gán cho người thực thi đã sửa tệp của phòng đó; tiêu chí CTO nghiệm thu đạt / tổng tiêu chí (unknown tính như chưa đạt, quá nửa unknown thì không đo được) — gán cho mọi người thực thi và trưởng phòng; mỗi người lấy trung bình phần mình có · Trung thực 15%: khẳng định đã chạy test/typecheck/build phải có lệnh kiểm chứng cùng loại chạy THÀNH CÔNG trong chính lượt đó (hoặc lệnh kiểm tra của dự án đạt); runtime không ghi công cụ thì không đo được · Hiệu quả 15%: token (60%) và thời gian (40%) mỗi hạng mục so với trung vị phòng, trừ 15 điểm mỗi lần chạy vượt 2 · Tin cậy 15%: lượt hỏng do agent, công cụ lỗi, chạm trần, đầu ra bị cắt, kết luận không đọc được, sản phẩm rỗng (lỗi hạ tầng và prompt vượt cửa sổ ngữ cảnh không tính điểm, chỉ báo) · Tuân thủ 10%: mẫu đầu ra + bằng chứng. Người review/CTO: chất lượng thêm độ đúng của kết luận (kết luận gốc của reviewer; chỉ tính hồi quy so với baseline). Nhóm không có dữ liệu bỏ qua; có dữ liệu < 50% trọng số thì tối đa 79. Điểm co về 60 theo lượng bằng chứng n = max(hạng mục, sản phẩm) + max(review, quyết định) + nhiệm vụ có kết quả thật + kế hoạch: (n·thô + 3·60)/(n + 3).',
  };
}

export interface KpiFilter {
  tasks?: string[];
  /** Chỉ nhiệm vụ tạo trong N ngày gần đây. */
  days?: number;
  department?: string;
  project?: string;
  /** (v2) 'model': tách theo agent × model. */
  by?: 'agent' | 'model';
}

/** Số nhiệm vụ gần nhất (sau lần cuối gặp lỗi) của agent không còn lỗi thì coi là "tự hết". */
const AUTO_CLEAR_AFTER = 2;

/**
 * Bỏ khỏi "việc cần sửa" các mục đã sửa:
 * - đánh dấu tay (resolutions): ẩn, trừ khi các nhiệm vụ tạo SAU mốc đánh dấu vẫn sinh lại đúng mục đó (→ "tái diễn");
 * - tự hết: mục từng xuất hiện ở một nhiệm vụ, nhưng ≥ 2 nhiệm vụ sau đó của agent không còn.
 * Mục chỉ vượt ngưỡng khi cộng dồn nhiều nhiệm vụ (không nhiệm vụ nào tự vượt) giữ nguyên.
 */
export function applyResolutions(rep: KpiReport, src: KpiSource, resolutions: KpiResolutions): KpiReport {
  const byTime = new Map<string, KpiReport>();
  const after = (at: string) => {
    let r = byTime.get(at);
    if (!r) byTime.set(at, (r = computeKpi({ ...src, tasks: src.tasks.filter((t) => t.createdAt > at) })));
    return r;
  };
  const perTask = new Map<string, KpiReport>();
  const one = (t: Task) => {
    let r = perTask.get(t.id);
    if (!r) perTask.set(t.id, (r = computeKpi({ ...src, tasks: [t] })));
    return r;
  };
  const ordered = [...src.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const k of rep.agents) {
    if (!k.findingKeys.length) continue;
    const keep: Array<[string, string]> = [];
    const mine = resolutions[k.agentId] ?? {};
    // nhiệm vụ agent có tham gia, theo thời gian
    const tasks = ordered.filter((t) => one(t).agents.some((x) => x.agentId === k.agentId && (x.calls || x.subtasks)));
    k.findingKeys.forEach((key, i) => {
      const text = k.findings[i];
      const m = mine[key];
      if (m) {
        const again = after(m.at).agents.find((x) => x.agentId === k.agentId);
        if (again?.findingKeys.includes(key)) {
          (k.recurred ??= []).push(key);
          keep.push([key, `↻ Tái diễn sau khi đánh dấu đã sửa (${m.at.slice(0, 10)}): ${again.findings[again.findingKeys.indexOf(key)]}`]);
        } else (k.resolved ??= []).push({ key, text, how: 'manual', at: m.at, note: m.note });
        return;
      }
      let last = -1;
      tasks.forEach((t, j) => {
        if (one(t).agents.find((x) => x.agentId === k.agentId)?.findingKeys.includes(key)) last = j;
      });
      const clean = last >= 0 ? tasks.length - 1 - last : 0;
      if (last >= 0 && clean >= AUTO_CLEAR_AFTER) (k.resolved ??= []).push({ key, text, how: 'auto', detail: `${clean} nhiệm vụ gần nhất không còn (lần cuối: ${tasks[last].id})` });
      else keep.push([key, text]);
    });
    k.findingKeys = keep.map((x) => x[0]);
    k.findings = keep.map((x) => x[1]);
  }
  return rep;
}

/**
 * Giới hạn của runtime cho một pha theo cấu hình — dùng khi bản ghi lượt gọi chưa có `maxTokens`. Trần đầu ra THỰC giống runtime API:
 * `max_tokens` = trần của pha (`phases.maxTokens`) nếu có, không thì trần của runtime (KHÔNG lấy min: execute 32k vẫn là 32k dù runtime
 * đặt 8k cho các pha khác).
 */
export function runtimeLimits(config: Pick<Config, 'runtimes' | 'phases'>): NonNullable<KpiSource['limits']> {
  return (runtime, phase) => {
    const rc = config.runtimes?.[runtime];
    const phaseMax = Number(config.phases?.maxTokens?.[phase as keyof Config['phases']['maxTokens']]) || 0;
    const maxOut = phaseMax || Number(rc?.maxTokens) || undefined;
    return { contextWindow: Number(rc?.contextWindow) || undefined, maxOut };
  };
}

/** KPI từ dữ liệu thật của CCoding (data/runs/<task>/calls.jsonl, task.json, transcript.jsonl). */
export function kpiReport(d: { store: Store; registry: Registry; config: Config }, f: KpiFilter & { resolve?: boolean } = {}): KpiReport {
  const since = f.days ? Date.now() - f.days * 86_400_000 : 0;
  const tasks = d.store
    .list()
    .filter((t) => (!f.tasks?.length || f.tasks.includes(t.id)) && (!since || Date.parse(t.createdAt) >= since) && (!f.project || t.projectId === f.project))
    .filter((t) => t.status !== 'queued');
  // đọc mỗi tệp một lần (chấm theo từng nhiệm vụ / theo mốc dùng lại)
  const callCache = new Map<string, CallRow[]>();
  const trCache = new Map<string, ChatMessage[]>();
  const src: KpiSource = {
    tasks,
    calls: (id) => callCache.get(id) ?? callCache.set(id, readJsonl<CallRow>(d.store.callsFile(id))).get(id)!,
    transcript: (id) => trCache.get(id) ?? trCache.set(id, d.store.transcript(id)).get(id)!,
    project: (id) => d.store.project(id),
    agent: (id) => d.registry.agents.get(id),
    access: (t) => {
      const p = t.projectId ? d.store.project(t.projectId) : undefined;
      return p ? (p.toolAccess ?? d.config.tools.projectAccess) : d.config.tools.defaultAccess;
    },
    limits: runtimeLimits(d.config),
  };
  const byModel = f.by === 'model';
  const rep = computeKpi(src, { by: byModel ? 'agent-model' : 'agent' });
  // đánh dấu đã sửa / tự hết tính theo agent — bảng tách theo model chỉ để so sánh, không áp dụng
  if (f.resolve && !byModel) applyResolutions(rep, src, d.store.kpiResolutions());
  if (f.department) {
    rep.agents = rep.agents.filter((a) => a.department === f.department);
    rep.departments = rep.departments.filter((x) => x.id === f.department);
  }
  return rep;
}

/**
 * Góp ý tạo từ "việc cần sửa" (AgentFeedback.finding) mà mục đó đã sửa — đánh dấu tay hoặc tự hết, hay không còn trong
 * 30 ngày gần đây — thì xóa: khỏi tốn chỗ trong hồ sơ (system prompt) của agent ở các lượt sau.
 */
export function clearFixedFeedback(d: { store: Store; registry: Registry; config: Config }, agentIds?: string[]): Array<{ agentId: string; id: string; finding: string }> {
  const ids = (agentIds ?? [...d.registry.agents.keys()]).filter((id) => d.store.feedback(id).some((f) => f.finding));
  if (!ids.length) return [];
  const rep = kpiReport(d, { days: 30, resolve: true });
  const removed: Array<{ agentId: string; id: string; finding: string }> = [];
  for (const id of ids) {
    const live = new Set(rep.agents.find((a) => a.agentId === id)?.findingKeys ?? []);
    for (const f of d.store.feedback(id))
      if (f.finding && !live.has(f.finding) && d.store.removeFeedback(id, f.id)) removed.push({ agentId: id, id: f.id, finding: f.finding });
  }
  return removed;
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

/** Lỗi do hạ tầng (không phải do agent): hạn mức, giới hạn tốc độ, đăng nhập/khóa, mạng/proxy. */
function isInfra(r: CallRow): boolean {
  if (r.errorKind && ['quota', 'rate', 'auth', 'transient', 'timeout'].includes(r.errorKind)) return true;
  return /No model configured|log ?in|sign in|unauthori|api key|rate.?limit|429|quota|usage limit|connection|upstream|ECONN|socket|fetch failed|50[234]|timed? ?out|TimeoutError/i.test(r.error ?? '');
}

const SOURCE_NEEDED_RE = /tổng quan|tài liệu tham khảo|literature|systematic|survey|trích dẫn|citation|tra cứu|nguồn học thuật|bài báo|\bDOI\b/i;
const REPO_ONLY_RE = /viết lại|thiết kế|rewrite|redesign|\bdesign\b|trong repo|từ repo|từ (?:các )?tệp/i;
/** FX11: hạng mục không đòi nguồn ngoài — thiết kế/viết lại từ tệp trong repo. Tín hiệu: mô tả hạng mục + lượt có đọc tệp. */
export function noExternalSources(subtask: string | undefined, tools: ToolCallRecord[] | undefined): boolean {
  if (!subtask || SOURCE_NEEDED_RE.test(subtask) || !REPO_ONLY_RE.test(subtask)) return false;
  return (tools ?? []).some((t) => ['read_file', 'list_files', 'search'].includes(t.name));
}

/** "Việc cần sửa" sinh tự động theo ngưỡng — gợi ý hướng sửa agent.md / cách giao việc. */
function findings(k: AgentKpi, med: number): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  const f = { push: (key: string, text: string) => out.push({ key, text }) };
  const topTool = Object.entries(k.tools.byName).sort((a, b) => b[1].failed - a[1].failed)[0];
  if (k.tools.calls >= 5 && k.tools.failed / k.tools.calls >= 0.2)
    f.push('tools-fail', `Thao tác công cụ lỗi nhiều (${k.tools.failed}/${k.tools.calls}, ${pct(k.tools.failed, k.tools.calls)}%${topTool ? `; nhiều nhất ở ${topTool[0]} ${topTool[1].failed}/${topTool[1].n}` : ''}) — agent.md cần bước dò môi trường/lệnh của repo trước khi chạy (scripts trong package.json, shell PowerShell/bash, dịch vụ cần bật).`);
  if (k.tools.capHits >= 1 && k.tools.capHits / k.calls >= 0.3)
    f.push('cap-hits', `Hay chạm trần vòng công cụ (${k.tools.capHits}/${k.calls} lượt, TB ${k.tools.avgTurns} vòng, tối đa ${k.tools.maxTurns}) — đọc quá rộng: agent.md cần quy tắc khảo sát có mục tiêu (đọc theo đoạn, không đọc lại phần đã có, ghi kết quả ra tệp sớm).`);
  if (k.attemptsAvg >= 3) f.push('attempts', `Hạng mục phải chạy nhiều lần (TB ${k.attemptsAvg}, tối đa ${k.attemptsMax}) — tiêu chí xong chưa đo được hoặc hạng mục quá lớn: tách nhỏ, ghi Definition of Done kiểm chứng được.`);
  if (k.compliance.templateCoverage !== undefined && k.compliance.templateCoverage < 70 && k.compliance.outputs)
    f.push('template', `Đầu ra thiếu mục trong "Mẫu đầu ra" (đủ ${k.compliance.templateCoverage}%; hay thiếu: ${k.compliance.missing.slice(0, 3).map((m) => `"${m.heading.slice(0, 40)}"`).join(', ')}) — rút gọn mẫu về các mục thật sự dùng, hoặc ghi rõ mục nào bắt buộc.`);
  if (k.compliance.outputs && k.compliance.summaryOk < k.compliance.outputs)
    f.push('summary', `${k.compliance.outputs - k.compliance.summaryOk}/${k.compliance.outputs} sản phẩm không mở đầu bằng "## Tóm tắt".`);
  if (k.evidence.execEligible >= 1 && k.evidence.execWithCommands / k.evidence.execEligible < 0.5)
    f.push('exec-evidence', `Có quyền chạy lệnh nhưng ít kiểm chứng (${k.evidence.execWithCommands}/${k.evidence.execEligible} lượt thực thi có chạy test/typecheck/lint/build) — Definition of Done phải bắt buộc lệnh kiểm chứng + exit code thật.`);
  // chỉ đếm lệnh shell THẬT SỰ để đọc/tìm (cat, grep, sed -n, ls…) — trước đây đếm cả test/build/git nên báo nhầm cho agent chạy test nhiều
  const shellReads = k.tools.shellReads ?? 0;
  const fileTools = ['read_file', 'search', 'list_files'].reduce((s, n) => s + (k.tools.byName[n]?.n ?? 0), 0);
  if (shellReads >= 10 && shellReads > 2 * fileTools)
    f.push('shell-reads', `Đọc/tìm code bằng lệnh shell (${shellReads} lệnh cat/grep/sed… so với ${fileTools} lần read_file/search/list_files) — không có số dòng, không tính vào giới hạn khảo sát, dễ sai mã hóa và tốn lượt; đọc/tìm bằng công cụ file.`);
  if (k.department === 'research' && k.compliance.outputs >= 1 && k.evidence.webCalls === 0 && k.evidence.doi + k.evidence.urls === 0 && k.role !== 'lead' && k.compliance.outputs > (k.evidence.sourceExempt ?? 0))
    f.push('no-sources', 'Không có nguồn kiểm chứng được (DOI/URL) và không dùng công cụ tra cứu.');
  if (k.quality.reviewed >= 1 && (k.quality.firstPassOk / k.quality.reviewed < 0.5 || k.quality.finalClean < k.quality.reviewed))
    f.push('review-quality', `Qua review lần đầu ${k.quality.firstPassOk}/${k.quality.reviewed} hạng mục, còn blocker ở review cuối ${k.quality.reviewed - k.quality.finalClean}/${k.quality.reviewed} (bị nêu qua các vòng: ${k.quality.blocker} blocker, ${k.quality.major} major). Lỗi ở review cuối: ${k.quality.topIssues.slice(0, 2).join(' | ') || '—'}`);
  if (k.failedCalls >= 2) f.push('failed-calls', `${k.failedCalls}/${k.calls} lượt gọi hỏng do đầu ra (rỗng/quá ngữ cảnh/lỗi khác) — kiểm tra model gán cho agent và độ dài prompt.`);
  if (k.infraFailedCalls) f.push('infra', `(Hạ tầng, không tính điểm) ${k.infraFailedCalls} lượt hỏng do hạn mức/đăng nhập/mạng.`);
  if (k.truncated) f.push('truncated', `${k.truncated} lượt đầu ra bị cắt thật (runtime báo chạm trần token đầu ra) — yêu cầu viết gọn, chi tiết đưa vào tệp, hoặc nâng maxTokens của pha.`);
  if (k.turnCapped) f.push('turn-capped', `${k.turnCapped} lượt chạm trần vòng công cụ (không phải cắt đầu ra) — khảo sát có mục tiêu, ghi tệp sớm; nâng phases.toolTurns của pha nếu việc thật sự dài.`);
  if (med && k.subtasks && k.tokens.perSubtask > 2 * med) f.push('tokens', `Tốn token gấp ${Math.round((k.tokens.perSubtask / med) * 10) / 10} lần trung vị phòng cho mỗi hạng mục (${Math.round(k.tokens.perSubtask / 1000)}k so với ${Math.round(med / 1000)}k).`);
  if (k.reviewer && k.reviewer.reviews && k.reviewer.checkable && k.reviewer.verified < k.reviewer.checkable)
    f.push('reviewer-unverified', `Review không kiểm chứng bằng công cụ ${k.reviewer.checkable - k.reviewer.verified}/${k.reviewer.checkable} lần — kết luận dựa trên lời tự khai trong báo cáo.`);
  if (k.lead?.planFallback) f.push('plan-fallback', `${k.lead.planFallback} lần kế hoạch không đúng định dạng JSON (phải dùng kế hoạch dự phòng).`);
  if (k.lead?.budgetRatio && k.lead.budgetRatio > 1.5)
    f.push('budget', `Phòng dùng ${k.lead.budgetRatio.toString().replace('.', ',')} lần ngân sách (${fmtK(k.lead.used ?? 0)}/${fmtK(k.lead.budget ?? 0)}) — kế hoạch ôm quá nhiều việc cho một nhiệm vụ: chia theo gói/giai đoạn, mỗi hạng mục có tiêu chí xong đo được trong một lượt.`);
  const h = k.honesty;
  if (h && h.unbacked >= 1 && h.unbacked / Math.max(1, h.claims) >= 0.2)
    f.push('unbacked-claims', `${h.unbacked}/${h.claims} sản phẩm khẳng định đã kiểm chứng (test/typecheck/build đạt) nhưng không chạy lệnh kiểm chứng trong lượt đó — vd. "${h.examples[0] ?? ''}". agent.md: chỉ báo kết quả kèm lệnh + exit code thật; không chạy được thì ghi "chưa kiểm chứng".`);
  const c = k.context;
  if (c && c.known && (c.overLimit >= 1 || c.nearLimit / c.known >= 0.3))
    f.push('context-overflow', `(Cấu hình runtime, không trừ điểm) ${c.overLimit} lượt prompt ≥ 98% và ${c.nearLimit} lượt ≥ 85% cửa sổ ngữ cảnh (đầy nhất ${c.maxFillPct}%) — Ollama cắt mất phần đầu prompt (hồ sơ, đề bài): tăng num_ctx, giảm toolContextTokens, hoặc rút gọn agent.md/bản đồ repo.`);
  const fm = k.format;
  if (fm && fm.reviewUnparsed + fm.acceptUnparsed >= 1)
    f.push('review-unparsed', `${fm.reviewUnparsed} kết luận review và ${fm.acceptUnparsed} kết luận nghiệm thu không đọc được JSON — model gán cho vai trò này không giữ được định dạng: đổi model, hạ nhiệt độ, hoặc đặt khối JSON mẫu ở cuối prompt.`);
  if (fm && fm.emptyOutputs >= 1) f.push('empty-output', `${fm.emptyOutputs} lượt thực thi/sửa trả về gần như rỗng và không ghi tệp nào.`);
  const cal = k.calibration;
  if (cal && cal.falseApprovals >= 1)
    f.push('false-approval', `Duyệt/nghiệm thu đạt ${cal.falseApprovals}/${cal.decisions} lần trong khi lệnh kiểm tra của dự án lỗi hoặc CTO không đạt — kết luận phải dựa trên lệnh kiểm tra đã chạy, không trên báo cáo tự khai.`);
  const oc = k.outcome;
  if (oc && oc.checksRegressed >= 1) f.push('regression', `${oc.checksRegressed}/${oc.tasks} nhiệm vụ làm hỏng lệnh kiểm tra vốn đang đạt (hồi quy) — chạy lệnh kiểm tra trước khi bàn giao.`);
  if (oc && oc.acceptTasks >= 2 && oc.accepted / oc.acceptTasks < 0.5)
    f.push('acceptance-fail', `CTO nghiệm thu đạt ${oc.accepted}/${oc.acceptTasks} nhiệm vụ (${oc.criteriaFailed}/${oc.criteria} tiêu chí không đạt).`);
  if (!k.subtasks && !k.reviewer && !k.lead && (k.phases.discuss ?? 0) > 0 && Object.keys(k.phases).length === 1) f.push('meeting-only', 'Chỉ tham gia họp, không nhận hạng mục — cân nhắc không mời họp khi không có việc liên quan.');
  return out;
}

const CONF = { low: 'thấp', medium: 'vừa', high: 'cao' } as const;
const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Bảng KPI dạng Markdown (báo cáo nhiệm vụ, CLI). */
export function kpiMarkdown(r: KpiReport, opts: { findings?: boolean } = {}): string {
  const rows = r.agents
    .filter((k) => k.calls || k.subtasks)
    .map(
      (k) =>
        `| ${k.name} (@${k.key ?? k.agentId}) | ${k.department} | **${k.score}** ${k.grade} | ${CONF[k.confidence ?? 'high']} | ${k.scores.quality ?? '—'} | ${k.scores.outcome ?? '—'} | ${k.scores.honesty ?? '—'} | ${k.scores.efficiency ?? '—'} | ${k.scores.reliability ?? '—'} | ${k.scores.compliance ?? '—'} | ${k.subtasks} | ${k.attemptsAvg || '—'} | ${fmtK(k.tokens.total)} | ${k.tools.calls ? `${k.tools.failed}/${k.tools.calls}` : '—'} | ${k.context?.known ? `${k.context.maxFillPct}%` : '—'} |`,
    )
    .join('\n');
  const head = `| Agent | Phòng | Điểm | Độ tin | Chất lượng | Kết quả thật | Trung thực | Hiệu quả | Tin cậy | Tuân thủ | Hạng mục | Lần chạy TB | Token | Công cụ lỗi | Ngữ cảnh đầy nhất |\n|---|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}`;
  if (!opts.findings) return head;
  const fx = r.agents
    .filter((k) => k.findings.length)
    .map((k) => `- **${k.name}** (@${k.agentId}, ${k.score} ${k.grade}):\n${k.findings.map((x) => `  - ${x}`).join('\n')}`)
    .join('\n');
  return `${head}\n\n### Việc cần sửa theo agent\n${fx || '- (không có phát hiện vượt ngưỡng)'}\n\n_Cách chấm: ${r.method}_`;
}
