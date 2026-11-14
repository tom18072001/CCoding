import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criteriaTable, followupDecision, type FollowupInput } from '../src/accept-followup.js';

const c = (name: string, result: 'pass' | 'fail' | 'unknown', scope?: 'in' | 'decision') => ({ name, result, evidence: 'bc', ...(scope ? { scope } : {}) });
const base = (over: Partial<FollowupInput> = {}): FollowupInput => ({
  acceptance: { parsed: true, criteria: [c('A', 'fail', 'in'), c('B', 'unknown', 'in'), c('C', 'pass'), c('D', 'fail', 'decision')] },
  roundsDone: 0, maxRounds: 1, budgetLeft: 1000, estimate: 500, taskStatus: 'running', aborted: false, ...over,
});

test('2 tiêu chí in ⇒ mở, tách đúng in/decision', () => {
  const d = followupDecision(base());
  assert.equal(d.open, true);
  assert.deepEqual(d.inScope.map((x) => x.name), ['A', 'B']);
  assert.deepEqual(d.decision.map((x) => x.name), ['D']);
});
test('chỉ decision ⇒ không mở', () => {
  assert.equal(followupDecision(base({ acceptance: { parsed: true, criteria: [c('D', 'fail', 'decision')] } })).open, false);
});
test('thiếu scope coi là decision', () => {
  const d = followupDecision(base({ acceptance: { parsed: true, criteria: [c('X', 'fail')] } }));
  assert.equal(d.open, false);
  assert.equal(d.decision.length, 1);
});
test('hết vòng / maxRounds=0 ⇒ không mở', () => {
  assert.equal(followupDecision(base({ roundsDone: 1 })).open, false);
  assert.equal(followupDecision(base({ maxRounds: 0 })).open, false);
});
test('thiếu ngân sách ⇒ không mở; vừa đủ thì mở', () => {
  assert.equal(followupDecision(base({ budgetLeft: 499 })).open, false);
  assert.equal(followupDecision(base({ budgetLeft: 500 })).open, true);
});
test('cancelled/paused/aborted ⇒ không mở', () => {
  assert.equal(followupDecision(base({ taskStatus: 'cancelled' })).open, false);
  assert.equal(followupDecision(base({ taskStatus: 'paused' })).open, false);
  assert.equal(followupDecision(base({ aborted: true })).open, false);
});
test('parsed=false hoặc có lỗi ⇒ không mở', () => {
  assert.equal(followupDecision(base({ acceptance: { parsed: false, criteria: [c('A', 'fail', 'in')] } })).open, false);
  assert.equal(followupDecision(base({ acceptance: { parsed: true, error: 'x', criteria: [c('A', 'fail', 'in')] } })).open, false);
});
test('criteriaTable: thoát dấu |, thiếu scope ghi decision', () => {
  const t = criteriaTable([{ name: 'a|b', result: 'fail', evidence: 'x\ny' }]);
  assert.match(t, /a\\\|b \| fail \| x y \| decision/);
});
