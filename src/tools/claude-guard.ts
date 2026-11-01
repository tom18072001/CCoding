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
import { gitReadCommandReason, outsidePathReason, pathInside, toolKind } from './shell-policy.js';

export interface GuardConfig {
  root: string;
  deny: string[];
  allowGitCommit: boolean;
  /** 'git-read': công cụ shell chỉ cho git chỉ đọc (vai trò không có quyền chạy lệnh). */
  shell?: 'full' | 'git-read';
  /** Số lần đọc/tìm liên tiếp chưa ghi tệp: N → nhắc một lần, 2N → chặn đọc cho tới khi ghi (0/không đặt = tắt). */
  readsBeforeWrite?: number;
  /** Tệp JSON giữ bộ đếm giữa các lần hook chạy trong một lượt gọi. */
  state?: string;
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

/** Trả lý do chặn, hoặc undefined nếu cho phép (quy tắc tĩnh — không phụ thuộc số lần đọc). */
export function guardDecision(input: HookInput, cfg: GuardConfig): string | undefined {
  const name = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  if (SHELL_TOOLS.has(name)) {
    const cmd = String(ti.command ?? '');
    const why = deniedReason(cmd, cfg.deny, cfg.allowGitCommit);
    if (why) return `CCoding chặn lệnh: ${why}`;
    if (/\bgit\s+(checkout|switch|worktree|rebase|reset\s+--hard|push)\b|\bgit\s+branch\s+(-[mMdDcCf]\s+)?[^-\s]/i.test(cmd)) return 'CCoding chặn lệnh: agent không được tạo/chuyển nhánh, rebase, reset --hard hay push';
    if (/(^|[\s"'\\/:])\.env(\.(?!example|sample|template)\w+)?(\s|"|'|$)/i.test(cmd)) return 'CCoding chặn lệnh: không đọc/ghi tệp .env';
    if (cfg.shell === 'git-read') {
      const g = gitReadCommandReason(cmd, cfg.root);
      if (g) return `CCoding chặn lệnh: ${g}`;
    }
    const away = outsidePathReason(cmd, cfg.root);
    if (away) return `CCoding chặn lệnh: ${away}`;
    return undefined;
  }
  if (FILE_TOOLS.has(name)) {
    const p = (ti.file_path ?? ti.notebook_path ?? ti.path) as string | undefined;
    if (p) {
      if (!pathInside(cfg.root, p)) return `CCoding chặn: ${name} ngoài thư mục làm việc của nhiệm vụ (${cfg.root})`;
      if (SECRET_FILE.test(p)) return `CCoding chặn: ${name} tệp .env (bí mật)`;
    }
  }
  return undefined;
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
  const why = guardDecision(input, cfg);
  if (why) {
    process.stderr.write(why);
    process.exit(2);
  }
  if (cfg.readsBeforeWrite) {
    const gate = readGate(input, cfg, loadState(cfg.state));
    saveState(cfg.state, gate.next);
    if (gate.reason) {
      process.stderr.write(gate.reason);
      process.exit(2);
    }
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main();
