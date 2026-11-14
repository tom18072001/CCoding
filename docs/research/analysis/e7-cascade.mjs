#!/usr/bin/env node
// [Khám phá] E7: kiểm lại phép tính cascade nghiệm thu (R1 Sonnet chặn trước → chỉ ca R1 chặn mới xét R2 Opus) từ results/e7-cto/.
//   node docs/research/analysis/e7-cascade.mjs            # in markdown ra stdout
//   node docs/research/analysis/e7-cascade.mjs --check    # so với docs/research/analysis/e7-cascade.md (exit 1 nếu lệch)
// Chỉ đọc results/e7-cto/ (items.json, selected.json, runs.jsonl, label-trials.jsonl). Không gọi LLM. Không sửa e7/*.
// Ngữ nghĩa đã khóa (preregistration §9, sai lệch E7 13/11): mỗi cặp (mục, arm) lấy DÒNG CUỐI nếu `done` (logic của
// e7/analyze.mjs latestDone, sao chép vì không import được mà không kéo theo cả phần bootstrap); 16 lượt 403 của R1/R2 đã được
// reclassify.mjs ghi dòng `infra` và chạy lại. R3 không dùng ở đây.
// CI: Clopper–Pearson qua `cp` của g-analyze.mjs (cùng hàm e7/analyze.mjs dùng; harness/stats.mjs không có CP).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp } from './g-analyze.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const DIR = path.join(ROOT, 'bench', 'vs-claude', 'results', 'e7-cto');
const jl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const items = (() => { const d = JSON.parse(fs.readFileSync(path.join(DIR, 'items.json'), 'utf8')); return [...d.items, ...Object.values(d.reserve).flatMap((r) => [...r.faulty, ...r.clean])]; })();
const selected = JSON.parse(fs.readFileSync(path.join(DIR, 'selected.json'), 'utf8')).items;
const rows = jl(path.join(DIR, 'runs.jsonl'));
const labelTrials = jl(path.join(DIR, 'label-trials.jsonl'));

const byId = new Map(items.map((x) => [x.id, x]));
const sel = selected.map((id) => byId.get(id));
const lastRow = new Map();
for (const r of rows) lastRow.set(`${r.id}__${r.arm}`, r);
const last = new Map();
for (const [k, r] of lastRow) if (r.status === 'done' && r.verdict) last.set(k, r);
const reclass = new Set(rows.filter((r) => r.reclassified).map((r) => r.id)); // mục có cặp R1/R2 bị phân loại lại
const reclassPairs = new Set(rows.filter((r) => r.reclassified).map((r) => `${r.id}__${r.arm}`));

const pct = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') : '—');
const usd = (x) => x.toFixed(2).replace('.', ',');
const frac = (k, n) => { const c = cp(k, n); return `${k}/${n} = ${pct(k / n)} % | [${pct(c[0])}; ${pct(c[1])}]`; };

/** Một cách chấm. isBlock(r): cách đọc "chặn" của một dòng. keep: lọc mục. costUsd của dòng được chọn; thiếu thì đếm vào `missing`. */
function scheme(name, keep, isBlock) {
  const S = sel.filter(keep);
  const out = { name, faulty: { n: 0, k: 0 }, clean: { n: 0, k: 0 }, usd: 0, runs: 0, missing: 0 };
  for (const x of S) {
    const r1 = last.get(`${x.id}__R1`), r2 = last.get(`${x.id}__R2`);
    if (!r1 || !r2) throw new Error(`thiếu dòng done cho ${x.id}`);
    const used = name === 'R1 đơn' ? [r1] : name === 'R2 đơn' ? [r2] : (isBlock(r1) ? [r1, r2] : [r1]);
    const blocked = name === 'R1 đơn' ? isBlock(r1) : name === 'R2 đơn' ? isBlock(r2) : isBlock(r1) && isBlock(r2);
    const t = out[x.kind]; t.n++; if (blocked) t.k++;
    for (const r of used) { if (r.costUsd == null) out.missing++; else out.usd += r.costUsd; out.runs++; }
  }
  return out;
}
const strict = (r) => r.verdict === 'block';
const lenient = (r) => r.verdict === 'block' || r.verdict === 'unparsed';
const all = () => true;
const noReclass = (x) => !reclass.has(x.id);
const SCH = ['Cascade', 'R2 đơn', 'R1 đơn'];
const table = (title, keep, isBlock) => {
  const res = SCH.map((s) => scheme(s, keep, isBlock));
  const L = [`### ${title}`, '', '| Cách | Mục lỗi: recall k/n | CP 95 % | Mục đúng: chặn nhầm k/n | CP 95 % | Lượt chạy | USD (costUsd) |', '|---|---|---|---|---|--:|--:|'];
  for (const o of res) L.push(`| ${o.name} | ${frac(o.faulty.k, o.faulty.n)} | ${frac(o.clean.k, o.clean.n)} | ${o.runs} | ${usd(o.usd)}${o.missing ? ` (thiếu cost ${o.missing} dòng)` : ''} |`);
  return { res, md: L.join('\n') };
};

