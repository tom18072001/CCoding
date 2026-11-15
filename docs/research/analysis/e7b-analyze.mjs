#!/usr/bin/env node
// E7b: phân tích theo §9 "Đăng ký trước E7b" (BRIEF-26). Chỉ chạy khi đợt E7b đã xong. Chưa có dữ liệu → không in số nào.
//   node docs/research/analysis/e7b-analyze.mjs --r1b bench/vs-claude/results/e7b-cto/R1b --r2b bench/vs-claude/results/e7b-cto/R2b \
//        [--items bench/vs-claude/results/e7-cto/items.json] [--selected bench/vs-claude/results/e7-cto/selected.json] \
//        [--data-r1b <ccoding-data của tiến trình R1b>] [--data-r2b <ccoding-data của tiến trình R2b>] [--json]
// Dùng lại (không sửa) mcnemarExact, latestDone, bootDiff của bench/vs-claude/e7/analyze.mjs. Arm R1 của tiến trình R1b gọi là R1b, R2 của R2b gọi là R2b.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp } from './g-analyze.mjs';
import { bootDiff, latestDone, mcnemarExact } from '../../../bench/vs-claude/e7/analyze.mjs';

/** Hằng khóa ở §9 E7b. */
export const LOCK = { seed: '20261104', B: 4000, alphaTotal: 0.05, ceilFp: 6 / 64, floorRecall: 58 / 64, maxDrop: 6 / 64, fpRef: 0.1, cappedShare: 0.05, minDisc: 10, turns: { R1b: 6, R2b: 16 } };
export const MODES = ['chính', 'S1', 'S2'];
const ARM_OF = { R1b: 'R1', R2b: 'R2' };

/** Holm hai phép: p nhỏ hơn so với α/2, p lớn hơn so với α (bước xuống). Trả p đã hiệu chỉnh (không vượt 1). */
export function holm2(p1, p2, alpha = LOCK.alphaTotal) {
  const order = p1 <= p2 ? [0, 1] : [1, 0];
  const ps = [p1, p2];
  const lo = Math.min(1, 2 * ps[order[0]]);
  const hi = Math.min(1, Math.max(lo, ps[order[1]]));
  const adj = [0, 0]; adj[order[0]] = lo; adj[order[1]] = hi;
  return { adj, alpha };
}

/** Nhãn của §9 (g): "khác nhau" | "chưa phân biệt được" | "chưa kết luận" (hai bên khác chiều). */
export function labelOf({ aOnly, bOnly, pAdj, ci }) {
  const disc = aOnly + bOnly;
  if (disc < LOCK.minDisc) return 'chưa phân biệt được';
  const bootSig = Number.isFinite(ci[0]) && (ci[0] > 0 || ci[1] < 0);
  const mcDir = bOnly - aOnly; // dương: R2b chặn nhiều hơn
  const bootDir = ci[0] > 0 ? 1 : ci[1] < 0 ? -1 : 0;
  if (pAdj < LOCK.alphaTotal && bootSig) return Math.sign(mcDir) === bootDir ? 'khác nhau' : 'chưa kết luận';
  return 'chưa phân biệt được';
}

const verdictBlocked = (r, mode) => r.verdict === 'block' || (mode === 'S1' && r.verdict === 'unparsed');

/**
 * rows1/rows2: dòng runs.jsonl của R1b và R2b (arm gốc R1/R2 hoặc đã đổi tên). cappedIds: { R1b?: Set, R2b?: Set } mục có `turnCapped`
 * ở nhật ký lượt gọi (null → "capped (suy ra)" = unread).
 */
