// B-11: trường nghiên cứu ghi vào runs.jsonl (thời gian/token theo pha, lane, cổng B-02, vòng sửa, chế độ accept, kích thước prompt)
import test from 'node:test';
import assert from 'node:assert/strict';
import { researchFields } from '../lib/ccoding.mjs';

const line = (o) => JSON.stringify(o);
const calls = [
  line({ ts: '2026-11-03T00:00:10Z', phase: 'execute', durationMs: 4000, input: 10, output: 2, cacheRead: 5, cacheWrite: 1, sizes: { system: 100, context: 50, prompt: 20 } }),
  line({ ts: '2026-11-03T00:00:20Z', phase: 'execute', durationMs: 1500, input: 1, output: 1, cacheRead: 0, cacheWrite: 0, sizes: { system: 100, context: 60, prompt: 20 } }),
  line({ ts: '2026-11-03T00:00:30Z', phase: 'accept', durationMs: 2000, input: 3, output: 4, cacheRead: 0, cacheWrite: 2 }),
].join('\n');
const task = { lane: 'single', projectChecks: { latest: [{ ok: true }, { ok: true }] }, runs: [{ gateFixRoundsUsed: 1 }, {}], acceptance: { mode: 'brief' } };

test('đủ trường mới, token đủ 4 thành phần, giây theo pha từ durationMs', () => {
  const r = researchFields(calls, task);
  assert.deepEqual(r.byPhaseSec, { execute: 5.5, accept: 2 });
  assert.equal(r.byPhaseSecSource, 'calls.durationMs');
  assert.deepEqual(r.byPhaseTokens.execute, { input: 11, output: 3, cacheRead: 5, cacheWrite: 1 });
  assert.deepEqual(r.promptChars.execute, { system: 200, context: 110, prompt: 40, calls: 2 });
  assert.equal(r.promptChars.accept, undefined);
  assert.deepEqual([r.lane, r.gate, r.fixRounds, r.acceptMode, r.escalatedFrom], ['single', 'green', 1, 'brief', null]);
});

test('mặc định: thiếu acceptance → full; không lệnh kiểm tra → gate none; đỏ → red; nâng làn được ghi', () => {
  assert.equal(researchFields('', {}).acceptMode, 'full');
  assert.equal(researchFields('', {}).gate, 'none');
  assert.equal(researchFields('', {}).byPhaseSecSource, 'none');
  const t = { lane: 'fast', projectChecks: { latest: [{ ok: true }, { ok: false }] }, runs: [{ escalatedFrom: 'single' }] };
  assert.deepEqual([researchFields('', t).gate, researchFields('', t).escalatedFrom], ['red', 'single']);
});

test('thiếu durationMs → dùng hiệu ts; không chép nội dung prompt', () => {
  const c = [line({ ts: '2026-11-03T00:00:00Z', phase: 'plan' }), line({ ts: '2026-11-03T00:00:03Z', phase: 'execute', text: 'bí mật' })].join('\n');
  const r = researchFields(c, {});
  assert.equal(r.byPhaseSecSource, 'calls.ts');
  assert.equal(r.byPhaseSec.execute, 3);
  assert.ok(!JSON.stringify(r).includes('bí mật'));
});
