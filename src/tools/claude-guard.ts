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
import { blockMessage, gitReadViolation, outsidePathReason, pathInside, safeCmdName, toolKind } from './shell-policy.js';
import { LogStore } from '../logger.js';

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
}

export interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface GuardState {
  /** Số lần đọc/tìm liên tiếp kể từ lần ghi (hoặc chạy lệnh khác) gần nhất. */
  reads: number;
  /** Đã nhắc ở mốc N trong chuỗi đọc hiện tại. */
  nudged: boolean;
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob']);
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
export function guardBlock(input: HookInput, cfg: GuardConfig): GuardBlock | undefined {
  const name = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
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
    return undefined;
  }
  if (FILE_TOOLS.has(name)) {
    const p = (ti.file_path ?? ti.notebook_path ?? ti.path) as string | undefined;
    if (p) {
      if (!pathInside(cfg.root, p)) return blk(name, 'outside-root', `CCoding chặn: ${name} ngoài thư mục làm việc của nhiệm vụ (${cfg.root})`);
      if (SECRET_FILE.test(p)) return blk(name, 'env-file', `CCoding chặn: ${name} tệp .env (bí mật)`);
    }
  }
  return undefined;
}

/** Trả lý do chặn, hoặc undefined nếu cho phép. */
export function guardDecision(input: HookInput, cfg: GuardConfig): string | undefined {
  return guardBlock(input, cfg)?.reason;
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