export function analyzeE7b({ items, selected, rows1, rows2, cappedIds = null }) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const sel = selected.map((id) => byId.get(id));
  const rename = (rows, from, to) => rows.map((r) => (r.arm === from ? { ...r, arm: to } : r));
  const last = latestDone([...rename(rows1, 'R1', 'R1b'), ...rename(rows2, 'R2', 'R2b')]);
  const get = (x, arm) => last.get(`${x.id}__${arm}`);
  const arms = ['R1b', 'R2b'];
  const planned = { faulty: sel.filter((x) => x.kind === 'faulty').length, clean: sel.filter((x) => x.kind === 'clean').length };

  const per = {};
  for (const arm of arms) {
    const rs = sel.flatMap((x) => { const r = get(x, arm); return r ? [{ x, r }] : []; });
    const unread = rs.filter(({ r }) => r.verdict === 'unparsed');
    const flagged = cappedIds?.[arm];
    const cappedBasis = flagged ? 'ghi' : 'suy ra';
    const capped = flagged ? unread.filter(({ x }) => flagged.has(x.id)).length : unread.length;
    const o = { arm, done: rs.length, unread: unread.length, capped, cappedBasis, maxTurns: [...new Set(rs.map(({ r }) => r.maxTurns ?? null))], commits: [...new Set(rs.map(({ r }) => r.ccodingCommit ?? null))], auth: [...new Set(rs.map(({ r }) => r.authSource ?? null))], models: [...new Set(rs.flatMap(({ r }) => r.models ?? []))].sort() };
    for (const kind of ['faulty', 'clean']) {
      const k = rs.filter(({ x }) => x.kind === kind);
      o[`unread_${kind}`] = k.filter(({ r }) => r.verdict === 'unparsed').length;
    }
    o.usd = rs.length && rs.every(({ r }) => r.costUsd != null) ? rs.reduce((s, { r }) => s + r.costUsd, 0) : null;
    o.usdMean = o.usd == null ? null : o.usd / rs.length;
    o.wtokMean = rs.length ? rs.reduce((s, { r }) => s + (r.tokens?.weighted ?? 0), 0) / rs.length : NaN;
    o.wallSecMean = rs.length ? rs.reduce((s, { r }) => s + (r.wallSec ?? 0), 0) / rs.length : NaN;
    per[arm] = o;
  }

  const byMode = {};
  for (const mode of MODES) {
    const res = { mode };
    for (const kind of ['faulty', 'clean']) {
      const pairs = [];
      for (const x of sel.filter((y) => y.kind === kind)) {
        const a = get(x, 'R1b'), b = get(x, 'R2b');
        if (!a || !b) continue;
        if (mode === 'S2' && (a.verdict === 'unparsed' || b.verdict === 'unparsed')) continue;
        pairs.push({ task: x.task, a: verdictBlocked(a, mode), b: verdictBlocked(b, mode) });
      }
      const aOnly = pairs.filter((p) => p.a && !p.b).length; // chỉ R1b chặn
      const bOnly = pairs.filter((p) => !p.a && p.b).length; // chỉ R2b chặn
      const ka = pairs.filter((p) => p.a).length, kb = pairs.filter((p) => p.b).length;
      res[kind] = { n: pairs.length, planned: planned[kind], R1b: { k: ka, rate: pairs.length ? ka / pairs.length : NaN, cp: cp(ka, pairs.length) }, R2b: { k: kb, rate: pairs.length ? kb / pairs.length : NaN, cp: cp(kb, pairs.length) }, aOnly, bOnly, p: mcnemarExact(aOnly, bOnly), diff: pairs.length ? (kb - ka) / pairs.length : NaN, diffBoot: bootDiff(pairs.map((p) => ({ task: p.task, d: (p.b ? 1 : 0) - (p.a ? 1 : 0) })), LOCK.B, LOCK.seed) };
    }
    const h = holm2(res.faulty.p, res.clean.p);
    res.faulty.pAdj = h.adj[0]; res.clean.pAdj = h.adj[1];
    res.faulty.label = labelOf({ ...res.faulty, ci: res.faulty.diffBoot });
    res.clean.label = labelOf({ ...res.clean, ci: res.clean.diffBoot });
    res.youden = Object.fromEntries(arms.map((a) => [a, res.faulty[a].rate - res.clean[a].rate]));
    res.branch = branchOf(res, per);
    byMode[mode] = res;
  }
  const branches = MODES.map((m) => byMode[m].branch.id);
  const stable = new Set(branches).size === 1;
  const labelsStable = (kind) => new Set(MODES.map((m) => byMode[m][kind].label)).size === 1;
  const mainRes = byMode['chính'];
  const decision = { branch: stable ? branches[0] : 'chưa kết luận (nhánh khác nhau giữa các cách tính)', stable, branches: Object.fromEntries(MODES.map((m) => [m, byMode[m].branch.id])), labels: { P1: labelsStable('faulty') ? mainRes.faulty.label : 'chưa kết luận (nhãn khác nhau giữa các cách tính)', P2: labelsStable('clean') ? mainRes.clean.label : 'chưa kết luận (nhãn khác nhau giữa các cách tính)' } };
  const perTask = [...new Set(sel.map((x) => x.task))].sort().map((task) => {
    const row = { task };
    for (const arm of arms) for (const kind of ['faulty', 'clean']) {
      const us = sel.filter((x) => x.task === task && x.kind === kind).flatMap((x) => { const r = get(x, arm); return r ? [r] : []; });
      row[`${arm}|${kind}`] = { blocked: us.filter((r) => r.verdict === 'block').length, n: us.length, unread: us.filter((r) => r.verdict === 'unparsed').length };
    }
    return row;
  });
  const checks = [];
  for (const arm of arms) {
    const want = LOCK.turns[arm];
    if (per[arm].maxTurns.some((t) => t !== want)) checks.push(`${arm}: maxTurns của dòng ${JSON.stringify(per[arm].maxTurns)} khác ${want} đã khóa (§9 (j): dừng, ghi sai lệch)`);
    if (per[arm].auth.some((a) => a != null && !/claude\.?ai|oauth|subscription|login/i.test(String(a)))) checks.push(`${arm}: authSource ${JSON.stringify(per[arm].auth)} không phải phiên đăng nhập claude.ai`);
  }
  const c1 = per.R1b.commits, c2 = per.R2b.commits;
  const x1 = new Set(rows1.map((r) => r.extraConfigSha256 ?? null)), x2 = new Set(rows2.map((r) => r.extraConfigSha256 ?? null));
  if (x1.size !== 1 || x2.size !== 1 || [...x1][0] === [...x2][0]) checks.push('extraConfigSha256: mỗi arm phải đúng một giá trị và hai arm phải khác nhau (đối chiếu SHA256SUMS)');
  if (c1.length !== 1 || c2.length !== 1 || c1[0] !== c2[0]) checks.push(`ccodingCommit không khớp một giá trị duy nhất giữa hai arm: R1b ${JSON.stringify(c1)}, R2b ${JSON.stringify(c2)}`);
  return { nSelected: sel.length, planned, per, byMode, decision, perTask, checks, usdRatio: per.R1b.usd && per.R2b.usd != null ? per.R2b.usd / per.R1b.usd : null };
}

