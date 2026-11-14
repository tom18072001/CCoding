import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { followupCodes, planGate, type GateSubtask } from '../src/plan-gate.js';

const brief = fs.readFileSync(path.join('docs', 'research', 'BRIEF-D18b.md'), 'utf8');
const plan: GateSubtask[] = JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', 'plan-d18b-followup.json'), 'utf8')).subtasks;
const ROLES = {
  security: { role: 'member', skills: [] },
  'qa-tester': { role: 'member', skills: ['testing'] },
  'backend-dev': { role: 'member', skills: [] },
};

test('vòng bổ sung K1: fixture D18b, tiêu chí không có mã ⇒ không chặn, ghi followupScope.skipped', () => {
  const g = planGate({ brief, planSummary: '', subtasks: plan, agentRoles: ROLES, followup: { criteria: ['chainChecker bắt buộc ký\nkẻ gỡ sig vẫn lọt'] } });
  assert.equal(g.blocked, false);
  assert.deepEqual(g.followupScope, { codes: [], skipped: true });
});

test('vòng bổ sung K1: đối chứng — cùng kế hoạch kiểm như kế hoạch thường thì bị chặn', () => {
  const g = planGate({ brief, planSummary: '', subtasks: plan, agentRoles: ROLES });
  assert.equal(g.blocked, true);
  assert.equal(g.followupScope, undefined);
});

test('vòng bổ sung K1: tiêu chí nêu K2, kế hoạch không nhắc K2 ⇒ chặn brief-item, chỉ vì K2', () => {
  const g = planGate({ brief, planSummary: '', subtasks: plan, agentRoles: ROLES, followup: { criteria: ['K2 — đầu ra bị cắt chưa sửa hết'] } });
  assert.deepEqual(g.followupScope, { codes: ['K2'], skipped: false });
  assert.equal(g.blocked, true);
  assert.equal(g.rules.includes('brief-item'), true);
  const items = g.reasons.filter((r) => r.startsWith('brief-item'));
  assert.equal(items.length, 1);
  assert.match(items[0], /K2/);
  assert.equal(g.reasons.some((r) => /K[1345]\b/.test(r)), false);
});

test('vòng bổ sung K1: kế hoạch có nhắc K4 (K4 có trong fixture) ⇒ đạt', () => {
  const withK4 = plan.map((s, i) => (i === 0 ? { ...s, title: `K4 — ${s.title}` } : s));
  const g = planGate({ brief, planSummary: '', subtasks: withK4, agentRoles: ROLES, followup: { criteria: ['K4'] } });
  assert.equal(g.blocked, false);
});

test('vòng bổ sung K1: followupCodes chỉ nhận mã có trong đề bài', () => {
  assert.deepEqual(followupCodes(brief, ['K4 và K9']), ['K4']);
  assert.deepEqual(followupCodes(brief, ['không mã']), []);
});

test('vòng bổ sung K1: rule B (đọc được) vẫn áp dụng', () => {
  const bad = [{ ...plan[0], deliverable: '...' }, plan[1]];
  const g = planGate({ brief, planSummary: '', subtasks: bad, agentRoles: ROLES, followup: { criteria: ['không mã'] } });
  assert.equal(g.rules.includes('B'), true);
  assert.equal(g.rules.includes('A'), false);
});
