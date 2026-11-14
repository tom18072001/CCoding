import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { briefItems, planGate, type GateSubtask } from '../src/plan-gate.js';

const st = (id: string, over: Partial<GateSubtask> = {}): GateSubtask => ({ id, title: `Việc ${id}`, description: `Mô tả ${id}`, assignee: 'backend-dev', deliverable: 'Báo cáo', ...over });

// --- D18a K1: thân hạng mục cắt đúng; nhiều vai; đề bài thật + kế hoạch thật ---
const readBrief = (n: string): string => fs.readFileSync(path.join('docs', 'research', `BRIEF-${n}.md`), 'utf8');
const readPlan = (n: string): GateSubtask[] => JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', `plan-brief${n}.json`), 'utf8')).subtasks;
const ROLES = {
  'peer-reviewer': { role: 'reviewer', skills: ['code-review'] },
  methodologist: { role: 'member', skills: [] },
  'data-scientist': { role: 'member', skills: [] },
  'academic-writer': { role: 'member', skills: [] },
};

test('brief-item K1: BRIEF-20 + kế hoạch thật bỏ K4 (peer-reviewer) → chặn K4, K4 không còn bị miễn', () => {
  const k4 = briefItems(readBrief('20')).find((x) => x.code === 'K4')!;
  assert.equal(k4.exempt, false);
  assert.equal(k4.role, 'peer-reviewer');
  const g = planGate({ brief: readBrief('20'), planSummary: '', subtasks: readPlan('20'), agentRoles: ROLES });
  assert.equal(g.rules.includes('brief-item'), true);
  assert.equal(g.reasons.some((r) => r.startsWith('brief-item: K4')), true);
});

test('brief-item K1: BRIEF-23 "K4 — academic-writer, peer-reviewer:" đọc đủ vai; kế hoạch không có peer-reviewer → chặn K4', () => {
  const k4 = briefItems(readBrief('23')).find((x) => x.code === 'K4')!;
  assert.deepEqual(k4.roles, ['academic-writer', 'peer-reviewer']);
  assert.equal(k4.role, 'peer-reviewer');
  assert.equal(k4.review, true);
  assert.equal(k4.exempt, false);
  const g = planGate({ brief: readBrief('23'), planSummary: '', subtasks: readPlan('23'), agentRoles: ROLES });
  assert.equal(g.reasons.some((r) => r.startsWith('brief-item: K4')), true);
});

test('brief-item K1: BRIEF-22 + kế hoạch dựng tay độc lập (có K7 đúng vai) → không chặn; bỏ K7 → chặn K7', () => {
  assert.equal(briefItems(readBrief('22')).find((x) => x.code === 'K7')!.exempt, false);
  const plan = readPlan('22');
  const ok = planGate({ brief: readBrief('22'), planSummary: '', subtasks: plan, agentRoles: ROLES });
  assert.equal(ok.rules.includes('brief-item'), false);
  const bad = planGate({ brief: readBrief('22'), planSummary: '', subtasks: plan.filter((x) => x.assignee !== 'peer-reviewer'), agentRoles: ROLES });
  assert.equal(bad.reasons.some((r) => r.startsWith('brief-item: K7')), true);
});

test('brief-item K1: mục "Không làm" thật ở cuối đề không tạo hạng mục ảo và không miễn hạng mục cuối', () => {
  const brief = '## Hạng mục\n\n**K1 — dev: a**\nchi tiết\n\n**K2 — peer-reviewer: review K1**\nchi tiết\n\n## Không làm\n\n- không làm gì cả\nChờ quyết định sau.\n';
  const it = briefItems(brief);
  assert.deepEqual(it.map((x) => x.code), ['K1', 'K2']);
  assert.equal(it[1].exempt, false);
  assert.equal(it[0].exempt, false);
});

test('brief-item K1: "Không làm" dưới tiêu đề kế tiếp (mọi cấp) không miễn hạng mục trước đó', () => {
  for (const h of ['#', '###', '######']) {
    const it = briefItems(`K1 — a\nnội dung\n${h} Không làm\nviệc khác`);
    assert.equal(it[0].exempt, false, h);
  }
});

// --- D18a FX15: người nhận ngoài roster; hạng mục cần lệnh giao cho agent chỉ đọc ---
const TOOLS = {
  'backend-dev': { role: 'member', skills: [], tools: ['read_file', 'write_file', 'run_command'] },
  'doc-writer': { role: 'member', skills: [], tools: ['read_file', 'write_file'] },
};

test('FX15: người nhận ngoài roster (assigneeUnmatched) → cổng B báo (v), không đổi lặng lẽ', () => {
  const g = planGate({ brief: 'việc', planSummary: '', subtasks: [st('S1', { assigneeUnmatched: 'ghost-agent' })] });
  assert.equal(g.blocked, true);
  assert.equal(g.rules.includes('B'), true);
  assert.equal(g.reasons.some((r) => /\(v\) S1.*ghost-agent.*roster/.test(r)), true);
});

test('FX15: hạng mục cần chạy lệnh giao agent không có run_command → cổng B báo (vi); agent có run_command thì đạt', () => {
  const need = { title: 'Chạy test', description: 'Chạy `npm test` và báo kết quả' };
  const bad = planGate({ brief: 'việc', planSummary: '', subtasks: [st('S1', { ...need, assignee: 'doc-writer' })], agentRoles: TOOLS });
  assert.equal(bad.rules.includes('B'), true);
  assert.equal(bad.reasons.some((r) => /\(vi\) S1.*doc-writer.*chạy lệnh/.test(r)), true);
  const ok = planGate({ brief: 'việc', planSummary: '', subtasks: [st('S1', { ...need, assignee: 'backend-dev' })], agentRoles: TOOLS });
  assert.equal(ok.blocked, false);
  const docOnly = planGate({ brief: 'việc', planSummary: '', subtasks: [st('S1', { title: 'Viết tài liệu', description: 'Mô tả luồng', assignee: 'doc-writer' })], agentRoles: TOOLS });
  assert.equal(docOnly.blocked, false);
});