/** Nhánh diễn giải (§9 (h)), thứ tự D → E → A → B → C → F. Ngưỡng quy theo tỉ lệ: "≥" làm tròn xuống, "≤" làm tròn lên (n = 64 ra 58, 6, 6). */
export function branchOf(res, per) {
  const f = res.faulty, c = res.clean;
  const maxFp = Math.ceil(LOCK.ceilFp * c.n - 1e-9), minRecall = Math.floor(LOCK.floorRecall * f.n + 1e-9), maxDrop = Math.ceil(LOCK.maxDrop * f.n - 1e-9);
  const thr = { maxFp, minRecall, maxDrop };
  const cappedLimit = Math.floor(LOCK.cappedShare * (f.planned + c.planned) + 1e-9);
  if (per.R2b.capped > cappedLimit) return { id: 'D', text: `D. Đọc chưa sạch: ${per.R2b.capped} lượt R2b chạm trần (${per.R2b.cappedBasis}) > ${cappedLimit}`, thr };
  if (c.R1b.cp[0] <= LOCK.fpRef) return { id: 'E', text: 'E. (i) đã đổi: cận dưới CP chặn nhầm R1b ≤ 10 %', thr };
  const m1 = c.R2b.k <= maxFp;
  const m2 = f.R2b.k >= minRecall && f.R1b.k - f.R2b.k <= maxDrop;
  const m3 = c.label === 'khác nhau' && c.R2b.k < c.R1b.k;
  if (m1 && m2 && m3) return { id: 'A', text: 'A. Đề xuất đổi model CTO sang Opus (chủ dự án quyết)', thr };
  if (m1 && !m2) return { id: 'B', text: 'B. Opus giữ chặn nhầm thấp, mất recall', thr };
  if (!m1) return { id: 'C', text: 'C. Opus vẫn chặn nhầm cao', thr };
  return { id: 'F', text: 'F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4))', thr };
}

/**
 * Đọc nhật ký lượt gọi <ccoding-data>/runs/<taskId>/calls.jsonl của MỌI dòng có taskId. Thiếu tệp → null (dùng "suy ra").
 * Chạm trần = bản ghi phase 'accept' có `turnCapped === true` (src/orchestrator.ts:4106) hoặc diag chứa "chạm trần" (như kpi.ts).
 * Một task có nhiều hơn một lượt 'accept' = vòng bổ sung còn bật → ném lỗi (E7b đo đúng một lượt nghiệm thu mỗi mục).
 * Trả Set mã mục chạm trần của các dòng unread.
 */
