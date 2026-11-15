// D12/S4: so từng dòng bảng giả thuyết của report.md trước/sau D12 (đầu ra của d12-before-after.sh).
// Dùng: node docs/research/analysis/d12-diff-rows.mjs <OUT> [thư mục con ...]   — chỉ đọc, in ra stdout.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) { console.error('Thiếu <OUT>'); process.exit(1); }
const subs = process.argv.length > 3 ? process.argv.slice(3) : fs.readdirSync(path.join(out, 'after')).sort();
const rows = (f) => {
  const m = new Map();
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!l.startsWith('| ') || /^\| -/.test(l)) continue;
    const c = l.split(' | ').map((s) => s.replace(/^\| /, '').replace(/ \|$/, ''));
    if (c.length < 3) continue;
    let k = c[0], n = 1;
    while (m.has(k)) k = `${c[0]}#${++n}`;
    m.set(k, c.slice(1));
  }
  return m;
};
for (const s of subs) {
  const b = rows(path.join(out, 'before', s, 'report.md')), a = rows(path.join(out, 'after', s, 'report.md'));
  console.log(`\n### ${s}`);
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const x = b.get(k), y = a.get(k);
    if (x && y && x.join('|') === y.join('|')) continue;
    console.log(`- ${k}`);
    console.log(`  TRƯỚC: ${x ? x.join(' | ') : '(không có dòng)'}`);
    console.log(`  SAU:   ${y ? y.join(' | ') : '(không có dòng)'}`);
  }
}
