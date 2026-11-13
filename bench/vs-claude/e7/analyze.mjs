#!/usr/bin/env node
// E7: phân tích theo §9 V4-3f (bản chốt). Chỉ chạy khi đợt E7 đã xong (hoặc dừng theo quy tắc dừng).
//   node bench/vs-claude/e7/analyze.mjs --out bench/vs-claude/results/e7-cto [--json]
// Thước đo: recall = tỉ lệ mục lỗi bị chặn; chặn nhầm = tỉ lệ mục đúng bị chặn. "Chặn" = khối JSON đọc được với accepted=false
// (đúng luật của CCoding). Không đọc được kết luận → không chặn (báo riêng số lượt).
// Phép kiểm chính: McNemar chính xác hai phía, R1 so với R3, trên mục lỗi có kết quả ở cả hai arm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp } from '../../../docs/research/analysis/g-analyze.mjs';
import { rng } from '../../../docs/research/analysis/g-mutation.mjs';

const lnC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; };
/** McNemar chính xác hai phía trên b, c (cặp bất đồng). */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(lnC(n, i) - n * Math.log(2));
  return Math.min(1, 2 * p);
}

/** Dòng done mới nhất theo (mục, arm). */
export function latestDone(rows) {
  const m = new Map();
  for (const r of rows) if (r.status === 'done' && r.verdict) m.set(`${r.id}__${r.arm}`, r);
  return m;
}

/** Bootstrap hai tầng (lấy lại bài, rồi lấy lại mục trong bài) cho tỉ lệ chặn trên một tập mục. */
export function bootRate(units, B = 4000, seed = '20261104') {
  const byTask = new Map();
  for (const u of units) { const a = byTask.get(u.task) ?? []; a.push(u.blocked ? 1 : 0); byTask.set(u.task, a); }
  const tasks = [...byTask.values()];
  if (!tasks.length) return [NaN, NaN];
  const r = rng(seed); const vals = [];
  for (let b = 0; b < B; b++) {
    let k = 0, n = 0;
    for (let t = 0; t < tasks.length; t++) {
      const a = tasks[Math.floor(r() * tasks.length)];
      for (let j = 0; j < a.length; j++) { k += a[Math.floor(r() * a.length)]; n++; }
    }
    vals.push(k / n);
  }
  vals.sort((x, y) => x - y);
  return [vals[Math.floor(0.025 * (B - 1))], vals[Math.ceil(0.975 * (B - 1))]];
}

/**
 * Bootstrap hai tầng theo bài cho hiệu ghép cặp (chặn ở arm a − chặn ở arm b) trên các mục có kết quả ở cả hai arm.
 * pairs: [{ task, d }] với d ∈ {−1, 0, 1}. Trả [lo, hi] (95 %) của hiệu tỉ lệ.
 */
export function bootDiff(pairs, B = 4000, seed = '20261104|diff') {
  const byTask = new Map();
  for (const u of pairs) { const a = byTask.get(u.task) ?? []; a.push(u.d); byTask.set(u.task, a); }
  const tasks = [...byTask.values()];
  if (!tasks.length) return [NaN, NaN];
  const r = rng(seed); const vals = [];
  for (let b = 0; b < B; b++) {
    let s = 0, n = 0;
    for (let t = 0; t < tasks.length; t++) { const a = tasks[Math.floor(r() * tasks.length)]; for (let j = 0; j < a.length; j++) { s += a[Math.floor(r() * a.length)]; n++; } }
    vals.push(s / n);
  }
  vals.sort((x, y) => x - y);
  return [vals[Math.floor(0.025 * (B - 1))], vals[Math.ceil(0.975 * (B - 1))]];
}

/**
 * Điều kiện đọc 1 của Phòng Nghiên cứu (BRIEF-19 K3, ghi §9 13/11/2026 trước dữ liệu): đọc p của McNemar cùng bootstrap theo bài.
 * < 10 cặp bất đồng → p chỉ mô tả; McNemar và bootstrap (CI chứa 0 hay không) khác nhau → "chưa kết luận".
 */
export function readPrimary(pr, ci, alpha = 0.05) {
  const disc = pr.aOnly + pr.bOnly;
  const mSig = pr.p <= alpha, bSig = Number.isFinite(ci[0]) && (ci[0] > 0 || ci[1] < 0);
  const dir = pr.aOnly > pr.bOnly ? `${pr.a} chặn nhiều hơn ${pr.b}` : pr.aOnly < pr.bOnly ? `${pr.b} chặn nhiều hơn ${pr.a}` : 'ngang nhau';
  if (disc < 10) return { label: `p chỉ mô tả (${disc} cặp bất đồng < 10)`, mSig, bSig, dir };
  if (mSig && bSig) return { label: `khác nhau: ${dir}`, mSig, bSig, dir };
  if (mSig !== bSig) return { label: 'chưa kết luận (McNemar và bootstrap theo bài không thống nhất)', mSig, bSig, dir };
  return { label: 'không phân biệt được', mSig, bSig, dir };
}

