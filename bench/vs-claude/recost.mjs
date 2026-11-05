#!/usr/bin/env node
// D12/K2: tính lại chi phí từ dữ liệu thô bằng lib/pricing.mjs hiện hành. KHÔNG sửa runs.jsonl.
//   node bench/vs-claude/recost.mjs <resultsDir> [--out <tệp.json>]
// Nguồn token cho mỗi dòng (ưu tiên từ trên xuống):
//   1. <resultsDir>/calls/<key>.jsonl nếu có (mỗi dòng một lượt gọi, có model) → costOfCalls.
//   2. byPhaseDetail × byPhaseModel của dòng runs.jsonl, khi MỌI pha có đúng một model → cộng theo pha.
//   3. Còn lại giữ nguyên số đã ghi (source = 'giữ nguyên'), kèm lý do.
// Đầu ra: <resultsDir>/costs-recomputed.json (hoặc --out). Chạy lại cho kết quả như nhau.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAIKU_TIER_SUFFIX, PRICING_VERSION, costBasisOf, costOf, costOfCalls, isTiered } from './lib/pricing.mjs';

const round = (x) => (x === null || x === undefined ? x : Number(x.toFixed(6)));

/** Cộng chi phí theo pha; null nếu có pha thiếu/nhiều model hoặc model lạ. */
export function costOfPhases(detail, phaseModel, { cacheTtl = '1h' } = {}) {
  const phases = Object.keys(detail ?? {});
  if (!phases.length) return null;
  let sum = 0, low = 0, tiered = false;
  for (const ph of phases) {
    const ms = phaseModel?.[ph];
    const m = Array.isArray(ms) ? (ms.length === 1 ? ms[0] : null) : typeof ms === 'string' ? ms : null;
    const usd = m ? costOf(detail[ph], m, { cacheTtl }) : null;
    if (usd === null) return null;
    sum += usd; low += costOf(detail[ph], m, { cacheTtl, tier: 'low' });
    if (isTiered(m)) tiered = true;
  }
  return tiered
    ? { costUsd: sum, costUsdLow: low, costBasis: costBasisOf(cacheTtl) + HAIKU_TIER_SUFFIX }
    : { costUsd: sum, costBasis: costBasisOf(cacheTtl) };
}

export function recostRow(row, { callsDir } = {}) {
  const base = { key: row.key, arm: row.arm, costUsdOld: row.costUsd ?? null, costBasisOld: row.costBasis ?? null };
  const callsFile = callsDir && row.key ? path.join(callsDir, `${row.key}.jsonl`) : null;
  let c = null, source = null;
  if (callsFile && fs.existsSync(callsFile)) { c = costOfCalls(fs.readFileSync(callsFile, 'utf8')); source = 'calls'; }
  else if (row.byPhaseDetail && row.byPhaseModel) { c = costOfPhases(row.byPhaseDetail, row.byPhaseModel); source = 'byPhase'; }
  if (!c || c.costUsd === null) {
    const reason = row.byPhaseDetail ? 'pha thiếu hoặc nhiều model, hoặc model lạ' : 'không có calls/byPhaseDetail (arm claude -p đã có giá từ lúc chạy)';
    return { ...base, source: 'giữ nguyên', reason, costUsd: base.costUsdOld, costBasis: base.costBasisOld };
  }
  return { ...base, source, costUsd: round(c.costUsd), ...(c.costUsdLow !== undefined ? { costUsdLow: round(c.costUsdLow) } : {}), costBasis: c.costBasis };
}

export function recost(resultsDir, { out } = {}) {
  const runsFile = path.join(resultsDir, 'runs.jsonl');
  if (!fs.existsSync(runsFile)) throw new Error(`Không thấy ${runsFile}`);
  const rows = fs.readFileSync(runsFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const callsDir = path.join(resultsDir, 'calls');
  const recomputed = rows.map((r) => recostRow(r, { callsDir: fs.existsSync(callsDir) ? callsDir : null }));
  const byArm = {};
  for (const r of recomputed) {
    const a = (byArm[r.arm] ??= { n: 0, nNull: 0, minLow: null, maxUpper: null, sumLow: 0, sumUpper: 0 });
    a.n++;
    if (r.costUsd === null || r.costUsd === undefined) { a.nNull++; continue; }
    const lo = r.costUsdLow ?? r.costUsd;
    a.minLow = a.minLow === null ? lo : Math.min(a.minLow, lo); a.maxUpper = a.maxUpper === null ? r.costUsd : Math.max(a.maxUpper, r.costUsd);
    a.sumLow += lo; a.sumUpper += r.costUsd;
  }
  for (const a of Object.values(byArm)) { a.sumLow = round(a.sumLow); a.sumUpper = round(a.sumUpper); }
  const result = {
    note: 'Tính lại từ dữ liệu thô; runs.jsonl không bị sửa. costUsd = cận trên (bậc Haiku > 100K), costUsdLow = cận dưới.',
    pricingVersion: PRICING_VERSION, source: path.basename(path.resolve(resultsDir)), nRows: rows.length, byArm, rows: recomputed,
  };
  const dest = out ?? path.join(resultsDir, 'costs-recomputed.json');
  fs.writeFileSync(dest, `${JSON.stringify(result, null, 2)}\n`);
  return { dest, result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : undefined;
  const dir = args.find((a, k) => !a.startsWith('--') && (i < 0 || k !== i + 1));
  if (!dir) { console.error('Cách dùng: node bench/vs-claude/recost.mjs <resultsDir> [--out tệp.json]'); process.exit(2); }
  try {
    const { dest, result } = recost(dir, { out });
    console.log(`Đã ghi ${dest} (${result.nRows} dòng, pricing ${result.pricingVersion})`);
    for (const [arm, a] of Object.entries(result.byArm)) console.log(`  ${arm}: n=${a.n}, null=${a.nNull}, costUsdLow ${a.minLow ?? 'NA'} … costUsd ${a.maxUpper ?? 'NA'}`);
  } catch (e) { console.error(`Lỗi: ${e.message}`); process.exit(1); }
}
