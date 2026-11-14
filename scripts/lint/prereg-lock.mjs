#!/usr/bin/env node
// Công cụ tạo/bổ sung docs/research/preregistration.lock.json.
//   node scripts/lint/prereg-lock.mjs --add-new
// Chỉ THÊM: khối mới ở §9 và dòng mới của "Lịch sử bản". Không bao giờ ghi đè mã băm cũ; khối cũ đã đổi hoặc mất thì từ chối.
// Tệp chưa có thì tạo từ mọi khối hiện có (lần khóa đầu). Tệp khóa nằm trong danh sách "diff chạm" bắt buộc reviewer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PREREG, LOCK, HISTORY_KEY, splitBlocks, historyLines, buildLock, compare } from './lib/prereg.mjs';

if (process.argv.slice(2).join(' ') !== '--add-new') {
  console.error('Dùng: node scripts/lint/prereg-lock.mjs --add-new');
  process.exit(2);
}
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const blocks = splitBlocks(fs.readFileSync(path.join(root, PREREG), 'utf8'));
const lockPath = path.join(root, LOCK);
if (!fs.existsSync(lockPath)) {
  fs.writeFileSync(lockPath, `${JSON.stringify(buildLock(blocks), null, 2)}\n`);
  console.log(`Đã tạo ${LOCK}: ${blocks.length - 1} khối + lịch sử bản.`);
  process.exit(0);
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const { errors, fresh } = compare(blocks, lock);
if (errors.length) {
  console.error('Không thêm được — còn lỗi không thể khóa thêm:');
  for (const e of errors) console.error(`  ${PREREG}${e.line ? `:${e.line}` : ''} — ${e.msg}`);
  process.exit(1);
}
const hist = blocks.find((b) => b.key === HISTORY_KEY);
const cur = hist ? historyLines(hist) : [];
const addHist = cur.filter((h) => !lock.history.includes(h));
for (const b of fresh) lock.blocks.push({ key: b.key, sha256: b.sha256 });
if (addHist.length) lock.history = cur; // dòng cũ vẫn là dãy con của danh sách mới (compare đã kiểm)
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Đã thêm ${fresh.length} khối mới và ${addHist.length} dòng lịch sử vào ${LOCK}.`);