const main = table('Bảng 1 (chính): dòng cuối mỗi cặp, đã phân loại lại; "không đọc được" = không chặn', all, strict);
const sensI = table('Bảng 2 (độ nhạy i): coi "không đọc được kết luận" là chặn', all, lenient);
const sensII = table(`Bảng 3 (độ nhạy ii): bỏ các mục có cặp bị phân loại lại (${reclass.size} mục)`, noReclass, strict);
const [cas, r2] = main.res;
const missingAny = sel.reduce((s, x) => s + ['R1', 'R2'].filter((a) => last.get(`${x.id}__${a}`).costUsd == null).length, 0);

// ── số liệu phục vụ đối chiếu ──
const cnt = (kind, f) => sel.filter((x) => x.kind === kind && f(last.get(`${x.id}__R1`), last.get(`${x.id}__R2`))).length;
const r1BlockFaulty = cnt('faulty', (a) => strict(a));
const r1CleanBlock = cnt('clean', (a) => strict(a));
const r1BlockAll = r1BlockFaulty + r1CleanBlock;
const r1OnlyClean = cnt('clean', (a, b) => strict(a) && !strict(b));
const r1OnlyFaulty = cnt('faulty', (a, b) => strict(a) && !strict(b));
const r2OnlyFaulty = cnt('faulty', (a, b) => !strict(a) && strict(b));
const bothFaulty = cnt('faulty', (a, b) => strict(a) && strict(b));
const r2Unp = { faulty: cnt('faulty', (a, b) => b.verdict === 'unparsed'), clean: cnt('clean', (a, b) => b.verdict === 'unparsed') };
const r2UnpAndR1Block = sel.filter((x) => strict(last.get(`${x.id}__R1`)) && last.get(`${x.id}__R2`).verdict === 'unparsed').length;
const sumCost = (arm, f = () => true) => sel.filter(f).reduce((s, x) => s + last.get(`${x.id}__${arm}`).costUsd, 0);
const R1all = sumCost('R1'), R2all = sumCost('R2');
const R2onBlocked = sumCost('R2', (x) => strict(last.get(`${x.id}__R1`)));
const ratio = R2onBlocked / R2all;
const nReclassPairs = reclassPairs.size;
const lt = new Map(labelTrials.map((r) => [r.id, r]));
const labelOk = sel.every((x) => (x.kind === 'faulty' ? lt.get(x.id)?.fails === lt.get(x.id)?.trials : lt.get(x.id)?.fails === 0));
const ok = (b) => (b ? 'đúng' : '**sai**');
const dec = (x, d = 2) => x.toFixed(d).replace('.', ',');