export function analyze({ items, selected, rows, arms = ['R1', 'R2', 'R3'], labelTrials = null }) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const sel = selected.map((id) => byId.get(id));
  const last = latestDone(rows);
  const per = {};
  for (const arm of arms) {
    const out = { arm };
    for (const kind of ['faulty', 'clean']) {
      const units = sel.filter((x) => x.kind === kind).flatMap((x) => { const r = last.get(`${x.id}__${arm}`); return r ? [{ id: x.id, task: x.task, blocked: r.verdict === 'block', unparsed: r.verdict === 'unparsed' }] : []; });
      const k = units.filter((u) => u.blocked).length;
      out[kind] = { n: units.length, planned: sel.filter((x) => x.kind === kind).length, blocked: k, rate: units.length ? k / units.length : NaN, cp: cp(k, units.length), boot: bootRate(units), unparsed: units.filter((u) => u.unparsed).length };
    }
    const rs = sel.flatMap((x) => { const r = last.get(`${x.id}__${arm}`); return r ? [r] : []; });
    out.cost = { runs: rs.length, wtokMean: rs.reduce((s, r) => s + (r.tokens?.weighted ?? 0), 0) / Math.max(1, rs.length), usd: rs.some((r) => r.costUsd == null) ? null : rs.reduce((s, r) => s + r.costUsd, 0), wallSecMean: rs.reduce((s, r) => s + (r.wallSec ?? 0), 0) / Math.max(1, rs.length) };
    per[arm] = out;
  }
  /** blockedOf: cách đọc "chặn" (chính: verdict = block; độ nhạy §9 E7 (6): coi unparsed là chặn). keep: lọc mục. */
  const pair = (a, b, kind, { blockedOf = (r) => r.verdict === 'block', keep = () => true } = {}) => {
    let both = 0, bb = 0, cc = 0, agree = 0; const diffs = [];
    for (const x of sel.filter((y) => y.kind === kind && keep(y))) {
      const ra = last.get(`${x.id}__${a}`), rb = last.get(`${x.id}__${b}`);
      if (!ra || !rb) continue;
      both++;
      const ba = blockedOf(ra), bl = blockedOf(rb);
      if (ba && !bl) bb++; else if (!ba && bl) cc++; else agree++;
      diffs.push({ task: x.task, d: (ba ? 1 : 0) - (bl ? 1 : 0) });
    }
    return { a, b, kind, n: both, aOnly: bb, bOnly: cc, agree, p: mcnemarExact(bb, cc), diff: both ? (bb - cc) / both : NaN, diffBoot: bootDiff(diffs) };
  };
  const primary = pair('R1', 'R3', 'faulty');
  primary.reading = readPrimary(primary, primary.diffBoot);
  const secondary = [pair('R1', 'R2', 'faulty'), pair('R2', 'R3', 'faulty'), pair('R1', 'R3', 'clean'), pair('R1', 'R2', 'clean')];

  // ── Độ nhạy và điều kiện đọc (§9 E7 (6); BRIEF-19 K3 điều kiện 1–3) ──
  const unparsedAsBlock = pair('R1', 'R3', 'faulty', { blockedOf: (r) => r.verdict === 'block' || r.verdict === 'unparsed' });
  const withoutT5 = pair('R1', 'R3', 'faulty', { keep: (x) => x.task !== 't5-logq' });
  withoutT5.reading = readPrimary(withoutT5, withoutT5.diffBoot);
  const tasks = [...new Set(sel.map((x) => x.task))].sort();
  const perTask = tasks.map((task) => {
    const row = { task };
    for (const arm of arms) for (const kind of ['faulty', 'clean']) {
      const us = sel.filter((x) => x.task === task && x.kind === kind).flatMap((x) => { const r = last.get(`${x.id}__${arm}`); return r ? [r] : []; });
      row[`${arm}|${kind}`] = { blocked: us.filter((r) => r.verdict === 'block').length, n: us.length, unparsed: us.filter((r) => r.verdict === 'unparsed').length };
    }
    const pt = pair('R1', 'R3', 'faulty', { keep: (x) => x.task === task });
    row.r1Only = pt.aOnly; row.r3Only = pt.bOnly;
    return row;
  });
  // 13/11/2026 (§9 sai lệch E7, ghi trước khi xem kết luận): trước bản sửa, R3 chạm --max-turns bị ghi `infra` (lỗi rỗng, turns > maxTurns)
  // nên được chạy lại. Chính: dùng lượt chạy lại (như luật hạ tầng lúc đó); độ nhạy: coi lượt đầu là unparsed (không chặn), hoặc bỏ cặp.
  const legacyCapped = new Set(rows.filter((r) => r.arm === 'R3' && r.status === 'infra' && r.infra === 'error' && !r.error && r.maxTurns && r.turns > r.maxTurns).map((r) => r.id));
  const cappedLegacy = {
    ids: [...legacyCapped].sort(),
    asUnparsed: pair('R1', 'R3', 'faulty', { blockedOf: (r) => (r.arm === 'R3' && legacyCapped.has(r.id) ? false : r.verdict === 'block') }),
    excluded: pair('R1', 'R3', 'faulty', { keep: (x) => !legacyCapped.has(x.id) }),
  };
  const cappedDone = Object.fromEntries(arms.map((arm) => [arm, sel.filter((x) => last.get(`${x.id}__${arm}`)?.capped).length]));
  const unparsed = Object.fromEntries(arms.map((arm) => [arm, per[arm].faulty.unparsed + per[arm].clean.unparsed]));
  const unparsedDiffers = new Set(Object.values(unparsed)).size > 1;
  // điều kiện 2: recall theo số lần test ẩn trượt khi kiểm nhãn (label-trials.jsonl; mô tả)
  let byLabelFails = null;
  if (labelTrials) {
    const fails = new Map(labelTrials.filter((r) => r.kind === 'faulty' && r.fails != null).map((r) => [r.id, `${r.fails}/${r.trials}`]));
    byLabelFails = {};
    for (const x of sel.filter((y) => y.kind === 'faulty')) {
      const g = fails.get(x.id) ?? 'không có';
      const c = (byLabelFails[g] ??= { n: 0, ...Object.fromEntries(arms.map((a) => [a, 0])) });
      c.n++;
      for (const arm of arms) if (last.get(`${x.id}__${arm}`)?.verdict === 'block') c[arm]++;
    }
  }
  return { per, primary, secondary, nSelected: sel.length, sensitivity: { unparsedAsBlock, withoutT5, cappedLegacy }, perTask, unparsed, unparsedDiffers, byLabelFails, arms, cappedDone };
}

