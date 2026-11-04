// SR-02: bảng giá có phiên bản + costUsd của arm CCoding theo model từng lượt gọi.
// node --test bench/vs-claude/test/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRICING_VERSION, costBasisOf, costOf, costOfCalls, priceOf, priceRun } from '../lib/pricing.mjs';
import { doneKeys } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Tokens thật: results/b7prime/runs.jsonl, khóa t5-logq__A0-sonnet__r1 (dòng có costUsd 0.3385364; study-cloud có dòng cùng khóa nhưng token khác).
function realRow() {
  const lines = fs.readFileSync(path.join(SUITE, 'results/b7prime/runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return lines.find((r) => r.key === 't5-logq__A0-sonnet__r1');
}

test('SR-02: công thức 1 giờ khớp costUsd của A0-sonnet (results/b7prime/runs.jsonl, t5-logq__A0-sonnet__r1 = 0,33854)', () => {
  const row = realRow();
  assert.deepEqual([row.tokens.input, row.tokens.output, row.tokens.cacheRead, row.tokens.cacheWrite], [14, 16730, 169604, 38562]);
  const usd = costOf(row.tokens, 'claude-sonnet-5-5'); // mặc định '1h' (D4)
  near(usd, 0.3385364);
  near(usd, row.costUsd, 1e-9);
  assert.equal(usd.toFixed(5), '0.33854');
  assert.ok(Math.abs(costOf(row.tokens, 'claude-sonnet-5-5', { cacheTtl: '5m' }) - row.costUsd) > 0.01, 'TTL 5 phút phải cho số khác');
});

test('SR-02: bảng giá Sonnet $2/$10, Opus $4/$20, đọc cache 0,05×, ghi cache 2× (1h) / 1,25× (5m)', () => {
  near(costOf({ input: 1e6 }, 'claude-sonnet-5-5'), 2);
  near(costOf({ output: 1e6 }, 'claude-sonnet-5-5'), 10);
  near(costOf({ input: 1e6 }, 'claude-opus-5-5'), 4);
  near(costOf({ output: 1e6 }, 'claude-opus-5-5'), 20);
  near(costOf({ cacheRead: 1e6 }, 'claude-opus-5-5'), 0.2);
  near(costOf({ cacheWrite: 1e6 }, 'claude-opus-5-5'), 8);
  near(costOf({ cacheWrite: 1e6 }, 'claude-opus-5-5', { cacheTtl: '5m' }), 5);
  assert.match(PRICING_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(costBasisOf('1h'), `pricing@${PRICING_VERSION}/1h`);
});

test('SR-02: model lạ/thiếu hoặc TTL lạ ⇒ null, không đoán; hậu tố ngày được chuẩn hóa', () => {
  assert.equal(costOf({ input: 5 }, 'claude-unknown-9'), null);
  assert.equal(costOf({ input: 5 }, undefined), null);
  assert.equal(costOf({ input: 5 }, 'claude-opus-5-5', { cacheTtl: '24h' }), null);
  assert.deepEqual(priceOf('claude-opus-5-5-20261101'), { input: 4, output: 20 });
});

test('SR-02: costOfCalls cộng theo model từng dòng; một dòng thiếu model ⇒ cả lượt null + unknown-model', () => {
  const sonnet = { model: 'claude-sonnet-5-5', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 };
  const opus = { model: 'claude-opus-5-5', input: 0, output: 1e6, cacheRead: 0, cacheWrite: 0 };
  const j = (...r) => r.map((x) => JSON.stringify(x)).join('\n');
  const ok = costOfCalls(j(sonnet, opus));
  near(ok.costUsd, 2 + 20);
  assert.equal(ok.costBasis, `pricing@${PRICING_VERSION}/1h`);
  assert.deepEqual(costOfCalls(j(sonnet, { ...opus, model: undefined })), { costUsd: null, costBasis: 'unknown-model' });
  assert.deepEqual(costOfCalls(''), { costUsd: null, costBasis: 'unknown-model' });
  near(costOfCalls(`${j(sonnet)}\nkhông phải JSON\n`).costUsd, 2); // dòng hỏng bị bỏ qua
});

test('SR-02: priceRun — null/oracle = 0; claude tính lại từ model thực và giữ số CLI báo; CCoding lấy callsCost', () => {
  const row = realRow();
  assert.equal(priceRun({ kind: 'null' }, {}).costUsd, 0);
  const c = priceRun({ kind: 'claude' }, { tokens: row.tokens, model: 'claude-sonnet-5-5', costUsd: row.costUsd });
  near(c.costUsd, 0.3385364); assert.equal(c.costUsdReported, row.costUsd);
  assert.deepEqual(priceRun({ kind: 'claude' }, { tokens: row.tokens, model: null, costUsd: 1 }), { costUsd: null, costBasis: 'unknown-model', costUsdReported: 1 });
  assert.deepEqual(priceRun({ kind: 'ccoding' }, { callsCost: { costUsd: 3, costBasis: 'x' } }), { costUsd: 3, costBasis: 'x' });
  assert.deepEqual(priceRun({ kind: 'ccoding' }, {}), { costUsd: null, costBasis: 'unknown-model' });
});

// ─── D12/K2: Haiku 5.5 hai bậc (nguồn: platform.claude.com/docs/en/models/haiku-5-5/overview, truy cập 4/11/2026) ───
const HAIKU = 'claude-haiku-5-5';

test('D12/K2: Haiku 5.5 — bậc cao $0,50/$2,50, bậc thấp $0,10/$0,50, đọc cache 0,1× (khác Sonnet/Opus 0,05×), ghi cache 2×/1,25×', () => {
  near(costOf({ input: 1e6 }, HAIKU), 0.5);
  near(costOf({ output: 1e6 }, HAIKU), 2.5);
  near(costOf({ cacheRead: 1e6 }, HAIKU), 0.05);
  near(costOf({ cacheWrite: 1e6 }, HAIKU), 1);
  near(costOf({ cacheWrite: 1e6 }, HAIKU, { cacheTtl: '5m' }), 0.625);
  near(costOf({ input: 1e6 }, HAIKU, { tier: 'low' }), 0.1);
  near(costOf({ output: 1e6 }, HAIKU, { tier: 'low' }), 0.5);
  near(costOf({ cacheRead: 1e6 }, HAIKU, { tier: 'low' }), 0.01);
  near(costOf({ cacheWrite: 1e6 }, HAIKU, { tier: 'low' }), 0.2);
  near(costOf({ cacheWrite: 1e6 }, HAIKU, { tier: 'low', cacheTtl: '5m' }), 0.125);
  assert.ok(costOf({ input: 7 }, `${HAIKU}-20261104`) !== null, 'hậu tố ngày được chuẩn hóa');
});

test('D12/K2: costOfCalls với Haiku — costUsd ≥ costUsdLow, costBasis có hậu tố /haiku-tier-upper', () => {
  const j = (...r) => r.map((x) => JSON.stringify(x)).join('\n');
  const h = { model: HAIKU, input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 };
  const s = { model: 'claude-sonnet-5-5', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 };
  const r = costOfCalls(j(h, s));
  near(r.costUsd, (0.5 + 2.5 + 0.05 + 1) + 2);
  near(r.costUsdLow, (0.1 + 0.5 + 0.01 + 0.2) + 2);
  assert.ok(r.costUsd >= r.costUsdLow);
  assert.equal(r.costBasis, `pricing@${PRICING_VERSION}/1h/haiku-tier-upper`);
  assert.deepEqual(costOfCalls(j(h, { ...s, model: 'claude-lạ-1' })), { costUsd: null, costBasis: 'unknown-model' });
  const p = priceRun({ kind: 'claude' }, { tokens: { input: 1e6 }, model: HAIKU, costUsd: 9 });
  assert.ok(p.costUsd >= p.costUsdLow); assert.match(p.costBasis, /\/haiku-tier-upper$/); assert.equal(p.costUsdReported, 9);
});

test('D12/K2: model khác Haiku giữ nguyên kết quả (không thêm costUsdLow, costBasis không đổi, giá không đổi)', () => {
  const row = realRow();
  near(costOf(row.tokens, 'claude-sonnet-5-5'), 0.3385364);
  near(costOf(row.tokens, 'claude-sonnet-5-5', { tier: 'low' }), 0.3385364); // không có bậc ⇒ tier không ảnh hưởng
  near(costOf({ cacheRead: 1e6 }, 'claude-opus-5-5', { tier: 'low' }), 0.2);
  const sonnet = JSON.stringify({ model: 'claude-sonnet-5-5', input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 });
  assert.deepEqual(costOfCalls(sonnet), { costUsd: 2 + 10 + 0.1 + 4, costBasis: `pricing@${PRICING_VERSION}/1h` });
  assert.deepEqual(priceOf('claude-sonnet-5-5'), { input: 2, output: 10 });
  assert.deepEqual(priceOf('claude-opus-5-5'), { input: 4, output: 20 });
  assert.ok(!('costUsdLow' in priceRun({ kind: 'claude' }, { tokens: row.tokens, model: 'claude-opus-5-5' })));
});

test('tương thích: dữ liệu cũ thiếu trường D1 vẫn đọc được (doneKeys trên results/ thật không ném lỗi, không mất khóa done)', () => {
  const text = fs.readFileSync(path.join(SUITE, 'results/b7prime/runs.jsonl'), 'utf8');
  const keys = doneKeys(text);
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(keys.size, new Set(rows.filter((r) => r.status === 'done' || r.excluded).map((r) => r.key)).size);
  assert.ok(rows.every((r) => r.excluded === undefined), 'dữ liệu cũ chưa có excluded ⇒ coi là null');
});
