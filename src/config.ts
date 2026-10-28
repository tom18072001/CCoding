import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Classification, Phase, TaskOptions, ToolAccess } from './types.js';

/** Thư mục gốc của repo (chứa package.json). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface RuntimeConfig {
  /** Kiểu cho runtime tùy biến: "openai-api". */
  type?: string;
  label?: string;
  /** Key ảo theo phòng ban: { "dev": "env:BIFROST_VK_DEV", "*": "…" }. */
  virtualKeys?: Record<string, string>;
  /** Header mang key ảo: "x-bf-vk" (Bifrost) hoặc "authorization" (LiteLLM). */
  virtualKeyHeader?: string;
  /** Kiểu tag gửi gateway: "bifrost" | "litellm" | "both" | "none". */
  tags?: string;
  headers?: Record<string, string>;
  /** Runtime chỉ "sẵn sàng" khi các biến môi trường này đã được đặt. */
  requireEnv?: string[];
  /**
   * "combined": gửi hồ sơ vị trí + công việc trong MỘT tin nhắn user — dùng khi upstream tự chèn
   * system prompt riêng (ví dụ 9router với model cc/… của gói Claude Code) làm agent "quên" vai trò.
   */
  promptStyle?: 'split' | 'combined';
  /** Thời gian chờ khi kiểm tra runtime sẵn sàng (ms). */
  probeTimeoutMs?: number;
  /** Luồng trả lời không có byte nào trong khoảng này (ms) → coi là treo, hủy lượt (lỗi "timeout" để thử lại/chuyển runtime). Mặc định 300000; 0 = tắt. */
  idleTimeoutMs?: number;
  /** Giữa vòng công cụ gặp giới hạn tốc độ (429): chờ tối đa bao lâu (ms) rồi thử lại CHÍNH lượt đó, giữ ngữ cảnh + cache (mặc định 240000; 0 = không chờ). */
  rateWaitMs?: number;
  command?: string;
  extraArgs?: string[];
  permissionMode?: string;
  /** claude-cli: true = để Claude Code dùng ANTHROPIC_API_KEY/BASE_URL của môi trường; mặc định false = chỉ phiên đăng nhập claude.ai. */
  useApiKey?: boolean;
  /** claude-cli: true = nạp cả cấu hình cấp người dùng (~/.claude: plugin, MCP, hook); mặc định false — gọn ngữ cảnh, đúng chính sách CCoding. */
  userSettings?: boolean;
  sandbox?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  maxTokens?: number;
  local?: boolean;
  defaultModel?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Hạn mức token/ngày của cả runtime (vd. mốc miễn phí) — vượt thì tự chuyển sang tài nguyên khác. */
  dailyTokenLimit?: number;
  /** Runtime API có hỗ trợ gọi công cụ (tool calling) hay không — mặc định true với kiểu openai-api. */
  supportsTools?: boolean;
  /**
   * Gắn điểm cache prompt kiểu Anthropic (cache_control) vào hồ sơ vị trí, bối cảnh nhiệm vụ và cuối lịch sử vòng lặp công cụ
   * khi gửi qua gateway tương thích OpenAI (Bifrost, LiteLLM, OpenRouter…). true = với model có "claude" trong tên;
   * chuỗi = regex tên model. Gateway không hỗ trợ thì thường bỏ qua trường này.
   */
  cacheControl?: boolean | string;
  /** Trường thêm vào thân yêu cầu chat/completions, vd. { "reasoning_effort": "none" } để tắt chế độ suy nghĩ của qwen3 qua Ollama. Không ghi đè model/messages/tools/stream. */
  extraBody?: Record<string, unknown>;
  /** extraBody theo pha (có mục cho pha thì THAY extraBody), vd. { "execute": {} } để bật lại suy nghĩ ở pha có công cụ — model nhỏ tắt suy nghĩ thường "báo xong" mà không gọi công cụ. */
  extraBodyByPhase?: Record<string, Record<string, unknown>>;
  /** Tắt hẳn runtime: không thăm dò, không gọi, kể cả khi nhiệm vụ/dự án/agent chỉ định (vd. không dùng tài khoản Claude/Codex sau 9router). */
  disabled?: boolean;
  /**
   * Trần token mỗi lượt của vòng công cụ (hồ sơ + đề bài + lịch sử). Vượt thì rút gọn kết quả công cụ cũ ngay (giữ 2 kết quả gần nhất).
   * Không đặt = rút gọn theo đợt để giữ cache prompt (Claude/OpenAI). Nên đặt cho runtime KHÔNG có cache (API miễn phí, Ollama):
   * mỗi token gửi lại đều tính vào hạn mức/tốc độ.
   */
  toolContextTokens?: number;
  /** Cửa sổ ngữ cảnh của model (token), vd. 32768 = num_ctx của Ollama — vòng công cụ không gửi quá (cửa sổ − max_tokens − 1.024), tránh bị cắt mất phần đầu prompt. */
  contextWindow?: number;
  [k: string]: unknown;
}

