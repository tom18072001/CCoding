// Mô phỏng (b) của CI sạch: chạy lệnh với PATH đã bỏ mọi thư mục chứa claude/codex/kimi (chỉ cho riêng lệnh con, không sửa môi trường máy).
// Dùng: node scripts/run-without-runtimes.mjs <lệnh> [đối số…]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NAMES = ['claude', 'codex', 'kimi'];
const EXTS = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.ps1'] : [''];
const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
const keep = [];
const dropped = [];
for (const dir of (process.env[key] ?? '').split(path.delimiter).filter(Boolean)) {
  const has = NAMES.some((n) => EXTS.some((e) => fs.existsSync(path.join(dir, n + e))));
  (has ? dropped : keep).push(dir);
}
console.error(`[run-without-runtimes] bỏ ${dropped.length} thư mục khỏi PATH`);
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, [key]: keep.join(path.delimiter) } });
process.exit(r.status ?? 1);
