// D12/K2: recost.mjs tính lại chi phí từ dữ liệu thô, không sửa runs.jsonl.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRICING_VERSION } from '../lib/pricing.mjs';
import { recost, recostRow } from '../recost.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const M = 1e6;
const ccRow = {
  key: 't1__B0__r1', arm: 'B0', costUsd: null, costBasis: 'unknown-model',
  byPhaseDetail: { route: { calls: 1, input: M, cacheRead: 0, cacheWrite: 0, output: 0 }, execute: { calls: 2, input: M, cacheRead: 0, cacheWrite: 0, output: M } },
  byPhaseModel: { route: ['claude-haiku-5-5'], execute: ['claude-sonnet-5-5'] },
};
const a0Row = { key: 't1__A0-sonnet__r1', arm: 'A0-sonnet', costUsd: 0.5, costBasis: 'pricing@2026-11-03/1h' };

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recost-'));
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), [ccRow, a0Row].map((r) => JSON.stringify(r)).join('\n') + '\n');
  return dir;
}

test('recostRow: theo pha, Haiku cận trên/cận dưới, Sonnet giữ giá', () => {
  const r = recostRow(ccRow);
  near(r.costUsd, 0.5 + 2 + 10); near(r.costUsdLow, 0.1 + 2 + 10);
  assert.ok(r.costUsd >= r.costUsdLow);
  assert.equal(r.costBasis, `pricing@${PRICING_VERSION}/1h/haiku-tier-upper`);
  assert.equal(r.source, 'byPhase'); assert.equal(r.costUsdOld, null); assert.equal(r.costBasisOld, 'unknown-model');
});

test('recostRow: ưu tiên calls/<key>.jsonl; pha nhiều model ⇒ giữ nguyên số cũ, nêu lý do', () => {
  const dir = fixture(); fs.mkdirSync(path.join(dir, 'calls'));
  fs.writeFileSync(path.join(dir, 'calls', `${ccRow.key}.jsonl`), JSON.stringify({ model: 'claude-haiku-5-5', input: M, output: 0, cacheRead: 0, cacheWrite: 0 }) + '\n');
  const r = recostRow(ccRow, { callsDir: path.join(dir, 'calls') });
  assert.equal(r.source, 'calls'); near(r.costUsd, 0.5); near(r.costUsdLow, 0.1);
  const multi = recostRow({ ...ccRow, byPhaseModel: { ...ccRow.byPhaseModel, execute: ['claude-sonnet-5-5', 'claude-haiku-5-5'] } });
  assert.equal(multi.source, 'giữ nguyên'); assert.equal(multi.costUsd, null); assert.match(multi.reason, /nhiều model/);
  const a0 = recostRow(a0Row); assert.equal(a0.costUsd, 0.5); assert.equal(a0.source, 'giữ nguyên');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recost: ghi costs-recomputed.json, không sửa runs.jsonl, chạy lại cho kết quả như nhau, CLI chạy được', () => {
  const dir = fixture();
  const before = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8');
  const { dest, result } = recost(dir);
  assert.equal(dest, path.join(dir, 'costs-recomputed.json'));
  assert.equal(fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8'), before);
  assert.equal(result.byArm.B0.nNull, 0); near(result.byArm.B0.maxUpper, 12.5); near(result.byArm.B0.minLow, 12.1);
  assert.equal(result.byArm['A0-sonnet'].nNull, 0);
  const again = JSON.parse(fs.readFileSync(dest, 'utf8'));
  assert.deepEqual(recost(dir).result, again);
  const cli = spawnSync(process.execPath, [path.join(SUITE, 'recost.mjs'), dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /B0: n=1, null=0/);
  assert.equal(spawnSync(process.execPath, [path.join(SUITE, 'recost.mjs')], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [path.join(SUITE, 'recost.mjs'), path.join(dir, 'không-có')], { encoding: 'utf8' }).status, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
