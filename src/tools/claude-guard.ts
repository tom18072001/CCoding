// Hook PreToolUse cho runtime claude-cli: áp CÙNG chính sách công cụ của CCoding (lệnh cấm mặc định +
// denyCommands của dự án + chặn git commit ngoài worktree) và giữ mọi thao tác tệp — kể cả qua lệnh shell — trong thư mục làm việc.
// Thêm: vai trò chỉ có "git chỉ đọc" thì shell chỉ chạy được git log/show/diff…; pha thực thi/sửa có giới hạn khảo sát
// (đọc/tìm liên tiếp mà chưa ghi tệp: nhắc ở N, chặn đọc từ 2N cho tới khi ghi) như vòng công cụ của CCoding.
// Claude Code chạy: node dist/tools/claude-guard.js  — đọc JSON sự kiện từ stdin, cấu hình từ env CCODING_GUARD.
// Thoát mã 2 + stderr = chặn lượt gọi công cụ, Claude nhận lý do.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deniedReason } from './workspace.js';
import { blockMessage, gitReadViolation, outsidePathReason, outsideWriteDecision, pathInside, safeCmdName, toolKind } from './shell-policy.js';
import { LogStore } from '../logger.js';
import { isOwnToolResult, realInsideRoot, resolveFrom } from './guard-paths.js';

export interface GuardConfig {
  root: string;
  deny: string[];
  allowGitCommit: boolean;
  /** 'git-read': công cụ shell chỉ cho lệnh chỉ đọc — git đọc + đọc tệp (vai trò không có quyền chạy lệnh). */
  shell?: 'full' | 'git-read';
  /** Số lần đọc/tìm liên tiếp chưa ghi tệp: N → nhắc một lần, 2N → chặn đọc cho tới khi ghi (0/không đặt = tắt). */
  readsBeforeWrite?: number;
  /** Tệp JSON giữ bộ đếm giữa các lần hook chạy trong một lượt gọi. */
  state?: string;
  /** Lệnh Bash chạy với stdin = /dev/null (mặc định bật; false = giữ nguyên lệnh). */
  closeStdin?: boolean;
  /** Thư mục data/ để ghi sự kiện chẩn đoán `guard.block` (không đặt → CCODING_DATA_DIR, rồi suy từ `state`). */
  dataDir?: string;
  /** B-08 (G3): dùng `cwd` của sự kiện hook để giải đường dẫn tương đối/`..`, so bằng realpath (mặc định bật; false = hành vi cũ). */
  useEventCwd?: boolean;
  /** B-08 (G4): cho Read tệp tool-results của CHÍNH phiên (session_id khớp sự kiện) — mặc định bật. */
  allowOwnToolResults?: boolean;
  /** B-14b: bộ công cụ cố định cho cả nhiệm vụ; hook quyết định theo pha (pha chỉ đọc chặn ghi tệp + toàn bộ Bash). Mặc định tắt. */
  stablePrefix?: boolean;
  /** B-14b: pha của lượt gọi. Thiếu/sai → coi là pha chỉ đọc (fail-closed). */
  phase?: string;
  /** B-14b: công cụ CCoding thực sự cấp cho lượt này (bộ cố định là tập rộng hơn); công cụ ngoài danh sách bị chặn. */
  callTools?: string[];
}

export interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Thư mục làm việc hiện tại của Claude Code khi gọi công cụ (sự kiện hook). */
  cwd?: string;
  session_id?: string;
}