export function report(a) {
  const f = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') : '—');
  const ci = (v) => `[${f(v[0])}; ${f(v[1])}]`;
  const L = [`# E7: CTO nghiệm thu trên lỗi lọt cổng`, '', `Mục chốt: ${a.nSelected}.`, '', '| Arm | Recall (lỗi bị chặn) | CP 95 % | Bootstrap theo bài | Chặn nhầm (đúng bị chặn) | CP 95 % | Không đọc được kết luận | wtok TB | USD |', '|---|---|---|---|---|---|---|---|---|'];
  for (const p of Object.values(a.per)) L.push(`| ${p.arm} | ${p.faulty.blocked}/${p.faulty.n} = ${f(p.faulty.rate)} % | ${ci(p.faulty.cp)} | ${ci(p.faulty.boot)} | ${p.clean.blocked}/${p.clean.n} = ${f(p.clean.rate)} % | ${ci(p.clean.cp)} | ${p.faulty.unparsed + p.clean.unparsed} | ${Math.round(p.cost.wtokMean).toLocaleString('vi-VN')} | ${p.cost.usd == null ? '—' : p.cost.usd.toFixed(2).replace('.', ',')} |`);
  const pr = a.primary;
  const pp = (x) => x.toFixed(4).replace('.', ',');
  const dci = (x) => `${f(x.diff)} điểm % [${f(x.diffBoot[0])}; ${f(x.diffBoot[1])}]`;
  L.push('', `**Phép kiểm chính (McNemar chính xác, hai phía), ${pr.a} so với ${pr.b} trên ${pr.n} mục lỗi:** chỉ ${pr.a} chặn ${pr.aOnly}, chỉ ${pr.b} chặn ${pr.bOnly}, p = ${pp(pr.p)}. Hiệu recall ${pr.a} − ${pr.b} = ${dci(pr)} (bootstrap hai tầng theo bài). **Đọc: ${pr.reading.label}.**`);
  L.push('', `R1 − R3 là hiệu của hồ sơ CTO **cộng** lớp vận hành CCoding (BRIEF-19 K3 điều kiện 3), không phải của riêng hồ sơ.`);
  L.push('', '**Phụ (mô tả):**');
  for (const s of a.secondary) L.push(`- ${s.a} so với ${s.b}, mục ${s.kind === 'faulty' ? 'lỗi' : 'đúng'} (n = ${s.n}): chỉ ${s.a} chặn ${s.aOnly}, chỉ ${s.b} chặn ${s.bOnly}, p = ${pp(s.p)}.`);
  const u = a.sensitivity.unparsedAsBlock, w = a.sensitivity.withoutT5;
  L.push('', '**Độ nhạy:**', `- Coi "không đọc được kết luận" là chặn (§9 E7 (6)): n = ${u.n}, chỉ R1 ${u.aOnly}, chỉ R3 ${u.bOnly}, p = ${pp(u.p)}; hiệu ${dci(u)}.`, `- Bỏ \`t5-logq\` (điều kiện 2): n = ${w.n}, chỉ R1 ${w.aOnly}, chỉ R3 ${w.bOnly}, p = ${pp(w.p)}; hiệu ${dci(w)}; đọc: ${w.reading.label}.`);
  const cl = a.sensitivity.cappedLegacy;
  if (cl.ids.length) L.push(`- R3 chạm trần lượt trước bản sửa 13/11 (${cl.ids.length} cặp, ghi nhầm là lỗi hạ tầng rồi chạy lại: ${cl.ids.join(', ')}): coi lượt đầu là không đọc được (không chặn): chỉ R1 ${cl.asUnparsed.aOnly}, chỉ R3 ${cl.asUnparsed.bOnly}, p = ${pp(cl.asUnparsed.p)}; bỏ các cặp này: n = ${cl.excluded.n}, chỉ R1 ${cl.excluded.aOnly}, chỉ R3 ${cl.excluded.bOnly}, p = ${pp(cl.excluded.p)}.`);
  L.push('', `**Chạm trần lượt (dòng done có \`capped\`):** ${Object.entries(a.cappedDone).map(([k, v]) => `${k} ${v}`).join(', ')} (R1, R2 không ghi trường này: runtime CCoding xử lý trần lượt bên trong).`);
  L.push('', `**Không đọc được kết luận theo arm:** ${Object.entries(a.unparsed).map(([k, v]) => `${k} ${v}`).join(', ')}${a.unparsedDiffers ? ' — **lệch giữa các arm: tách nguyên nhân trước khi đọc recall (điều kiện 3)**' : ''}.`);
  L.push('', '## Theo bài', '', `| Bài | ${a.arms.map((x) => `${x} lỗi bị chặn`).join(' | ')} | ${a.arms.map((x) => `${x} đúng bị chặn`).join(' | ')} | chỉ R1 / chỉ R3 |`, `|---|${'--:|'.repeat(a.arms.length * 2)}---|`);
  for (const t of a.perTask) L.push(`| ${t.task} | ${a.arms.map((x) => `${t[`${x}|faulty`].blocked}/${t[`${x}|faulty`].n}`).join(' | ')} | ${a.arms.map((x) => `${t[`${x}|clean`].blocked}/${t[`${x}|clean`].n}`).join(' | ')} | ${t.r1Only} / ${t.r3Only} |`);
  if (a.byLabelFails) {
    L.push('', '## Recall theo số lần test ẩn trượt khi kiểm nhãn (điều kiện 2; mô tả)', '', `| Trượt | n | ${a.arms.join(' | ')} |`, `|---|--:|${'--:|'.repeat(a.arms.length)}`);
    for (const [g, c] of Object.entries(a.byLabelFails).sort()) L.push(`| ${g} | ${c.n} | ${a.arms.map((x) => c[x]).join(' | ')} |`);
  }
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const out = path.resolve(argv[argv.indexOf('--out') + 1]);
  const doc = JSON.parse(fs.readFileSync(path.join(out, 'items.json'), 'utf8'));
  const items = [...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])];
  const selected = JSON.parse(fs.readFileSync(path.join(out, 'selected.json'), 'utf8')).items;
  const rows = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ltFile = path.join(out, 'label-trials.jsonl');
  const labelTrials = fs.existsSync(ltFile) ? fs.readFileSync(ltFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : null;
  const a = analyze({ items, selected, rows, labelTrials });
  console.log(argv.includes('--json') ? JSON.stringify(a, null, 1) : report(a));
}
