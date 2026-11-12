#!/usr/bin/env node
// V4-3e-E4 (preregistration.md §9): B-12 (recall cổng b02, cto, b10) và B-16 (CTO Opus so với Sonnet) trên bộ bài cài lỗi.
//   node docs/research/analysis/e4-analyze.mjs [--json]
// Theo (5)–(8): chỉ dòng `done` (§4.1; dòng infra/failed đã được runner chạy lại đúng khóa), không `excluded`, không `leak`.
// Nhãn tại thời điểm cổng (quy ước chung, `gates-pairs.mjs --label gate`): b02 dương khi `gates.b02.checksRed > 0`;
// cto dương khi `pass === false` (test ẩn cuối lượt); b10 theo nhãn bài (g3/g4).
// Dưới 10 lượt dương thật → "recall chưa ước lượng được" (AG; §5.1(c)), không in recall điểm.
// Lượt sạch (chỉ mô tả): lượt CCoding có bản ghi cổng trên bài không thuộc g1–g6, từ E3 (large-pilot), E5′ (b15f-main, thay E5
// không chạy — ghi sai lệch) và E6 (h6-3e), tối đa 65; báo CP 95 % hai phía, không tuyên bố ≤ 5 % khi n < 72.
// B-16: H-O1 tỉ lệ nghiệm thu sai (lỗi còn nguyên mà CTO "đạt") B7cabO so với B7cab; McNemar chính xác trên cặp (bài, rep);
//       H-O2 chi phí (USD/lượt, token có trọng số). Điểm dừng "vô ích", "có hại" của CD 3.5 đánh giá như đăng ký.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp } from './g-analyze.mjs';
import { mcnemarExact } from '../../../bench/vs-claude/e7/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = (d) => path.join(ROOT, 'bench/vs-claude/results', d, 'runs.jsonl');
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const usable = (rows) => rows.filter((r) => r.status === 'done' && !r.excluded && !r.leak);
const MIN_POS = 10;

