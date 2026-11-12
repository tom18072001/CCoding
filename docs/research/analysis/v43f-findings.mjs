#!/usr/bin/env node
// BRIEF-19 K1 (S1): tính lại ba phát hiện của E4, E5′ từ tệp đã commit. Chỉ đọc, không gọi LLM, không p mới.
//   node docs/research/analysis/v43f-findings.mjs
// (1) CTO chặn trên lượt sạch (62/65): tách theo bài và cỡ bài, Clopper–Pearson 95 %.
// (2) B7cab so với B7cabO chặn trên lượt có test ẩn đạt: tách theo bài (khám phá, ngoài đăng ký (5)/(6)).
// (3) R̂ E5′: tách phần token của họp (discuss + finalize) khỏi phần do số hạng mục kế hoạch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp } from './g-analyze.mjs';
import { mcnemarExact } from '../../../bench/vs-claude/e7/analyze.mjs';
import { bootstrapRatio, mean } from './prereg-tests.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RES = (d, f = 'runs.jsonl') => path.join(ROOT, 'bench/vs-claude/results', d, f);
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const usable = (rows) => rows.filter((r) => r.status === 'done' && !r.excluded && !r.leak);
const pct = (x) => `${(100 * x).toFixed(1).replace('.', ',')} %`;
const f3 = (x) => x.toFixed(3).replace('.', ',');
const ci = (k, n) => { const [a, b] = cp(k, n); return `[${pct(a)}; ${pct(b)}]`; };
const out = [];
const P = (...a) => out.push(...(a.length ? a : ['']));

// ───── (1) CTO trên lượt sạch ─────
const clean = [['E3', 'large-pilot'], ['E5′', 'b15f-main'], ['E6', 'h6-3e']].flatMap(([n, d]) => usable(load(RES(d))).filter((r) => r.gates && !/^g[1-6]-/.test(r.task)).map((r) => ({ ...r, _src: n })));
const cto = clean.filter((r) => r.gates.cto);
P('### Phát hiện 1: CTO chặn lượt sạch', '');
P(`Lượt sạch có bản ghi cổng cto: ${cto.length}; CTO chặn ${cto.filter((r) => !r.gates.cto.pass).length}; test ẩn đạt ${cto.filter((r) => r.pass === true).length}/${cto.length}.`, '');
P('| Bài | Cỡ bài (size) | Nguồn | Arm | Làn | n | CTO chặn | CP 95 % | test ẩn đạt |', '|---|---|---|---|---|---|---|---|---|');
const keyOf = (r) => `${r.task}|${r._src}|${r.arm}|${r.lane}`;
const groups = new Map();
for (const r of cto) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
for (const [k, rs] of [...groups].sort((a, b) => a[1][0].size - b[1][0].size || a[0].localeCompare(b[0]))) {
  const b = rs.filter((r) => !r.gates.cto.pass).length;
  P(`| ${rs[0].task} | ${rs[0].size ?? '—'} | ${rs[0]._src} | ${rs[0].arm} | ${rs[0].lane} | ${rs.length} | ${b} | ${ci(b, rs.length)} | ${rs.filter((r) => r.pass === true).length}/${rs.length} |`);
}
P('', '| Nhóm theo cỡ bài | n | CTO chặn | CP 95 % |', '|---|---|---|---|');
const bySize = (lo, hi, label) => { const rs = cto.filter((r) => r.size >= lo && r.size <= hi); const b = rs.filter((r) => !r.gates.cto.pass).length; P(`| ${label} | ${rs.length} | ${b} | ${rs.length ? ci(b, rs.length) : '—'} |`); };
bySize(0, 4, 'size ≤ 4'); bySize(5, 6, 'size 5–6'); bySize(7, 99, 'size ≥ 7');
const passB = cto.filter((r) => r.pass === true), failB = cto.filter((r) => r.pass === false);
P('', `Theo nhãn test ẩn cuối lượt: đạt → CTO chặn ${passB.filter((r) => !r.gates.cto.pass).length}/${passB.length} ${ci(passB.filter((r) => !r.gates.cto.pass).length, passB.length)}; không đạt → CTO chặn ${failB.filter((r) => !r.gates.cto.pass).length}/${failB.length}.`, '');