export interface GuardState {
  /** Số lần đọc/tìm liên tiếp kể từ lần ghi (hoặc chạy lệnh khác) gần nhất. */
  reads: number;
  /** Đã nhắc ở mốc N trong chuỗi đọc hiện tại. */
  nudged: boolean;
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob']);
/** B-14b: chỉ hai pha này được ghi tệp khi stablePrefix bật; mọi giá trị khác (kể cả thiếu) = chỉ đọc. */
const WRITE_PHASES = new Set(['execute', 'revise']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SECRET_FILE = /(^|[\\/])\.env(\.(?!example$|sample$|template$)[^\\/]+)?$/i;

/**
 * Lệnh Bash chạy với stdin = /dev/null. Trong `claude -p`, stdin của công cụ Bash không bao giờ đóng: lệnh vô tình đọc stdin
 * (vd. `cat > tệp` thiếu heredoc, heredoc viết sai) treo tới hết thời gian chờ của công cụ — benchtest 1/11 và 2/11 gặp hai lần,
 * 120 giây và hơn 7 phút, ngay trên đường găng. Heredoc/pipe trong lệnh vẫn cấp stdin riêng nên không bị ảnh hưởng.
 * Dùng nhóm `{ …; }` (không phải subshell) để `cd`/biến trong lệnh vẫn giữ như cũ.
 */
export function withNullStdin(cmd: string): string {
  return `{ ${cmd}\n} </dev/null`;
}

/** Kết quả chặn có cấu trúc (hợp đồng sự kiện `guard.block`): không chứa lệnh thô. */
export interface GuardBlock {
  tool: string;
  /** Số thứ tự câu lệnh con (từ 1). */
  clause: number;
  rule: string;
  /** Chỉ tên lệnh hoặc toán tử. */
  cmd: string;
  /** Thông báo trả cho Claude (≤ 300 ký tự với lệnh shell). */
  reason: string;
}

const blk = (tool: string, rule: string, reason: string, clause = 1, cmd = ''): GuardBlock => ({ tool, clause, rule, cmd, reason });

/** Quyết định chặn có cấu trúc, hoặc undefined nếu cho phép (quy tắc tĩnh — không phụ thuộc số lần đọc). */
export function guardBlock(input: HookInput, cfg: GuardConfig, env: NodeJS.ProcessEnv = process.env): GuardBlock | undefined {
  const name = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  if (cfg.stablePrefix) {
    // deny-by-default: bộ công cụ không đổi giữa các pha nên quyền do hook quyết định, không lọc Bash bằng regex
    const readOnly = !(typeof cfg.phase === 'string' && WRITE_PHASES.has(cfg.phase)); // phase không phải chuỗi (vd. mảng ['execute']) → chỉ đọc
    const granted = cfg.callTools ?? ['Read', 'Glob', 'Grep', 'LS']; // thiếu danh sách → chỉ công cụ đọc (fail-closed)
    if (!granted.includes(name)) return blk(name, 'tool-not-granted', `CCoding chặn: công cụ ${name} không được cấp cho lượt gọi này`);
    if (readOnly && (WRITE_TOOLS.has(name) || SHELL_TOOLS.has(name))) return blk(name, 'read-only-phase', `CCoding chặn: pha ${cfg.phase || '(không rõ)'} chỉ đọc — ${name} không được dùng (ghi tệp/chạy lệnh chỉ ở pha thực thi/sửa)`);
  }
  if (SHELL_TOOLS.has(name)) {
    const cmd = String(ti.command ?? '');
    const why = deniedReason(cmd, cfg.deny, cfg.allowGitCommit);
    if (why) return blk(name, 'deny-list', `CCoding chặn lệnh: ${why}`);
    if (/\bgit\s+(checkout|switch|worktree|rebase|reset\s+--hard|push)\b|\bgit\s+branch\s+(-[mMdDcCf]\s+)?[^-\s]/i.test(cmd)) return blk(name, 'git-branch', 'CCoding chặn lệnh: agent không được tạo/chuyển nhánh, rebase, reset --hard hay push', 1, 'git');
    if (/(^|[\s"'\\/:])\.env(\.(?!example|sample|template)\w+)?(\s|"|'|$)/i.test(cmd)) return blk(name, 'env-file', 'CCoding chặn lệnh: không đọc/ghi tệp .env');
    if (cfg.shell === 'git-read') {
      const v = gitReadViolation(cmd);
      if (v) return blk(name, v.rule, blockMessage(v), v.clause, safeCmdName(v.cmd));
    }
    const away = outsidePathReason(cmd, cfg.root);
    if (away) return blk(name, 'outside-root', `CCoding chặn lệnh: ${away}`);
    const wv = outsideWriteDecision(cmd, cfg.root);
    if (wv) return blk(name, wv.rule, `CCoding chặn lệnh: ${wv.reason}`, wv.clause, wv.cmd);
    return undefined;
  }
  if (FILE_TOOLS.has(name)) {
    const p = (ti.file_path ?? ti.notebook_path ?? ti.path) as string | undefined;
    if (p) {
      if (cfg.useEventCwd !== false) {
        // B-08: giải theo cwd của sự kiện (nếu có) rồi so realpath với worktree — chặn `../`, symlink, junction, cwd giả
        const abs = resolveFrom(cfg.root, p, typeof input.cwd === 'string' ? input.cwd : undefined);
        if (name === 'Read' && cfg.allowOwnToolResults !== false && isOwnToolResult(abs, input.session_id, env)) return undefined;
        if (!pathInside(cfg.root, abs) || !realInsideRoot(cfg.root, abs)) return blk(name, 'outside-root', `CCoding chặn: ${name} ngoài thư mục làm việc của nhiệm vụ (${cfg.root})`);
        if (SECRET_FILE.test(abs)) return blk(name, 'env-file', `CCoding chặn: ${name} tệp .env (bí mật)`);
        return undefined;
      }
      if (!pathInside(cfg.root, p)) return blk(name, 'outside-root', `CCoding chặn: ${name} ngoài thư mục làm việc của nhiệm vụ (${cfg.root})`);
      if (SECRET_FILE.test(p)) return blk(name, 'env-file', `CCoding chặn: ${name} tệp .env (bí mật)`);
    }
  }
  return undefined;
}

/** Trả lý do chặn, hoặc undefined nếu cho phép. */
export function guardDecision(input: HookInput, cfg: GuardConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return guardBlock(input, cfg, env)?.reason;
}

/**
 * Thư mục dữ liệu để ghi sự kiện chẩn đoán: cfg.dataDir, rồi biến CCODING_DATA_DIR, rồi suy từ đường dẫn bộ đếm
 * `<data>/runs/<task>/guard/<lượt>.json` (orchestrator đặt). Không xác định được → undefined (bỏ qua việc ghi log).
 */
export function guardLogTarget(cfg: GuardConfig, env: NodeJS.ProcessEnv = process.env): { dataDir: string; taskId?: string } | undefined {
  let taskId: string | undefined;
  let derived: string | undefined;
  if (cfg.state) {
    const dir = path.dirname(path.resolve(cfg.state));
    const run = path.dirname(dir);
    const runs = path.dirname(run);
    if (path.basename(dir) === 'guard' && path.basename(runs) === 'runs') {
      taskId = path.basename(run);
      derived = path.dirname(runs);
    }
  }
  const dataDir = cfg.dataDir || env.CCODING_DATA_DIR || derived;
  return dataDir ? { dataDir: path.resolve(dataDir), taskId } : undefined;
}

/**
 * Ghi sự kiện `guard.block` qua LogStore (che bí mật/PII + chuỗi băm) vào <data>/logs/system.jsonl (và nhật ký nhiệm vụ nếu biết).
 * Chỉ ghi { tool, clause, rule, cmd } — không có lệnh thô. Mọi lỗi đều nuốt: không được đổi quyết định chặn.
 */
export function logGuardBlock(b: GuardBlock, cfg: GuardConfig, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const t = guardLogTarget(cfg, env);
    if (!t) return;
    const logs = new LogStore(t.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
    logs.write({
      level: 'warn',
      kind: 'guard.block',
      msg: `hook chặn ${b.tool}: câu ${b.clause} ${b.rule}`,
      taskId: t.taskId,
      data: { tool: b.tool, clause: b.clause, rule: b.rule, cmd: b.cmd },
    });
  } catch {
    /* log chẩn đoán là phụ trợ */
  }
}

/** B-18: backend sandbox ghi trong log (không phải đường dẫn hay lệnh). */
export type SandboxBackend = 'native' | 'wsl2' | 'none';

/** Kết quả ghi log sandbox: ok=false ⇒ đã in đúng một dòng cảnh báo ra stderr (DET-04), `kind` là loại lỗi (không có đường dẫn). */
export type SandboxLogResult = { ok: true } | { ok: false; kind: string };

/** Loại lỗi an toàn để in: mã lỗi hệ thống (EISDIR…) hoặc tên lỗi — không lấy message (có thể chứa đường dẫn). */
function errKind(e: unknown): string {
  const raw = (e as { code?: unknown })?.code ?? (e as { name?: unknown })?.name ?? 'Error';
  const s = String(raw);
  return /^[A-Za-z0-9_]{1,40}$/.test(s) ? s : 'Error';
}

/**
 * DET-04: ghi sự kiện sandbox qua LogStore (system.jsonl). Không xác định được dataDir, hoặc LogStore ném lỗi → ghi MỘT dòng stderr
 * cố định { tool, rule, backend } + loại lỗi (không lệnh thô, không đường dẫn, không message gốc) và trả { ok: false } để nơi gọi
 * đưa lỗi vào kết quả lượt. Không đổi quyết định chặn (không ném lỗi).
 */
function writeSandboxEvent(
  kind: 'sandbox.deny' | 'sandbox.unavailable',
  entry: { level: 'warn' | 'error'; msg: string; data: Record<string, string> },
  fields: { tool?: string; rule?: string; backend: SandboxBackend },
  cfg: Pick<GuardConfig, 'state' | 'dataDir'>,
  env: NodeJS.ProcessEnv,
): SandboxLogResult {
  let why: string;
  let errType = '';
  try {
    const t = guardLogTarget(cfg as GuardConfig, env);
    if (!t) {
      why = 'không xác định thư mục dữ liệu (đặt CCODING_DATA_DIR)';
    } else {
      const logs = new LogStore(t.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
      logs.write({ level: entry.level, kind, msg: entry.msg, taskId: t.taskId, data: entry.data });
      return { ok: true };
    }
  } catch (e) {
    errType = errKind(e);
    why = `ghi nhật ký thất bại (${errType})`;
  }
  const f = `{tool: ${fields.tool ?? '-'}, rule: ${fields.rule ?? '-'}, backend: ${fields.backend}}`;
  try {
    process.stderr.write(`[ccoding] ${kind} không ghi được log: ${why} ${f}
`);
  } catch {
    /* stderr đóng: không còn đường nào, vẫn trả ok=false cho nơi gọi */
  }
  return { ok: false, kind: errType || 'NO_DATA_DIR' };
}

/** B-18: ghi `sandbox.deny` (sandbox hệ điều hành từ chối một thao tác). data chỉ { tool, rule, backend } — không lệnh thô, không đường dẫn. */
export function logSandboxDeny(d: { tool: string; rule: string; backend: SandboxBackend }, cfg: Pick<GuardConfig, 'state' | 'dataDir'>, env: NodeJS.ProcessEnv = process.env): SandboxLogResult {
  return writeSandboxEvent('sandbox.deny', { level: 'warn', msg: `sandbox từ chối ${d.tool}: ${d.rule}`, data: { tool: d.tool, rule: d.rule, backend: d.backend } }, d, cfg, env);
}

/** B-18: ghi `sandbox.unavailable` khi khóa bật mà nền tảng không có sandbox (fail-closed). data chỉ { backend, platform }. */
export function logSandboxUnavailable(d: { backend: SandboxBackend; platform: string }, cfg: Pick<GuardConfig, 'state' | 'dataDir'>, env: NodeJS.ProcessEnv = process.env): SandboxLogResult {
  return writeSandboxEvent('sandbox.unavailable', { level: 'error', msg: 'osSandbox bật nhưng nền tảng không có sandbox — không chạy', data: { backend: d.backend, platform: d.platform } }, { backend: d.backend }, cfg, env);
}

/**
 * Giới hạn khảo sát: đếm thao tác đọc/tìm liên tiếp (Read, Grep, Glob, lệnh shell chỉ đọc). Ghi tệp hoặc chạy lệnh khác (test, build…)
 * đặt lại bộ đếm. Ở mốc N nhắc một lần (chặn đúng lần đọc đó, lần sau được), từ 2N chặn đọc cho tới khi ghi.
 */
export function readGate(input: HookInput, cfg: GuardConfig, st: GuardState): { reason?: string; next: GuardState } {
  const n = Math.max(0, cfg.readsBeforeWrite ?? 0);
  if (!n) return { next: st };
  const kind = toolKind(input.tool_name ?? '', input.tool_input ?? {});
  if (kind !== 'read') return { next: { reads: 0, nudged: false } };
  if (st.reads >= 2 * n)
    return {
      reason: `CCoding chặn đọc thêm: đã đọc/tìm ${st.reads} lần liên tiếp mà chưa ghi tệp nào. Ghi phần đã xác định vào tệp sản phẩm (hoặc bàn giao dở dang) trước, rồi mới đọc tiếp.`,
      next: st,
    };
  if (st.reads >= n && !st.nudged)
    return {
      reason: `CCoding nhắc: đã đọc/tìm ${st.reads} lần liên tiếp mà chưa ghi tệp nào. Ghi ngay phần đã xác định vào tệp sản phẩm (ghi dần, sửa tiếp sau), rồi mới đọc tiếp — lần đọc kế tiếp vẫn được, nhưng tới ${2 * n} lần liên tiếp chưa ghi thì việc đọc bị chặn cho tới khi ghi.`,
      next: { ...st, nudged: true },
    };
  return { next: { reads: st.reads + 1, nudged: st.nudged } };
}

function loadState(file?: string): GuardState {
  if (!file) return { reads: 0, nudged: false };
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<GuardState>;
    return { reads: Number(s.reads) || 0, nudged: !!s.nudged };
  } catch {
    return { reads: 0, nudged: false };
  }
}

function saveState(file: string | undefined, st: GuardState): void {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(st));
    fs.renameSync(tmp, file);
  } catch {
    /* bộ đếm là phụ trợ: lỗi ghi thì bỏ qua */
  }
}

async function main(): Promise<void> {
  let cfg: GuardConfig;
  try {
    cfg = JSON.parse(process.env.CCODING_GUARD ?? '');
  } catch {
    process.stderr.write('CCoding guard: thiếu cấu hình CCODING_GUARD — chặn để an toàn');
    process.exit(2);
  }
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  let input: HookInput = {};
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    process.stderr.write('CCoding guard: sự kiện không đọc được — chặn để an toàn');
    process.exit(2);
  }
  const blocked = guardBlock(input, cfg);
  if (blocked) {
    logGuardBlock(blocked, cfg);
    process.stderr.write(blocked.reason);
    process.exit(2);
  }
  if (cfg.readsBeforeWrite) {
    const gate = readGate(input, cfg, loadState(cfg.state));
    saveState(cfg.state, gate.next);
    if (gate.reason) {
      if (gate.reason.startsWith('CCoding chặn')) logGuardBlock({ tool: input.tool_name ?? '', clause: 1, rule: 'read-limit', cmd: '', reason: gate.reason }, cfg);
      process.stderr.write(gate.reason);
      process.exit(2);
    }
  }
  const command = input.tool_input?.command;
  if (input.tool_name === 'Bash' && cfg.closeStdin !== false && typeof command === 'string' && command.trim()) {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'CCoding: lệnh hợp lệ, chạy với stdin = /dev/null',
        updatedInput: { ...input.tool_input, command: withNullStdin(command) },
      },
    };
    process.stdout.write(JSON.stringify(out));
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main();