const L = [];
L.push('# E7: kiểm lại phép tính cascade nghiệm thu — [Khám phá]', '');
L.push('> **[Khám phá].** Phép tính này đặt ra **sau khi đã thấy** kết quả E7 (cascade không nằm trong giả thuyết đã đăng ký); không có giá trị xác nhận. Không gọi LLM. Sinh bởi `node docs/research/analysis/e7-cascade.mjs`; dữ liệu `bench/vs-claude/results/e7-cto/`.', '');
L.push('## Cách tính', '',
  `- **Mẫu:** ${sel.length} mục chốt (${sel.filter((x) => x.kind === 'faulty').length} lỗi, ${sel.filter((x) => x.kind === 'clean').length} đúng); nhãn kiểm 3 lần ${labelOk ? 'khớp cả 128 mục (mục lỗi trượt 3/3, mục đúng đạt 3/3)' : '**không khớp**'} (\`label-trials.jsonl\`).`,
  `- **Quan sát:** dòng cuối của mỗi cặp (mục, arm) nếu \`done\` (như \`e7/analyze.mjs\`); ${nReclassPairs} lượt 403 của R1/R2 đã bị \`reclassify.mjs\` chuyển thành \`infra\` và dùng lượt chạy lại. Chạm trần lượt của R3 không liên quan (R3 không dùng ở đây).`,
  '- **Cascade:** R1 (Sonnet) chấm mọi mục; chỉ mục R1 chặn mới chuyển R2 (Opus); chặn khi cả hai chặn. **R2 đơn / R1 đơn:** một arm chấm mọi mục.',
  '- **"Chặn"** = `verdict = block`; `pass` và `unparsed` (không đọc được kết luận) là không chặn, trừ bảng 2.',
  `- **Chi phí:** \`costUsd\` của dòng được chọn. Cascade = R1 trên mọi mục + R2 chỉ trên mục R1 chặn. Số dòng được chọn thiếu \`costUsd\`: **${missingAny}**${missingAny === 0 ? ' → không phải ước tính từ `tokens`; mọi chi phí là `costUsd` ghi sẵn' : ''}. Tổng đủ 128 mục: R1 ${usd(R1all)}, R2 ${usd(R2all)} USD.`,
  '- **CI:** Clopper–Pearson 95 % hai phía bằng `cp` của `g-analyze.mjs` (hàm `e7/analyze.mjs` dùng; `harness/stats.mjs` không có CP).', '');
L.push('## Kết quả', '', main.md, '', sensI.md, '', sensII.md, '');
L.push('Ghi chú đọc bảng:',
  '- Cascade chặn khi cả R1 và R2 chặn, nên từng mục cascade chặn ⊆ R1 chặn ∩ R2 chặn; recall và chặn nhầm của cascade không vượt R1 và R2 đơn.',
  `- Bảng 1 tính 13 lượt R2 "không đọc được" (${r2Unp.faulty} lỗi, ${r2Unp.clean} đúng) là không chặn; bảng 2 đảo cách đọc đó. Mọi kết luận cần đứng ở cả ba bảng; không đứng được thì ghi "không kết luận".`, '');
L.push('## Đối chiếu tính nhanh', '', 'Nguồn: `docs/research/context/decomposition-literature-2026-11-14.md` §4 (không sửa tệp đó). Cột "Tính lại" lấy từ bảng 1.', '',
  '| Số trong tính nhanh | Tính lại | Kết luận |', '|---|---|---|');