export function cappedFromCalls(dataDir, rows) {
  const ids = new Set();
  for (const r of rows) {
    if (!r.taskId) continue;
    const f = path.join(dataDir, 'runs', r.taskId, 'calls.jsonl');
    if (!fs.existsSync(f)) return null;
    const calls = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const acc = calls.filter((c) => c.phase === 'accept');
    if (acc.length > 1) throw new Error(`task ${r.taskId} (mục ${r.id}) có ${acc.length} lượt accept trong calls.jsonl: vòng bổ sung chưa tắt, dừng phân tích (RUNBOOK mục 2)`);
    if (r.verdict === 'unparsed' && acc.some((c) => c.turnCapped === true || /chạm trần/.test(c.diag ?? ''))) ids.add(r.id);
  }
  return ids;
}

export function report(a) {
  const f = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') : '—');
  const ci = (v) => `[${f(v[0])}; ${f(v[1])}]`;
  const pp = (x) => x.toFixed(4).replace('.', ',');
  const usd = (x) => (x == null ? '—' : x.toFixed(2).replace('.', ','));
  const m = a.byMode['chính'];
  const L = ['# E7b: CTO nghiệm thu, đo lại trên bản mã hiện tại', '', `Mục chốt: ${a.nSelected} (lỗi ${a.planned.faulty}, đúng ${a.planned.clean}). Hai tiến trình song song, không xen kẽ (§9 E7b (c)). R1b: Sonnet, trần accept 6. R2b: Opus, trần accept 16 (khác nhau ở cả model lẫn trần; không tách được).`, ''];
  if (a.checks.length) L.push('**CẢNH BÁO cấu hình (dừng và ghi sai lệch, §9 (j)):**', ...a.checks.map((c) => `- ${c}`), '');
  L.push('## Thước đo chính (unread = không chặn)', '', '| Arm | Recall | CP 95 % | Chặn nhầm | CP 95 % | Youden J (mô tả) | unread | capped | USD | USD/mục | wtok TB |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const arm of ['R1b', 'R2b']) {
    const p = a.per[arm];
    L.push(`| ${arm} | ${m.faulty[arm].k}/${m.faulty.n} = ${f(m.faulty[arm].rate)} % | ${ci(m.faulty[arm].cp)} | ${m.clean[arm].k}/${m.clean.n} = ${f(m.clean[arm].rate)} % | ${ci(m.clean[arm].cp)} | ${f(m.youden[arm])} | ${p.unread} | ${p.capped} (${p.cappedBasis}) | ${usd(p.usd)} | ${usd(p.usdMean)} | ${Math.round(p.wtokMean).toLocaleString('vi-VN')} |`);
  }
  L.push('', `Tỉ số USD R2b/R1b: ${a.usdRatio == null ? '—' : a.usdRatio.toFixed(2).replace('.', ',')}. Mô tả, không là tiêu chí.`, '', '## Phép kiểm (McNemar chính xác hai phía, R2b so với R1b; Holm hai phép; bootstrap theo bài B = 4000)', '', '| Cách tính | Phép | n | chỉ R1b chặn | chỉ R2b chặn | p thô | p Holm | hiệu R2b − R1b (điểm %) [CI bootstrap] | nhãn |', '|---|---|--:|--:|--:|--:|--:|---|---|');
  for (const mode of MODES) {
    const r = a.byMode[mode];
    for (const [name, kind] of [['P1 recall', 'faulty'], ['P2 chặn nhầm', 'clean']]) { const k = r[kind]; L.push(`| ${mode} | ${name} | ${k.n} | ${k.aOnly} | ${k.bOnly} | ${pp(k.p)} | ${pp(k.pAdj)} | ${f(k.diff)} ${ci(k.diffBoot)} | ${k.label} |`); }
  }
  L.push('', `Nhãn P1: **${a.decision.labels.P1}**; nhãn P2: **${a.decision.labels.P2}**. Số cặp bất đồng < ${LOCK.minDisc} thì p chỉ mô tả.`, `Cách tính: chính (unread = không chặn), S1 (unread = chặn), S2 (bỏ cặp có unread ở bất kỳ arm nào).`, '', '## Nhánh diễn giải (§9 (h))', '', ...MODES.map((mode) => `- ${mode}: ${a.byMode[mode].branch.text} (ngưỡng quy theo n: chặn nhầm ≤ ${a.byMode[mode].branch.thr.maxFp}, recall ≥ ${a.byMode[mode].branch.thr.minRecall}, R1b − R2b ≤ ${a.byMode[mode].branch.thr.maxDrop})`), '', `**Kết luận nhánh: ${a.decision.branch}.** Chỉ đứng được khi cả ba cách tính cùng nhánh (§9 (f)).`);
  L.push('', '## Theo bài', '', '| Bài | R1b lỗi bị chặn | R2b lỗi bị chặn | R1b đúng bị chặn | R2b đúng bị chặn | unread R1b / R2b |', '|---|--:|--:|--:|--:|--:|');
  for (const t of a.perTask) L.push(`| ${t.task} | ${t['R1b|faulty'].blocked}/${t['R1b|faulty'].n} | ${t['R2b|faulty'].blocked}/${t['R2b|faulty'].n} | ${t['R1b|clean'].blocked}/${t['R1b|clean'].n} | ${t['R2b|clean'].blocked}/${t['R2b|clean'].n} | ${t['R1b|faulty'].unread + t['R1b|clean'].unread} / ${t['R2b|faulty'].unread + t['R2b|clean'].unread} |`);
  L.push('', '## So với E7 (chỉ mô tả, KHÁC BẢN MÃ, không gộp, không p/CI giữa hai đợt)', '', '| | E7 (bản mã trước D15–D23, 13/11/2026) | E7b (bản ghim hiện tại) |', '|---|---|---|', `| Sonnet, trần 6 (R1 / R1b): chặn nhầm; recall | 42,2 %; 98,4 % | ${f(m.clean.R1b.rate)} %; ${f(m.faulty.R1b.rate)} % |`, `| Opus (R2: trần 6 / R2b: trần 16): chặn nhầm; recall | 6,3 %; 85,9 % | ${f(m.clean.R2b.rate)} %; ${f(m.faulty.R2b.rate)} % |`, '', 'Chênh lệch có thể đến từ mã, trần, trôi mô hình hoặc nhiễu; không tách được (§9 E7b (i), (k)).');
  return L.join('\n');
}

