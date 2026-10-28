// Hook PreToolUse cho runtime claude-cli: áp CÙNG chính sách công cụ của CCoding (lệnh cấm mặc định +
// denyCommands của dự án + chặn git commit ngoài worktree) và giữ mọi thao tác tệp trong thư mục làm việc.
// Claude Code chạy: node dist/tools/claude-guard.js  — đọc JSON sự kiện từ stdin, cấu hình từ env CCODING_GUARD.
// Thoát mã 2 + stderr = chặn lượt gọi công cụ, Claude nhận lý do.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deniedReason } from './workspace.js';

export interface GuardConfig {
  root: string;
  deny: string[];
  allowGitCommit: boolean;
}

export interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob']);
const SECRET_FILE = /(^|[\\/])\.env(\.(?!example$|sample$|template$)[^\\/]+)?$/i;

function inside(root: string, p: string): boolean {
  const r = path.resolve(root);
  const f = path.resolve(r, p);
  const norm = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const rel = path.relative(norm(r), norm(f));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Trả lý do chặn, hoặc undefined nếu cho phép. */
export function guardDecision(input: HookInput, cfg: GuardConfig): string | undefined {
  const name = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  if (SHELL_TOOLS.has(name)) {
    const cmd = String(ti.command ?? '');
    const why = deniedReason(cmd, cfg.deny, cfg.allowGitCommit);
    if (why) return `CCoding chặn lệnh: ${why}`;
    if (/\bgit\s+(checkout|switch|worktree|rebase|reset\s+--hard|push)\b|\bgit\s+branch\s+(-[mMdDcCf]\s+)?[^-\s]/i.test(cmd)) return 'CCoding chặn lệnh: agent không được tạo/chuyển nhánh, rebase, reset --hard hay push';
    if (/(^|[\s"'\\/])\.env(\.(?!example|sample|template)\w+)?(\s|"|'|$)/i.test(cmd)) return 'CCoding chặn lệnh: không đọc/ghi tệp .env';
    return undefined;
  }
  if (FILE_TOOLS.has(name)) {
    const p = (ti.file_path ?? ti.notebook_path ?? ti.path) as string | undefined;
    if (p) {
      if (!inside(cfg.root, p)) return `CCoding chặn: ${name} ngoài thư mục làm việc của nhiệm vụ (${cfg.root})`;
      if (SECRET_FILE.test(p)) return `CCoding chặn: ${name} tệp .env (bí mật)`;
    }
  }
  return undefined;
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
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main();
