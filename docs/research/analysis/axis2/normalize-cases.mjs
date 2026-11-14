// Trục 2 (b): quy ca RedCode-Exec (Bash) về một lệnh shell bằng QUY TẮC CỐ ĐỊNH 1–7 (preregistration.md §9, dòng 1215). Không LLM, không chạy guardDecision.
// Chạy: node docs/research/analysis/axis2/normalize-cases.mjs --redcode <thư-mục bash2text_dataset_json> --repo <gốc repo> --out <thư-mục kết quả>
// Dữ liệu tải về là dữ liệu không tin cậy: script chỉ ĐỌC JSON, không thực thi gì trong thư mục đó.
// Ghi: <out>/cases-normalized.jsonl, <out>/normalize-steps.json (n sau từng bước).
import fs from 'node:fs';
import path from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const dir = arg('--redcode'), repo = arg('--repo'), out = arg('--out');
if (!dir || !repo || !out) { console.error('Thiếu --redcode, --repo hoặc --out'); process.exit(2); }
const MAX_N = 500; // quy tắc 6; SEED chỉ dùng nếu vượt
const norm = (c) => c.replace(/\r/g, '').replace(/\s+/g, ' ').trim();

// --- Đọc toàn bộ mục Bash của RedCode-Exec
const raw = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  for (const e of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) raw.push({ file: f, index: e.Index, lang: e.Language, code: e.Code ?? '' });
}
const steps = [{ step: 'công bố: mục Bash trong bash2text_dataset_json', n: raw.length }];

// --- Quy tắc 1 + 2: bỏ shebang/dòng chú thích/dòng trống; giữ ca còn đúng MỘT dòng lệnh (dòng tiếp nối bằng "\" tính là nhiều dòng → loại)
const effLines = (code) => code.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
let cur = raw.map((r) => ({ ...r, lines: effLines(r.code) }));
cur = cur.filter((r) => r.lines.length === 1);
steps.push({ step: 'quy tắc 1: đúng một dòng lệnh (sau bỏ shebang/chú thích/dòng trống)', n: cur.length });
// quy tắc 2: loại Python/PowerShell, ngôn ngữ tự nhiên rõ (không có ở Code), ca cần ngữ cảnh ngoài chuỗi lệnh
const INTERP = /^(python[\d.]*|pwsh|powershell)(\s|$)/i;
cur = cur.filter((r) => !INTERP.test(r.lines[0].trim()) && (r.lang ?? 'bash').toLowerCase() === 'bash');
steps.push({ step: 'quy tắc 2: loại mã Python/PowerShell', n: cur.length });
cur = cur.map((r) => ({ ...r, cmd: norm(r.lines[0]) }));

// --- Quy tắc 4: khử trùng trong bộ (giữ lần đầu theo thứ tự tệp/chỉ số)
const seen = new Set(); const uniq = [];
for (const r of cur) { if (!seen.has(r.cmd)) { seen.add(r.cmd); uniq.push(r); } }
steps.push({ step: 'quy tắc 4a: khử trùng trong bộ (chuẩn hóa khoảng trắng)', n: uniq.length });

// --- Quy tắc 4b: khử trùng với tập tự viết = mọi chuỗi trong mảng ALLOWED/DENIED (shell-policy-adversarial) + chuỗi `command:`/mảng lệnh trong claude-guard.test
function literals(s) { const r = []; const BS = String.fromCharCode(92); for (let i = 0; i < s.length; i++) { const q = s[i]; if (q !== "'" && q !== '"' && q !== '`') continue; let v = ''; i++; for (; i < s.length && s[i] !== q; i++) { if (s[i] === BS) { i++; } v += s[i]; } r.push(v); } return r; }
function arrayBlock(src, name) { const i = src.indexOf(`const ${name}`); const st = src.indexOf('= [', i) + 2; let d = 0; for (let k = st; k < src.length; k++) { if (src[k] === '[') d++; else if (src[k] === ']' && --d === 0) return src.slice(st, k + 1); } return ''; }
const t1 = fs.readFileSync(path.join(repo, 'test/shell-policy-adversarial.test.ts'), 'utf8');
const t2 = fs.readFileSync(path.join(repo, 'test/claude-guard.test.ts'), 'utf8');
const allowedLits = literals(arrayBlock(t1, 'ALLOWED'));
const deniedBlock = arrayBlock(t1, 'DENIED');
// DENIED là mảng cặp [tên, lệnh]: lấy chuỗi thứ hai của mỗi cặp theo thứ tự xuất hiện
function literalPairs(b) { const l = literals(b); return l.filter((_, i) => i % 2 === 1); }
const deniedTuples = literalPairs(deniedBlock);
const guardCmds = [...t2.matchAll(/command: *([^,}]+)/g)].map((m) => literals(m[1])[0]).filter((x) => x != null);
const guardArr = [...t2.matchAll(/for [(]const c of [[]([^]]*)]/g)].flatMap((m) => literals(m[1]));
const own = new Set([...allowedLits, ...deniedTuples, ...guardCmds, ...guardArr].map(norm));
const ownStats = { ALLOWED: allowedLits.length, DENIED: deniedTuples.length, 'claude-guard.test (command: + mảng)': guardCmds.length + guardArr.length, 'chuỗi duy nhất sau chuẩn hóa': own.size };
const afterOwn = uniq.filter((r) => !own.has(r.cmd));
steps.push({ step: 'quy tắc 4b: khử trùng với tập tự viết', n: afterOwn.length, removed: uniq.length - afterOwn.length, ownSet: ownStats });
steps.push({ step: 'quy tắc 4c: khử trùng giữa hai bộ (bộ dự phòng không tải: bộ chính quy được ≥ 30 ca)', n: afterOwn.length, removed: 0 });
if (afterOwn.length > MAX_N) { console.error('> 500 ca: cần rút mẫu có hạt giống (quy tắc 6) — chưa hiện thực vì n thực tế nhỏ hơn'); process.exit(3); }
steps.push({ step: 'quy tắc 6: rút mẫu nếu > 500', n: afterOwn.length, sampled: false });

fs.mkdirSync(out, { recursive: true });
const rows = afterOwn.map((r, i) => ({
  id: `redcode-${String(i + 1).padStart(3, '0')}`,
  set: 'redcode',
  source: `RedCode-Exec/bash2text_dataset_json/${r.file}#Index=${r.index} (github.com/AI-secure/RedCode, dataset/ CC BY 4.0)`,
  group: r.index.split('_')[0],
  expected: 'blocked',
  cmd: r.cmd,
}));
fs.writeFileSync(path.join(out, 'cases-normalized.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const byGroup = {}; for (const r of rows) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
steps.push({ step: 'n đo (ghi ra cases-normalized.jsonl)', n: rows.length, byGroup });
fs.writeFileSync(path.join(out, 'normalize-steps.json'), JSON.stringify(steps, null, 2) + '\n');
for (const s of steps) console.log(`${s.n}\t${s.step}${s.removed != null ? ` (loại ${s.removed})` : ''}`);
console.log('nhóm:', JSON.stringify(byGroup), '| tập tự viết:', JSON.stringify(ownStats));
