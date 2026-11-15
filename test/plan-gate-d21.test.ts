import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkPlanCoverage, planGate, planTargets, type GateSubtask } from '../src/plan-gate.js';

// D21 K2 — luật A chỉ lấy đích giao sửa, không lấy tệp chỉ được nhắc.
const fx = (f: string) => JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', f), 'utf8')) as { brief: string; subtasks: GateSubtask[] };
const st = (id: string, description: string): GateSubtask => ({ id, title: `Việc ${id}`, description, assignee: 'backend-dev', deliverable: 'Báo cáo' });

test('D21 K2: plan-d20-split.json + BRIEF-D20 không còn lý do A (src/registry.ts, test/registry.test.ts chỉ nằm trong mô tả rule)', () => {
  const j = fx('plan-d20-split.json');
  const brief = fs.readFileSync(j.brief, 'utf8');
  const targets = planTargets(brief, '');
  assert.equal(targets.includes('src/registry.ts'), false);
  assert.equal(targets.includes('test/registry.test.ts'), false);
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: j.subtasks }).uncovered, []);
  assert.equal(planGate({ brief, planSummary: '', subtasks: j.subtasks }).reasons.some((r) => r.startsWith('A:')), false);
});

test('D21 K2: mọi fixture thật không có lý do A; đích giao sửa vẫn được giữ', () => {
  for (const f of fs.readdirSync(path.join('test', 'fixtures', 'brief-item'))) {
    const j = fx(f);
    const brief = fs.readFileSync(j.brief, 'utf8');
    assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: j.subtasks }).uncovered, [], f);
  }
  const d20 = fx('plan-d20-split.json');
  assert.deepEqual(planTargets(fs.readFileSync(d20.brief, 'utf8'), ''), ['scripts/lint/run.mjs']);
});

test('D21 K2: tệp giao sửa ở dòng hạng mục mà không ai nhận vẫn bị A', () => {
  const brief = '## Hạng mục\n**K1 — backend-dev: sửa src/a.ts**\n- Sửa `src/b.ts` cho đúng.\n';
  const subtasks = [st('S1', 'chỉ làm src/a.ts')];
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks }).uncovered, ['src/b.ts']);
  assert.equal(planGate({ brief, planSummary: '', subtasks }).reasons.some((r) => r.startsWith('A: chưa có hạng mục nhận src/b.ts')), true);
});

test('D21 K2: tệp chỉ có trong mô tả rule, trong "vd.", trong ngoặc dẫn chứng hoặc mục Căn cứ thì không thành đích', () => {
  const brief = [
    '**Căn cứ:** lỗi ở `src/can-cu.ts` và `test/can-cu.test.ts`.',
    '## Hạng mục',
    '**K1 — backend-dev: thêm rule**',
    '- Sửa `src/that.ts`.',
    '  - `co-change` (cần mốc): `src/rule-a.ts` đổi thì `test/rule-a.test.ts` cũng phải đổi.',
    '- Báo lỗi rõ (vd. `src/vi-du.ts` và `test/vi-du.test.ts`).',
    '- Ghi nhận (theo `src/dan-chung.ts`).',
  ].join('\n');
  assert.deepEqual(planTargets(brief, ''), ['src/that.ts']);
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: [st('S1', 'src/that.ts')] }).uncovered, []);
});

test('D21 K2: mục "Được sửa" vẫn tính; đề bài không có hạng mục K giữ hành vi cũ (toàn văn)', () => {
  const withK = '- **Được sửa:** `src/x.ts`.\n**K1 — dev: làm việc**\n- Xong.\n';
  assert.deepEqual(planTargets(withK, ''), ['src/x.ts']);
  assert.deepEqual(planTargets('Viết src/agg.js và test/agg.test.js', ''), ['src/agg.js', 'test/agg.test.js']);
});