export function analyze({ e4, clean }) {
  const all = load(e4);
  const done = usable(all);
  const isKind = (k) => (r) => k.some((p) => r.task.startsWith(p));
  const out = { rows: { total: all.length, done: done.length, notDone: all.filter((r) => r.status !== 'done').map((r) => `${r.key}:${r.status}`) } };
  // b02 trên g1/g2, hai arm gộp (BL B-12 trường 6)
  const b02 = done.filter((r) => ['B7cab', 'B7cabO'].includes(r.arm) && isKind(['g1-', 'g2-'])(r) && r.gates?.b02);
  const b02pos = b02.filter((r) => (r.gates.b02.checksRed ?? 0) > 0);
  out.b02 = { runs: b02.length, positives: b02pos.length, qhat: b02pos.length / b02.length, qhatCP: cp(b02pos.length, b02.length), blocked: b02.filter((r) => r.gates.b02.blocked).length, recall: b02pos.length >= MIN_POS ? b02pos.filter((r) => r.gates.b02.blocked).length / b02pos.length : null, gateNull: done.filter((r) => ['B7cab', 'B7cabO'].includes(r.arm) && isKind(['g1-', 'g2-'])(r) && !r.gates?.b02).length };
  // cto trên g5/g6
  const cto = done.filter((r) => ['B7cab', 'B7cabO'].includes(r.arm) && isKind(['g5-', 'g6-'])(r) && r.gates?.cto);
  const ctoPos = cto.filter((r) => r.pass === false);
  out.cto = { runs: cto.length, positives: ctoPos.length, qhat: ctoPos.length / cto.length, qhatCP: cp(ctoPos.length, cto.length), recall: ctoPos.length >= MIN_POS ? ctoPos.filter((r) => !r.gates.cto.pass).length / ctoPos.length : null, blockOnPassing: cto.filter((r) => r.pass === true && !r.gates.cto.pass).length, passing: cto.filter((r) => r.pass === true).length };
  // b10 trên B6 × g3/g4, nhãn theo bài
  const b10 = done.filter((r) => r.arm === 'B6' && isKind(['g3-', 'g4-'])(r) && r.gates?.b10);
  const b10k = b10.filter((r) => r.gates.b10.blocked).length;
  out.b10 = { runs: b10.length, positives: b10.length, blocked: b10k, recall: b10.length >= MIN_POS ? b10k / b10.length : null, recallCP: cp(b10k, b10.length), gateNull: done.filter((r) => r.arm === 'B6' && isKind(['g3-', 'g4-'])(r) && !r.gates?.b10).length, hiddenPass: b10.filter((r) => r.pass === true).length };
  // lượt sạch
  const cl = clean.flatMap(([name, f]) => usable(load(f)).filter((r) => r.gates && !/^g[1-6]-/.test(r.task)).map((r) => ({ ...r, _src: name })));
  const blk = (g) => cl.filter((r) => r.gates[g] && (g === 'cto' ? !r.gates.cto.pass : r.gates[g].blocked));
  const nOf = (g) => cl.filter((r) => r.gates[g]).length;
  out.clean = { n: cl.length, bySource: Object.fromEntries(clean.map(([n]) => [n, cl.filter((r) => r._src === n).length])), hiddenPass: cl.filter((r) => r.pass === true).length };
  for (const g of ['b02', 'b10', 'cto']) out.clean[g] = { n: nOf(g), blocked: blk(g).length, cp: cp(blk(g).length, nOf(g)), bySource: Object.fromEntries(clean.map(([n]) => [n, `${blk(g).filter((r) => r._src === n).length}/${cl.filter((r) => r._src === n && r.gates[g]).length}`])) };
  // B-16
  const arm = (a) => done.filter((r) => r.arm === a && /^g[1256]-/.test(r.task));
  const wrongAccept = (rs) => { const pos = rs.filter((r) => r.pass === false && r.gates?.cto); return { positives: pos.length, wrong: pos.filter((r) => r.gates.cto.pass).length }; };
  const pairs = [];
  for (const r of arm('B7cab')) { const o = arm('B7cabO').find((x) => x.task === r.task && x.rep === r.rep); if (o && r.gates?.cto && o.gates?.cto) pairs.push([r, o]); }
  const disc = (f) => { let b = 0, c = 0; for (const [s, o] of pairs) { const fs_ = f(s), fo = f(o); if (fs_ && !fo) b++; else if (!fs_ && fo) c++; } return { n: pairs.length, sonnetOnly: b, opusOnly: c, p: mcnemarExact(b, c) }; };
  const cost = (a) => { const rs = done.filter((r) => r.arm === a); return { runs: rs.length, usdPerRun: rs.reduce((s, r) => s + (r.costUsd ?? 0), 0) / rs.length, wtokPerRun: rs.reduce((s, r) => s + (r.tokens?.weighted ?? 0), 0) / rs.length, acceptWtokPerRun: rs.reduce((s, r) => s + (r.byPhase?.accept ?? 0), 0) / rs.length }; };
  out.b16 = {
    wrongAccept: { B7cab: wrongAccept(arm('B7cab')), B7cabO: wrongAccept(arm('B7cabO')) },
    blockOnPassing: { B7cab: arm('B7cab').filter((r) => r.pass === true && r.gates?.cto && !r.gates.cto.pass).length + '/' + arm('B7cab').filter((r) => r.pass === true && r.gates?.cto).length, B7cabO: arm('B7cabO').filter((r) => r.pass === true && r.gates?.cto && !r.gates.cto.pass).length + '/' + arm('B7cabO').filter((r) => r.pass === true && r.gates?.cto).length },
    mcnemarWrongAccept: disc((r) => r.pass === false && r.gates.cto.pass),
    mcnemarBlock: disc((r) => !r.gates.cto.pass),
    cost: { B7cab: cost('B7cab'), B7cabO: cost('B7cabO'), B6: cost('B6') },
  };
  const ratio = out.b16.cost.B7cabO.usdPerRun / out.b16.cost.B7cab.usdPerRun;
  out.b16.stops = { usdRatio: ratio, futility: ratio > 2 ? 'đánh giá hiệu số nghiệm thu sai' : 'không chạm (USD/lượt Opus ≤ 2 × Sonnet)', harm: 'không đánh giá được: E4 không có lượt sạch của B7cab/B7cabO (ghi trước)', notEnoughPositives: (out.cto.positives < MIN_POS ? 'chạm: < 10 lượt dương thật, H-O1 chưa ước lượng được' : 'không') };
  return out;
}

