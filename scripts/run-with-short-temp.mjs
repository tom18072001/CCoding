// Mô phỏng (c) của CI Windows: đặt TEMP/TMP theo dạng 8.3 (runner GitHub: thư mục người dùng dạng RUNNER~1 dưới ổ C) rồi chạy lệnh.
// Dùng: node scripts/run-with-short-temp.mjs <lệnh> [đối số…]. Thoát 3 nếu ổ đĩa tắt tên 8.3 (không mô phỏng được).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.error('[run-with-short-temp] chỉ áp dụng cho Windows');
  process.exit(3);
}
const shortOf = (p) => execSync(`for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8', windowsHide: true }).trim();
const differs = (s, l) => !!s && s.toLowerCase() !== l.toLowerCase();

let long = fs.realpathSync.native(process.env.TEMP ?? os.tmpdir());
let short = shortOf(long);
let made;
if (!differs(short, long)) {
  // TEMP của máy này đã ngắn sẵn (vd. thư mục người dùng tên ngắn) → lấy thư mục con tên dài làm TEMP để vẫn có dạng 8.3 ≠ dạng dài (như RUNNER~1).
  made = fs.mkdtempSync(path.join(long, 'ccoding-mo-phong-8dot3-ten-dai-'));
  long = made;
  short = shortOf(long);
  if (!differs(short, long)) {
    fs.rmSync(made, { recursive: true, force: true });
    console.error('[run-with-short-temp] ổ đĩa tắt tên 8.3 (8dot3name) — không mô phỏng được');
    process.exit(3);
  }
}
console.error(`[run-with-short-temp] TEMP=TMP=${short} (dạng dài: ${long})`);
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, TEMP: short, TMP: short } });
if (made) fs.rmSync(made, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
process.exit(r.status ?? 1);
