import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkBriefItems, followupCodes, planGate, type GateSubtask } from '../src/plan-gate.js';

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', f), 'utf8')) as { brief: string; subtasks: GateSubtask[] };

test('brief-item: kế hoạch thật tách K1 thành K1a, K1b thì K1 được tính là đã nhận (BRIEF-22c giao lại, D20)', () => {
  for (const f of ['plan-brief22c-split.json', 'plan-d20-split.json']) {
    const p = fx(f);
    const brief = fs.readFileSync(p.brief, 'utf8');
    const items = checkBriefItems({ brief, subtasks: p.subtasks });
    assert.deepEqual(items, [], `${f}: ${items.join('; ')}`);
    assert.ok(!planGate({ brief, planSummary: '', subtasks: p.subtasks }).rules.includes('brief-item'), f);
  }
});

test('brief-item: phần tách chỉ là một chữ cái thường; K10, K1ab, K1B không tính là K1', () => {
  const brief = '**K1 — senior-swe: việc một**\n\n**K2 — backend-dev: việc hai**\n';
  const sub = (title: string): GateSubtask => ({ id: 'S1', title, description: '', assignee: 'senior-swe' } as GateSubtask);
  for (const t of ['K1a — phần a', 'k1b — phần b', 'K1 — đủ', 'Làm K1b trước']) assert.ok(!checkBriefItems({ brief, subtasks: [sub(t)] }).some((r) => r.startsWith('K1')), t);
  for (const t of ['K10 — khác', 'K1ab — khác', 'K1B — khác', 'K12 — khác']) assert.ok(checkBriefItems({ brief, subtasks: [sub(t)] }).some((r) => r.startsWith('K1')), t);
});

test('followupCodes: tiêu chí nhắc K1a vẫn quy về K1 của đề bài', () => {
  const brief = '**K1 — senior-swe: việc một**\n\n**K2 — backend-dev: việc hai**\n';
  assert.deepEqual(followupCodes(brief, ['K1a: chưa có test']), ['K1']);
  assert.deepEqual(followupCodes(brief, ['K10: không thuộc đề bài']), []);
});