const fp = (p) => (p < 0.001 ? p.toExponential(1).replace('.', ',') : p.toFixed(3).replace('.', ','));
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1).replace('.', ',')} %` : '—');
const ci = (v) => `[${pct(v[0])}; ${pct(v[1])}]`;
export function report(a) {
  const L = ['# E4 (V4-3e-E4): cổng chất lượng trên bộ bài cài lỗi (B-12) và CTO Opus so với Sonnet (B-16)', ''];
  L.push(`Dòng: ${a.rows.total}, dùng ${a.rows.done} dòng \`done\`. Dòng không \`done\` (đã chạy lại đúng khóa): ${a.rows.notDone.length}.`, '');
  L.push('## B-12: recall từng cổng', '', '| Cổng | Lượt | Lượt dương thật (lỗi còn tới cổng) | q̂ (CP 95 %) | Recall |', '|---|---|---|---|---|');
  L.push(`| b02 (g1, g2; B7cab + B7cabO) | ${a.b02.runs} | ${a.b02.positives} | ${pct(a.b02.qhat)} ${ci(a.b02.qhatCP)} | ${a.b02.recall === null ? '**chưa ước lượng được** (< 10 dương)' : pct(a.b02.recall)} |`);
  L.push(`| cto (g5, g6; B7cab + B7cabO) | ${a.cto.runs} | ${a.cto.positives} | ${pct(a.cto.qhat)} ${ci(a.cto.qhatCP)} | ${a.cto.recall === null ? '**chưa ước lượng được** (< 10 dương)' : pct(a.cto.recall)} |`);
  L.push(`| b10 (B6 × g3, g4; nhãn theo bài) | ${a.b10.runs} | ${a.b10.positives} (theo bài) | — | ${a.b10.recall === null ? '—' : `${a.b10.blocked}/${a.b10.runs} = ${pct(a.b10.recall)} ${ci(a.b10.recallCP)}`} |`, '');
  L.push(`- b02 chặn ${a.b02.blocked}/${a.b02.runs} lượt trên g1/g2; cổng null ${a.b02.gateNull}.`);
  L.push(`- cto chặn ${a.cto.blockOnPassing}/${a.cto.passing} lượt có test ẩn đạt trên g5/g6.`);
  L.push(`- b10: cổng null ${a.b10.gateNull} lượt; test ẩn đạt ${a.b10.hiddenPass}/${a.b10.runs} lượt, tức lỗi cài ở g3/g4 được agent sửa dù b10 không chặn.`, '');
  L.push(`## Lượt sạch (chỉ mô tả; n = ${a.clean.n}: ${JSON.stringify(a.clean.bySource)}; test ẩn đạt ${a.clean.hiddenPass}/${a.clean.n})`, '', '| Cổng | Chặn / n | CP 95 % | Theo nguồn |', '|---|---|---|---|');
  for (const g of ['b02', 'b10', 'cto']) L.push(`| ${g} | ${a.clean[g].blocked}/${a.clean[g].n} | ${ci(a.clean[g].cp)} | ${JSON.stringify(a.clean[g].bySource)} |`);
  L.push('', 'n < 72 nên không tuyên bố "≤ 5 %" (BL B-12 trường 4(b)). Chặn của cto ở bảng này là phán quyết nghiệm thu "chưa đạt"; nhiệm vụ vẫn giao kết quả.', '');
  const b = a.b16;
  L.push('## B-16: CTO Opus (B7cabO) so với Sonnet (B7cab)', '');
  L.push(`- **H-O1 (chính), nghiệm thu sai:** B7cab ${b.wrongAccept.B7cab.wrong}/${b.wrongAccept.B7cab.positives}, B7cabO ${b.wrongAccept.B7cabO.wrong}/${b.wrongAccept.B7cabO.positives} lượt có lỗi còn nguyên. McNemar chính xác trên ${b.mcnemarWrongAccept.n} cặp: ${b.mcnemarWrongAccept.sonnetOnly} chỉ Sonnet, ${b.mcnemarWrongAccept.opusOnly} chỉ Opus, p = ${fp(b.mcnemarWrongAccept.p)}. ${b.stops.notEnoughPositives}.`);
  L.push(`- **Khám phá, ngoài đăng ký (không vào kết luận chính):** chặn trên lượt có test ẩn đạt: B7cab ${b.blockOnPassing.B7cab}, B7cabO ${b.blockOnPassing.B7cabO}. Bất đồng phán quyết CTO: ${b.mcnemarBlock.sonnetOnly} chỉ Sonnet chặn, ${b.mcnemarBlock.opusOnly} chỉ Opus chặn (McNemar chính xác p = ${fp(b.mcnemarBlock.p)}, chỉ mô tả).`);
  L.push(`- **H-O2 (phụ), chi phí mỗi lượt:** B7cab ${b.cost.B7cab.usdPerRun.toFixed(3).replace('.', ',')} USD, ${Math.round(b.cost.B7cab.wtokPerRun).toLocaleString('vi-VN')} token có trọng số (pha accept ${Math.round(b.cost.B7cab.acceptWtokPerRun).toLocaleString('vi-VN')}); B7cabO ${b.cost.B7cabO.usdPerRun.toFixed(3).replace('.', ',')} USD, ${Math.round(b.cost.B7cabO.wtokPerRun).toLocaleString('vi-VN')} (pha accept ${Math.round(b.cost.B7cabO.acceptWtokPerRun).toLocaleString('vi-VN')}). Tỉ số USD ${b.stops.usdRatio.toFixed(2).replace('.', ',')}.`);
  L.push(`- **Điểm dừng CD 3.5:** vô ích: ${b.stops.futility}; có hại: ${b.stops.harm}; không đủ dương: ${b.stops.notEnoughPositives}.`);
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = analyze({ e4: R('gates-main'), clean: [['E3', R('large-pilot')], ['E5′', R('b15f-main')], ['E6', R('h6-3e')]] });
  console.log(process.argv.includes('--json') ? JSON.stringify(a, null, 1) : report(a));
}
