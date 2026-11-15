import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NEEDS_CMD_RE, needsCommand, checkPlanReadable, type GateSubtask } from '../src/plan-gate.js';

const READ_ONLY = ['read_file', 'search', 'write_file'];
const ALL = [...READ_ONLY, 'run_command'];

test('D25: kế hoạch thật BRIEF-26b, vai chỉ đọc methodologist ⇒ không có lý do (vi) cho S1', () => {
  const plan = JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', 'plan-brief26b-negation.json'), 'utf8')) as { planSummary: string; subtasks: GateSubtask[] };
  const agentRoles = {
    methodologist: { role: 'member', skills: [], tools: READ_ONLY },
    'data-scientist': { role: 'member', skills: [], tools: ALL },
    'academic-writer': { role: 'member', skills: [], tools: READ_ONLY },
    'peer-reviewer': { role: 'reviewer', skills: [], tools: READ_ONLY },
  };
  const reasons = checkPlanReadable({ planSummary: plan.planSummary, subtasks: plan.subtasks, agentIds: Object.keys(agentRoles), agentRoles });
  assert.deepEqual(reasons.filter((r) => /^\(vi\) S1\b/.test(r)), []);
});

for (const t of ['không cần chạy lệnh', 'Không chạy test.', 'chưa được phép chạy script', 'không tự chạy lại lệnh']) {
  test(`D25 ca âm: needsCommand("${t}") = false (câu phủ định)`, () => {
    assert.equal(needsCommand(t), false);
  });
}

for (const t of ['Chạy lệnh kiểm tra', 'chạy lại test', 'Không chỉ đọc mà phải chạy lệnh', 'không sửa mã; chạy `npm test`', 'Không chạy lệnh nào ngoài đọc tệp, rồi chạy test']) {
  test(`D25 ca dương: needsCommand("${t}") = true (vẫn đòi chạy lệnh)`, () => {
    assert.equal(needsCommand(t), true);
  });
}

test('D25: câu phủ định xuống dòng không lan sang dòng sau', () => {
  assert.equal(needsCommand('Không\nchạy lệnh'), true);
});

test('D25: NEEDS_CMD_RE vẫn export, source không đổi', () => {
  const src = NEEDS_CMD_RE.source;
  for (const part of ['chạy', 'lại', 'các', 'lệnh|test|build|typecheck|lint|migration|script|benchmark|đo|']) assert.ok(src.includes(part), part);
  assert.equal(NEEDS_CMD_RE.flags, 'iu');
});
