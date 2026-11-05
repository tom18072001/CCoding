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

export function analyze({ items, selected, rows, arms = ['R1', 'R2', 'R3'] }) {
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
  const pair = (a, b, kind) => {
    let both = 0, bb = 0, cc = 0, agree = 0;
    for (const x of sel.filter((y) => y.kind === kind)) {
      const ra = last.get(`${x.id}__${a}`), rb = last.get(`${x.id}__${b}`);
      if (!ra || !rb) continue;
      both++;
      const ba = ra.verdict === 'block', bl = rb.verdict === 'block';
      if (ba && !bl) bb++; else if (!ba && bl) cc++; else agree++;
    }
    return { a, b, kind, n: both, aOnly: bb, bOnly: cc, agree, p: mcnemarExact(bb, cc) };
  };
  const primary = pair('R1', 'R3', 'faulty');
  const secondary = [pair('R1', 'R2', 'faulty'), pair('R2', 'R3', 'faulty'), pair('R1', 'R3', 'clean'), pair('R1', 'R2', 'clean')];
  return { per, primary, secondary, nSelected: sel.length };
}

export function report(a) {
  const f = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') : '—');
  const ci = (v) => `[${f(v[0])}; ${f(v[1])}]`;
  const L = [`# E7: CTO nghiệm thu trên lỗi lọt cổng`, '', `Mục chốt: ${a.nSelected}.`, '', '| Arm | Recall (lỗi bị chặn) | CP 95 % | Bootstrap theo bài | Chặn nhầm (đúng bị chặn) | CP 95 % | Không đọc được kết luận | wtok TB | USD |', '|---|---|---|---|---|---|---|---|---|'];
  for (const p of Object.values(a.per)) L.push(`| ${p.arm} | ${p.faulty.blocked}/${p.faulty.n} = ${f(p.faulty.rate)} % | ${ci(p.faulty.cp)} | ${ci(p.faulty.boot)} | ${p.clean.blocked}/${p.clean.n} = ${f(p.clean.rate)} % | ${ci(p.clean.cp)} | ${p.faulty.unparsed + p.clean.unparsed} | ${Math.round(p.cost.wtokMean).toLocaleString('vi-VN')} | ${p.cost.usd == null ? '—' : p.cost.usd.toFixed(2).replace('.', ',')} |`);
  const pr = a.primary;
  L.push('', `**Phép kiểm chính (McNemar chính xác, hai phía), ${pr.a} so với ${pr.b} trên ${pr.n} mục lỗi:** chỉ ${pr.a} chặn ${pr.aOnly}, chỉ ${pr.b} chặn ${pr.bOnly}, p = ${pr.p.toFixed(4).replace('.', ',')}.`, '', '**Phụ (mô tả):**');
  for (const s of a.secondary) L.push(`- ${s.a} so với ${s.b}, mục ${s.kind === 'faulty' ? 'lỗi' : 'đúng'} (n = ${s.n}): chỉ ${s.a} chặn ${s.aOnly}, chỉ ${s.b} chặn ${s.bOnly}, p = ${s.p.toFixed(4).replace('.', ',')}.`);
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const out = path.resolve(argv[argv.indexOf('--out') + 1]);
  const doc = JSON.parse(fs.readFileSync(path.join(out, 'items.json'), 'utf8'));
  const items = [...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])];
  const selected = JSON.parse(fs.readFileSync(path.join(out, 'selected.json'), 'utf8')).items;
  const rows = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const a = analyze({ items, selected, rows });
  console.log(argv.includes('--json') ? JSON.stringify(a, null, 1) : report(a));
}