L.push(`| Cascade recall mục lỗi 55/64 = 85,9 % ("như R2") | ${cas.faulty.k}/${cas.faulty.n} = ${pct(cas.faulty.k / cas.faulty.n)} % | ${ok(cas.faulty.k === 55)}: R1 chỉ chặn ${r1OnlyFaulty}, R2 chỉ chặn ${r2OnlyFaulty}, cả hai chặn ${bothFaulty}. |`);
L.push(`| Cascade chặn nhầm 3/64 = 4,7 % | ${cas.clean.k}/${cas.clean.n} = ${pct(cas.clean.k / cas.clean.n)} % | ${ok(cas.clean.k === 3)}: R1 chặn ${r1CleanBlock}, chỉ R1 chặn ${r1OnlyClean}, nên cả hai chặn = ${r1CleanBlock} − ${r1OnlyClean} = ${r1CleanBlock - r1OnlyClean}. |`);
L.push(`| R1 chặn 27 mục đúng | ${r1CleanBlock} | ${ok(r1CleanBlock === 27)} |`);
L.push(`| Chỉ R1 chặn 24 mục đúng, chỉ R2 chặn 1 | ${r1OnlyClean} và ${cnt('clean', (a, b) => !strict(a) && strict(b))} | ${ok(r1OnlyClean === 24)} |`);
L.push(`| Chỉ R1 chặn 8 mục lỗi, chỉ R2 chặn 0 | ${r1OnlyFaulty} và ${r2OnlyFaulty} | ${ok(r1OnlyFaulty === 8 && r2OnlyFaulty === 0)} (khớp \`report.md\` dòng 29) |`);
L.push(`| Opus chạy trên ~90/128 mục | ${cas.runs - 128}/128 (số mục R1 chặn: ${r1BlockFaulty} lỗi + ${r1CleanBlock} đúng) | ${ok(cas.runs - 128 === 90)} |`);
L.push(`| Chi phí ≈ R1 + 0,7 × R2 | R1 ${usd(R1all)} + R2 trên ca R1 chặn ${usd(R2onBlocked)} = **${usd(cas.usd)}** USD. Công thức 0,7 × R2 = ${usd(0.7 * R2all)}; thực tế R2 trên ca R1 chặn = ${dec(ratio)} × R2 đủ (${usd(R2onBlocked)}/${usd(R2all)}) | ${ok(Math.abs(ratio - 0.7) < 0.03)} về hệ số 0,7 (trùng với 90/128 = 0,70 tính theo số lượt; tỉ lệ chi phí là phép chia riêng, ra ${dec(ratio, 3)}). |`);
L.push(`| "Cascade không rẻ hơn Opus đơn" | cascade ${usd(cas.usd)} so với R2 đơn ${usd(r2.usd)} USD | ${ok(cas.usd >= r2.usd)}: cascade ${cas.usd < r2.usd ? 'rẻ hơn' : 'đắt hơn'} R2 đơn ${usd(Math.abs(r2.usd - cas.usd))} USD |`);
L.push(`| "Chỉ bớt 1 ca chặn nhầm" (R2 đơn → cascade) | R2 đơn ${r2.clean.k}/64, cascade ${cas.clean.k}/64 | ${ok(r2.clean.k - cas.clean.k === 1)} |`);
L.push(`| "R2 có 13 lượt không đọc được" | ${r2Unp.faulty + r2Unp.clean} (${r2Unp.faulty} lỗi, ${r2Unp.clean} đúng); trong đó R1 chặn ${r2UnpAndR1Block} mục | ${ok(r2Unp.faulty + r2Unp.clean === 13)}; tính nhanh không nói cách xử lý: bảng 2 cho thấy nếu coi là chặn thì kết quả đổi. |`, '');
const [cas2, r2b] = sensI.res, [cas3, r23] = sensII.res;
L.push(`**Kết luận đối chiếu:** mọi con số trong tính nhanh khớp khi tính lại từ dòng cuối mỗi cặp đã phân loại lại; bảng 1 không có số sai. Điều tính nhanh bỏ ngỏ: (1) cách xử lý 13 lượt R2 "không đọc được": coi là chặn (bảng 2) thì chặn nhầm của R2 đơn là ${r2b.clean.k}/64 chứ không phải ${r2.clean.k}/64, cascade ${cas2.clean.k}/64, recall cascade ${cas2.faulty.k}/64 chứ không phải ${cas.faulty.k}/64; (2) chênh ${r2.clean.k - cas.clean.k} ca chặn nhầm giữa R2 đơn (${r2.clean.k}/64) và cascade (${cas.clean.k}/64) nằm trong hai CI chồng lấn gần hoàn toàn, không phân biệt được; (3) chi phí cascade cao hơn R2 đơn ở cả ba bảng (${usd(cas.usd - r2.usd)}; ${usd(cas2.usd - r2b.usd)}; ${usd(cas3.usd - r23.usd)} USD). Paper chỉ dùng số của tệp này, kèm một câu ghi chú rằng bản tính nhanh trước đó đã được kiểm lại.`, '');
L.push('## Giới hạn', '',
  '- Tất cả là [Khám phá]: cascade, hai bảng độ nhạy và đối chiếu đặt ra sau khi đã thấy kết quả E7; không có kiểm định, không suy rộng ra ngoài 128 mục của 8 bài.',
  '- 64 mục lỗi + 64 mục đúng ghép cặp theo bài; các mục cùng bài không độc lập, nên CI Clopper–Pearson (coi mục độc lập) có thể hẹp hơn thực tế; bootstrap theo bài nằm ở `report.md`.',
  '- Cascade là phép tái dựng từ dòng R1 và R2 đã chạy độc lập trên mọi mục; chưa chạy cascade thật (R2 chưa từng được gọi có điều kiện).',
  '- R2 "không đọc được" 13 lượt (chạm trần lượt): recall và chặn nhầm của R2 đơn và cascade có thể khác khi nâng trần lượt.');

const text = `${L.join('\n')}\n`;
if (process.argv.includes('--check')) {
  const f = path.join(HERE, 'e7-cascade.md');
  const same = fs.existsSync(f) && fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') === text;
  console.log(same ? 'OK: e7-cascade.md trùng đầu ra script.' : 'LỆCH: e7-cascade.md khác đầu ra script.');
  process.exit(same ? 0 : 1);
}
process.stdout.write(text);