// ───── (2) B7cab so với B7cabO ─────
const e4 = usable(load(RES('gates-main')));
const arm = (a) => e4.filter((r) => r.arm === a && /^g[1256]-/.test(r.task) && r.gates?.cto);
P('### Phát hiện 2: B7cab so với B7cabO, chặn trên lượt có test ẩn đạt (khám phá)', '');
P('| Bài | B7cab chặn/đạt | CP 95 % | B7cabO chặn/đạt | CP 95 % | chỉ Sonnet chặn | chỉ Opus chặn |', '|---|---|---|---|---|---|---|');
let tb = 0, tc = 0;
for (const t of ['g1-slug-dedupe', 'g2-cart-coupon', 'g5-median-stats', 'g6-range-merge']) {
  const s = arm('B7cab').filter((r) => r.task === t && r.pass === true), o = arm('B7cabO').filter((r) => r.task === t && r.pass === true);
  const sb = s.filter((r) => !r.gates.cto.pass).length, ob = o.filter((r) => !r.gates.cto.pass).length;
  let b = 0, c = 0;
  for (const r of arm('B7cab').filter((x) => x.task === t)) { const x = arm('B7cabO').find((y) => y.task === t && y.rep === r.rep); if (!x) continue; const a1 = !r.gates.cto.pass, a2 = !x.gates.cto.pass; if (a1 && !a2) b++; else if (!a1 && a2) c++; }
  tb += b; tc += c;
  P(`| ${t} | ${sb}/${s.length} | ${ci(sb, s.length)} | ${ob}/${o.length} | ${ci(ob, o.length)} | ${b} | ${c} |`);
}
P('', `Gộp: McNemar chính xác ${tb} so với ${tc}: p = ${mcnemarExact(tb, tc).toExponential(1).replace('.', ',')}. Cỡ hiệu ứng thô: ${pct(23 / 64)} so với ${pct(1 / 64)} (B7cab, B7cabO).`, '');
P('Nhãn: **khám phá** (A2 của §9: không có trong (5)/(6), không vào kết luận chính). Cả 64 lượt mỗi arm có test ẩn đạt, nên mọi lần "chặn" là chặn nhầm theo nhãn test ẩn; nhưng nhãn đó không đo "kế hoạch/diff có đạt đề bài", nên không kết luận B7cab "sai".', '');

// ───── (3) R̂ E5′ ─────
const rows = usable(load(RES('b15f-main')));
const sub = JSON.parse(fs.readFileSync(RES('b15f-main', 'subtasks.json'), 'utf8'));
const TASKS = ['l1-modules', 'l2-chain'];
const meet = (r) => (r.byPhase?.discuss ?? 0) + (r.byPhase?.finalize ?? 0);
const cells = (a, f) => TASKS.map((t) => rows.filter((r) => r.task === t && r.arm === a).map(f));
const R = (f, label) => { const b = bootstrapRatio(cells('B0F', f), cells('B1F', f), { reps: 4000, seed: 20261104, level: 0.9, margin: [0.85, 1.15] }); P(`| ${label} | ${f3(b.est)} | [${f3(b.lo)}; ${f3(b.hi)}] |`); return b.est; };
P('### Phát hiện 3: R̂ của E5′ = B1F/B0F, tách họp và số hạng mục kế hoạch', '');
P('| Phép tính (B1F/B0F, TB hình học theo bài, CI 90 % hai tầng, 4000, hạt 20261104) | R̂ | CI 90 % |', '|---|---|---|');
const r0 = R((r) => r.tokens.weighted, 'token có trọng số, như báo cáo');
const r1 = R((r) => r.tokens.weighted - meet(r), 'token không tính họp (bỏ discuss + finalize khỏi B0F; B1F không có)');
const r2 = R((r) => r.tokens.weighted / sub[r.key], 'token trên mỗi hạng mục kế hoạch (gồm họp)');
const r3 = R((r) => (r.tokens.weighted - meet(r)) / sub[r.key], 'token không họp trên mỗi hạng mục kế hoạch');
const r4 = R((r) => sub[r.key], 'số hạng mục kế hoạch (không phải token)');
const r5 = R((r) => r.byPhase.execute ?? 0, 'token pha execute');
P('', `Phần của riêng họp: B0F có ${pct(mean(rows.filter((r) => r.arm === 'B0F').map((r) => meet(r) / r.tokens.weighted)))} token ở discuss + finalize (TB theo lượt). Nếu chỉ có họp thì R̂ cỡ ${f3(1 - mean(rows.filter((r) => r.arm === 'B0F').map((r) => meet(r) / r.tokens.weighted)))}.`);
P(`Giảm tổng cộng ${pct(1 - r0)} (R̂ = ${f3(r0)}). Chia gần đúng thành ba thừa số (mô tả, không có CI riêng, vì tỉ số các trung bình không nhân đúng tuyệt đối): họp ${f3(r0 / r1)} × số hạng mục ${f3(r4)} × token không họp mỗi hạng mục ${f3(r3)} = ${f3((r0 / r1) * r4 * r3)}.`, '');
P('| Pha | B0F TB | B1F TB | B1F/B0F |', '|---|---|---|---|');
for (const ph of ['route', 'plan', 'discuss', 'finalize', 'execute', 'synthesize', 'accept']) { const a = mean(rows.filter((r) => r.arm === 'B0F').map((r) => r.byPhase?.[ph] ?? 0)), b = mean(rows.filter((r) => r.arm === 'B1F').map((r) => r.byPhase?.[ph] ?? 0)); P(`| ${ph} | ${Math.round(a).toLocaleString('vi-VN')} | ${Math.round(b).toLocaleString('vi-VN')} | ${a ? f3(b / a) : '—'} |`); }
P('');
const sb = (a, t) => rows.filter((r) => r.arm === a && r.task === t).map((r) => sub[r.key]);
for (const t of TASKS) P(`- ${t}: số hạng mục B0F ${f3(mean(sb('B0F', t)))} (${sb('B0F', t).join(',')}), B1F ${f3(mean(sb('B1F', t)))} (${sb('B1F', t).join(',')}).`);
P('', 'Lưu ý: số hạng mục lấy sau pha plan/finalize nên có thể là hệ quả của họp (mediator), không phải biến nhiễu độc lập; chuẩn hóa chỉ cho biết phần tiết kiệm đi qua kênh nào, không phải ước lượng nhân quả. n = 10 mỗi ô, 2 bài.');
console.log(out.join('\n'));