/** Một mục trong chuỗi model: id model + hạn mức/ngày (tùy chọn). */
export interface ModelEntry {
  model: string;
  dailyTokenLimit?: number;
  label?: string;
}

/** Ánh xạ bí danh (opus/sonnet/haiku) → một model hoặc chuỗi model dự phòng theo thứ tự ưu tiên. */
export type ModelSpec = string | Array<string | ModelEntry>;

export function modelChain(spec: ModelSpec | undefined): ModelEntry[] {
  if (!spec) return [];
  const list = Array.isArray(spec) ? spec : [spec];
  return list
    .map((x) => (typeof x === 'string' ? { model: x } : x))
    .filter((x): x is ModelEntry => !!x && typeof x.model === 'string' && x.model.trim() !== '');
}

/** Bản phẳng alias → model đầu tiên (cho runtime CLI). */
export function firstModels(map: Record<string, ModelSpec> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const m = modelChain(v)[0];
    if (m) out[k] = m.model;
  }
  return out;
}

export interface Config {
  root: string;
  server: { host: string; port: number; token?: string };
  dataDir: string;
  workspacesDir: string;
  agentsDir: string;
  departmentsDir: string;
  runtime: {
    default: string;
    order: string[];
    /** Thời gian "nghỉ" khi một runtime/model báo hết quota mà không cho biết lúc mở lại (ms). */
    quotaCooldownMs: number;
    /** Số lần chuyển runtime/model tối đa trong một lượt gọi. */
    maxFailover: number;
    /** Model vừa báo giới hạn tốc độ (429) bị xếp sau các model khác trong khoảng này (ms) — tránh lượt nào cũng thử lại rồi mới chuyển. */
    rateBackoffMs: number;
    /**
     * Model "chậm" (regex, khớp model id hoặc nhãn), vd. ["gpt-6-sol"]. Ở các pha nặng (waitPhases), nếu model nhanh chỉ đang
     * nghỉ vì quota/giới hạn tốc độ và sẽ mở lại trong waitForFastMs thì CCoding tạm dừng rồi tự tiếp tục thay vì chạy bằng model chậm.
     */
    slowModels?: string[];
    /** Chờ model nhanh tối đa bao lâu (ms) trước khi chấp nhận model chậm (mặc định 30 phút; 0 = không chờ). */
    waitForFastMs?: number;
    /** Pha áp dụng chờ model nhanh (mặc định execute, revise, review). */
    waitPhases?: string[];
  };
  runner: 'auto' | 'process' | 'herdr';
  maxConcurrentTasks: number;
  defaults: TaskOptions & { timeoutMs: number };
  /** Tinh chỉnh theo pha: model rẻ hơn cho pha nhẹ, giới hạn token đầu ra, số lượt công cụ. */
  phases: {
    models: Partial<Record<Phase, string>>;
    maxTokens: Partial<Record<Phase, number>>;
    toolTurns: Partial<Record<Phase, number>>;
    /** Trần token đầu vào cộng dồn của vòng lặp công cụ theo pha — chạm trần thì model phải viết câu trả lời cuối. */
    toolInputBudget: Partial<Record<Phase, number>>;
    /** Số lần cho hạng mục chạy tiếp (ngữ cảnh mới) khi vòng công cụ chạm trần mà chưa xong; 0 = tắt. */
    maxContinuations?: number;
    /** P8: số nhiệm vụ trước của cùng dự án đưa vào pha lập kế hoạch (tóm tắt, nhánh, kiểm tra, việc còn mở). Mặc định 3; 0 = tắt. */
    projectHistory?: number;
  };
  /** Công cụ workspace cho agent (đọc/ghi file, chạy lệnh) — xem docs/TOOLS.md. */
  tools: {
    /** Quyền mặc định khi nhiệm vụ không thuộc dự án (workspace riêng của CCoding). */
    defaultAccess: ToolAccess;
    /** Quyền mặc định cho dự án có workspace riêng. */
    projectAccess: ToolAccess;
    commandTimeoutSec: number;
    maxOutputChars: number;
    /** Hạn mức ký tự cho một lần read_file (lớn hơn đầu ra lệnh để đọc trọn schema/file nguồn cỡ vừa, tránh đọc lại từng đoạn). */
    maxReadChars?: number;
    /** Trọng số token đọc từ cache khi tính trần token vòng công cụ (phases.toolInputBudget). Mặc định 0,1; 1 = tính như đầu vào thường. */
    cachedInputWeight?: number;
    /** Tạo bản đồ repo `.ccoding/<task>/repo-map.md` cho dự án có workspace (mặc định bật). */
    repoMap?: boolean;
    /** Pha thực thi/sửa: đọc/tìm liên tiếp N lần mà không ghi tệp thì nhắc ghi; 2N lần thì từ chối đọc thêm tới khi ghi. Mặc định 16; 0 = tắt. */
    readsBeforeWrite?: number;
    denyCommands: string[];
    /** File chưa track chép vào worktree mặc định (nếu có). */
    worktreeCopy: string[];
    /** Cho agent có WebSearch/WebFetch tra cứu nguồn (OpenAlex, web, đọc URL) với dữ liệu Công khai/Nội bộ. */
    web: boolean;
    /** Hạng mục có quyền chạy lệnh trong workspace dự án dùng chung làm LẦN LƯỢT (hạng mục chỉ viết tài liệu vẫn song song). */
    serializeWriters: boolean;
  };
  /** Ước lượng token của kế hoạch — cảnh báo khi nhiệm vụ quá lớn so với ngân sách (đo từ các lượt chạy thật). */
  estimate: {
    /** Định tuyến, lập kế hoạch, họp, tổng hợp. */
    base: number;
    /** Mỗi vòng review (+ sửa). */
    perReview: number;
    /** Mỗi hạng mục theo quyền công cụ (vòng lặp công cụ tốn hơn nhiều so với trả lời văn bản). */
    perSubtask: Record<ToolAccess, number>;
    /** Cộng thêm cho hạng mục có công cụ tra cứu web. */
    web: number;
    /** Cảnh báo khi ước lượng > ngân sách × hệ số này. */
    warnRatio: number;
    /** Ước tính theo token thực tế của các hạng mục gần nhất của từng agent (số ngày lịch sử; 0 = chỉ dùng hằng số). */
    historyDays?: number;
    /** Số hạng mục tối thiểu của một agent để dùng lịch sử thay hằng số. */
    minSamples?: number;
  };
  herdr: {
    session: string;
    workspaceLabel: string;
    agentPanes: boolean;
    closeAgentPanes: boolean;
    notify: boolean;
    bin?: string;
    /** Dịch vụ chạy kèm trong tab "Dịch vụ" (ví dụ Bifrost, Ollama). */
    services?: Array<{ label: string; command: string; cwd?: string; enabled?: boolean }>;
    /** Các space log riêng trên cột space của herdr (Log · Hệ thống / Nhiệm vụ / Phòng ban / Agent). */
    logSpaces?: { enabled?: boolean; agents?: boolean };
  };
  runtimes: Record<string, RuntimeConfig>;
  models: Record<string, Record<string, ModelSpec>>;
  pricing: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>;
  dataProtection: {
    defaultClassification: Classification;
    allowedRuntimes: Record<Classification, string[]>;
    redactSecrets: boolean;
    redactPii: boolean;
    logPrompts: boolean;
    hashChain: boolean;
    retentionDays: number;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObject(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    out[k] = isObject(cur) && isObject(v) ? deepMerge(cur, v) : v;
  }
  return out as T;
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return undefined;
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Không đọc được ${file}: ${(e as Error).message}`);
  }
}

const BUILTIN: Omit<Config, 'root'> = {
  server: { host: '127.0.0.1', port: 7420 },
  dataDir: 'data',
  workspacesDir: 'workspaces',
  agentsDir: 'agents',
  departmentsDir: 'departments',
  runtime: {
    default: 'auto',
    order: ['claude-cli', 'bifrost', 'anthropic-api', 'openai-api', 'codex-cli', 'kimi-cli', 'ollama', 'mock'],
    quotaCooldownMs: 30 * 60_000,
    maxFailover: 6,
    rateBackoffMs: 20 * 60_000,
    slowModels: [],
    waitForFastMs: 30 * 60_000,
    waitPhases: ['execute', 'revise', 'review'],
  },
  runner: 'auto',
  maxConcurrentTasks: 2,
  defaults: { discussionRounds: 1, review: true, maxParallel: 3, maxRevisions: 1, budgetTokens: 1500000, budgetMode: 'complete', subtaskBudgetTokens: 0, timeoutMs: 1800000 },
  phases: {
    models: { route: 'haiku', discuss: 'haiku' },
    maxTokens: { route: 800, plan: 8000, discuss: 700, finalize: 8000, execute: 32000, review: 6000, revise: 32000, synthesize: 10000 },
    toolTurns: { plan: 8, finalize: 4, execute: 40, review: 10, revise: 16, synthesize: 4 },
    toolInputBudget: { plan: 100000, finalize: 50000, execute: 800000, review: 200000, revise: 300000, synthesize: 60000 },
    maxContinuations: 2,
  },
  tools: {
    defaultAccess: 'write',
    projectAccess: 'exec',
    commandTimeoutSec: 600,
    maxOutputChars: 12000,
    maxReadChars: 30000,
    cachedInputWeight: 0.1,
    readsBeforeWrite: 16,
    denyCommands: [],
    worktreeCopy: ['.env', '.env.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local'],
    web: true,
    serializeWriters: true,
  },
  estimate: {
    base: 150000,
    perReview: 120000,
    perSubtask: { none: 60000, read: 120000, write: 200000, exec: 300000 },
    web: 100000,
    warnRatio: 1.2,
    historyDays: 30,
    minSamples: 2,
  },
  herdr: { session: 'ccoding', workspaceLabel: 'CCoding Office', agentPanes: true, closeAgentPanes: false, notify: true, services: [], logSpaces: { enabled: true, agents: true } },
  runtimes: {},
  models: {},
  pricing: {},
  dataProtection: {
    defaultClassification: 'internal',
    allowedRuntimes: { public: ['*'], internal: ['*'], confidential: ['local'], restricted: ['local'] },
    redactSecrets: true,
    redactPii: true,
    logPrompts: true,
    hashChain: true,
    retentionDays: 400,
  },
};

/**
 * Nạp cấu hình theo thứ tự ưu tiên tăng dần:
 * mặc định dựng sẵn → ccoding.config.json → ccoding.local.json → biến môi trường.
 */
export function loadConfig(opts: { root?: string; configFile?: string; local?: boolean } = {}): Config {
  const root = opts.root ?? process.env.CCODING_ROOT ?? ROOT;
  let cfg = deepMerge(BUILTIN, readJson(path.join(root, 'ccoding.config.json')));
  // ccoding.local.json là cấu hình riêng của máy (runtime tắt/bật, khóa…): bỏ qua khi chạy test (node --test đặt
  // NODE_TEST_CONTEXT) để bộ test không phụ thuộc máy — 28/10 máy Tom đỏ 12/100 test chỉ vì cấu hình local.
  const skipLocal = opts.local === false || process.env.CCODING_NO_LOCAL === '1' || (!!process.env.NODE_TEST_CONTEXT && process.env.CCODING_TEST_LOCAL !== '1');
  if (!skipLocal) cfg = deepMerge(cfg, readJson(path.join(root, 'ccoding.local.json')));
  const extra = opts.configFile ?? process.env.CCODING_CONFIG;
  if (extra) {
    if (!fs.existsSync(path.resolve(extra))) throw new Error(`Không thấy file cấu hình ${extra} (CCODING_CONFIG)`);
    cfg = deepMerge(cfg, readJson(path.resolve(extra)));
  }

  const env = process.env;
  if (env.CCODING_PORT) cfg.server.port = Number(env.CCODING_PORT);
  if (env.CCODING_HOST) cfg.server.host = env.CCODING_HOST;
  if (env.CCODING_TOKEN) cfg.server.token = env.CCODING_TOKEN;
  if (env.CCODING_DATA_DIR) cfg.dataDir = env.CCODING_DATA_DIR;
  if (env.CCODING_RUNTIME) cfg.runtime.default = env.CCODING_RUNTIME;
  if (env.CCODING_RUNNER) cfg.runner = env.CCODING_RUNNER as Config['runner'];
  if (env.CCODING_HERDR_SESSION) cfg.herdr.session = env.CCODING_HERDR_SESSION;
  if (env.HERDR_BIN_PATH && !cfg.herdr.bin) cfg.herdr.bin = env.HERDR_BIN_PATH;

  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
  return {
    ...cfg,
    root,
    dataDir: abs(cfg.dataDir),
    workspacesDir: abs(cfg.workspacesDir),
    agentsDir: abs(cfg.agentsDir),
    departmentsDir: abs(cfg.departmentsDir),
  };
}
