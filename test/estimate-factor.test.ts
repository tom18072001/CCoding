// D21 K3: runtimeFactor['claude-cli'] khớp quy tắc đổi/giữ trên số liệu estimate-vs-actual.json (chỉ số tổng).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig } from '../src/config.js';

interface Row { brief: string; runtime?: string; estimate: { tokens: number; basis: string }; actual: { total: number } }
const FILE = 'bench/vs-claude/results/decisions/estimate-vs-actual.json';
const BASE_FACTOR = 5;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * (pos - lo);
}

// Hàng chưa ghi runtime là các gói D18d chạy dưới claude-cli. Chỉ ca ước lượng theo hằng số mới chịu hệ số runtime.
function constantRows(rows: Row[], runtime: string): Row[] {
  return rows.filter((r) => (r.runtime ?? 'claude-cli') === runtime && r.estimate.basis.startsWith('theo hằng số'));
}

test('runtimeFactor claude-cli: chỉ đổi khi n ≥ 5 và lệch > 1,5 lần so với 5', () => {
  const rows = (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { rows: Row[] }).rows;
  const sel = constantRows(rows, 'claude-cli');
  const ratios = sel.map((r) => r.actual.total / r.estimate.tokens).sort((a, b) => a - b);
  const n = ratios.length;
  const median = n ? quantile(ratios, 0.5) : NaN;
  const iqr = n ? quantile(ratios, 0.75) - quantile(ratios, 0.25) : NaN;
  assert.ok(Number.isNaN(iqr) || iqr >= 0);
  const drift = n >= 5 ? median : 1;
  const changed = n >= 5 && (drift > 1.5 || drift < 1 / 1.5);
  const expected = changed ? Math.round(BASE_FACTOR * drift) : BASE_FACTOR;
  assert.equal(loadConfig().estimate.runtimeFactor?.['claude-cli'], expected);
});

test('estimate-vs-actual.json: các hàng gốc BRIEF-19…23 vẫn còn, tổng token khớp thành phần', () => {
  const rows = (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { rows: Array<Row & { actual: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } }> }).rows;
  const names = rows.map((r) => r.brief);
  for (const b of ['BRIEF-19', 'BRIEF-20', 'BRIEF-21', 'BRIEF-22', 'BRIEF-23']) assert.ok(names.includes(b), b);
  for (const r of rows) assert.equal(r.actual.total, r.actual.input + r.actual.output + r.actual.cacheRead + r.actual.cacheWrite, r.brief);
});