const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
  const dirOf = (k, d) => path.resolve(flag(k, path.join('bench', 'vs-claude', 'results', 'e7b-cto', d)));
  const d1 = dirOf('r1b', 'R1b'), d2 = dirOf('r2b', 'R2b');
  const rows1 = jl(path.join(d1, 'runs.jsonl')), rows2 = jl(path.join(d2, 'runs.jsonl'));
  if (!rows1.some((r) => r.status === 'done') || !rows2.some((r) => r.status === 'done')) {
    console.log('chưa có dữ liệu: thiếu runs.jsonl (hoặc chưa có dòng done) của R1b và/hoặc R2b. Không phân tích.');
    process.exit(0);
  }
  const e7 = path.join('bench', 'vs-claude', 'results', 'e7-cto');
  const doc = JSON.parse(fs.readFileSync(path.resolve(flag('items', path.join(e7, 'items.json'))), 'utf8'));
  const items = [...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])];
  const selected = JSON.parse(fs.readFileSync(path.resolve(flag('selected', path.join(e7, 'selected.json'))), 'utf8')).items;
  const doneIds = (rows) => new Set(rows.filter((r) => r.status === 'done').map((r) => r.id));
  const d1s = doneIds(rows1), d2s = doneIds(rows2);
  const missing = selected.filter((id) => !d1s.has(id) || !d2s.has(id));
  if (missing.length && !argv.includes('--final')) {
    console.log(`chưa đủ dữ liệu: còn ${missing.length}/${selected.length} mục chưa có dòng done ở cả hai arm. Không in số. Chạy lại cho đủ, hoặc thêm --final nếu đã dừng chủ định (ghi lý do vào RUNLOG).`);
    process.exit(0);
  }
  const dr1 = flag('data-r1b'), dr2 = flag('data-r2b');
  let cappedIds = null;
  try {
    cappedIds = dr1 && dr2 ? { R1b: cappedFromCalls(path.resolve(dr1), rows1), R2b: cappedFromCalls(path.resolve(dr2), rows2) } : null;
  } catch (e) { console.error(String(e.message ?? e)); process.exit(2); }
  const a = analyzeE7b({ items, selected, rows1, rows2, cappedIds: cappedIds?.R1b && cappedIds?.R2b ? cappedIds : null });
  console.log(argv.includes('--json') ? JSON.stringify(a, null, 1) : report(a));
}
