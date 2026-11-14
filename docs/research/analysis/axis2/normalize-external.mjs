// Trục 2 (b), bộ dự phòng: quy ca ole-tail/agentic-execution-guardrail-eval về một lệnh shell theo QUY TẮC CỐ ĐỊNH 1–7 (preregistration.md §9 dòng 1215). Không LLM, KHÔNG chạy guardDecision.
// Chạy: node docs/research/analysis/axis2/normalize-external.mjs --jsonl <eval_cases.jsonl> --repo <gốc repo> --redcode-cases <cases-normalized.jsonl> --out <thư mục kết quả>
// Dữ liệu tải về là không tin cậy: chỉ ĐỌC JSONL, không thực thi gì.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const jsonl = arg('--jsonl'), repo = arg('--repo'), rc = arg('--redcode-cases'), out = arg('--out');
if (!jsonl || !repo || !rc || !out) { console.error('Thiếu tham số'); process.exit(2); }
const norm = (c) => c.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
const rows = fs.readFileSync(jsonl, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const EXP = new Set(['blocked', 'approved', 'require_approval']);
const bad = rows.filter((r) => !EXP.has(r.expected_verdict));
if (bad.length) { console.error(`expected_verdict thiếu/lạ ở ${bad.length} dòng: chưa đo chặn nhầm`); process.exit(3); }
const steps = [{ step: 'công bố: dòng trong eval_cases.jsonl', n: rows.length }];
const excluded = []; const drop = (list, why) => list.forEach((r) => excluded.push({ id: r.id, rule: why }));
// Quy tắc 2 (loại): khối mã (```), mã Python (import/eval/exec), ngôn ngữ tự nhiên (câu bắt đầu bằng chữ hoa — mọi lệnh shell trong bộ này bắt đầu bằng chữ thường hoặc đường dẫn)
// Quy tắc 1 (giữ): đúng MỘT dòng (chuỗi ;/&&/| do tác giả viết tính là một ca); nhiều dòng loại.
let cur = rows;
const fence = cur.filter((r) => r.payload.includes('```')); drop(fence, 'quy tắc 2: khối mã Python/ngoài shell (```)'); cur = cur.filter((r) => !fence.includes(r));
steps.push({ step: 'quy tắc 2: loại khối mã (```)', n: cur.length });
const multi = cur.filter((r) => r.payload.replace(/\r/g, '').split('\n').filter((l) => l.trim()).length !== 1); drop(multi, 'quy tắc 1: nhiều dòng (kịch bản/tài liệu/ngữ cảnh ngoài chuỗi lệnh)'); cur = cur.filter((r) => !multi.includes(r));
steps.push({ step: 'quy tắc 1: giữ đúng một dòng', n: cur.length });
const nl = cur.filter((r) => /^[A-Z]/.test(r.payload.trim())); drop(nl, 'quy tắc 2: câu ngôn ngữ tự nhiên (bắt đầu bằng chữ hoa)'); cur = cur.filter((r) => !nl.includes(r));
steps.push({ step: 'quy tắc 2: loại câu ngôn ngữ tự nhiên', n: cur.length });
cur = cur.map((r) => ({ ...r, cmd: norm(r.payload) }));
const seen = new Set(); const uniq = cur.filter((r) => (seen.has(r.cmd) ? false : (seen.add(r.cmd), true)));
steps.push({ step: 'quy tắc 4a: khử trùng trong bộ', n: uniq.length });
// 4b: tập tự viết (cùng cách trích với normalize-cases.mjs)
function literals(s) { const r = []; const BS = String.fromCharCode(92); for (let i = 0; i < s.length; i++) { const q = s[i]; if (q !== "'" && q !== '"' && q !== '`') continue; let v = ''; i++; for (; i < s.length && s[i] !== q; i++) { if (s[i] === BS) { i++; } v += s[i]; } r.push(v); } return r; }
function arrayBlock(src, name) { const i = src.indexOf(`const ${name}`); const st = src.indexOf('= [', i) + 2; let d = 0; for (let k = st; k < src.length; k++) { if (src[k] === '[') d++; else if (src[k] === ']' && --d === 0) return src.slice(st, k + 1); } return ''; }
const t1 = fs.readFileSync(path.join(repo, 'test/shell-policy-adversarial.test.ts'), 'utf8');
const t2 = fs.readFileSync(path.join(repo, 'test/claude-guard.test.ts'), 'utf8');
const own = new Set([...literals(arrayBlock(t1, 'ALLOWED')), ...literals(arrayBlock(t1, 'DENIED')).filter((_, i) => i % 2 === 1),
  ...[...t2.matchAll(/command: *([^,}]+)/g)].map((m) => literals(m[1])[0]).filter((x) => x != null),
  ...[...t2.matchAll(/for [(]const c of [[]([^]]*)]/g)].flatMap((m) => literals(m[1]))].map(norm));
const a4b = uniq.filter((r) => !own.has(r.cmd));
steps.push({ step: 'quy tắc 4b: khử trùng với tập tự viết', n: a4b.length, removed: uniq.length - a4b.length, ownSetSize: own.size });
const rcSet = new Set(fs.readFileSync(rc, 'utf8').split('\n').filter(Boolean).map((l) => norm(JSON.parse(l).cmd)));
const a4c = a4b.filter((r) => !rcSet.has(r.cmd));
steps.push({ step: 'quy tắc 4c: khử trùng với RedCode (82 ca)', n: a4c.length, removed: a4b.length - a4c.length });
steps.push({ step: 'quy tắc 6: rút mẫu nếu > 500', n: a4c.length, sampled: false });
const final = a4c.map((r, i) => ({ id: `ext-${String(i + 1).padStart(3, '0')}`, set: 'external-guardrail', source: `ole-tail/agentic-execution-guardrail-eval#${r.id} (huggingface.co/datasets/ole-tail/agentic-execution-guardrail-eval, CC BY 4.0)`, group: r.category, expected: r.expected_verdict, cmd: r.cmd }));
const byExp = {}; for (const r of final) byExp[r.expected] = (byExp[r.expected] ?? 0) + 1;
steps.push({ step: 'n đo (ghi ra cases-external.jsonl)', n: final.length, byExpected: byExp });
fs.mkdirSync(out, { recursive: true });
const body = final.map((r) => JSON.stringify(r)).join('\n') + '\n';
fs.writeFileSync(path.join(out, 'cases-external.jsonl'), body);
fs.writeFileSync(path.join(out, 'normalize-external-steps.json'), JSON.stringify({ steps, excluded }, null, 2) + '\n');
for (const s of steps) console.log(`${s.n}\t${s.step}${s.removed != null ? ` (loại ${s.removed})` : ''}`);
console.log('expected:', JSON.stringify(byExp), '| sha256:', crypto.createHash('sha256').update(body).digest('hex'));
