import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { Registry } from '../src/registry.js';
import { MAX_SUBTASKS } from '../src/planner.js';
import { planPrompt } from '../src/prompts.js';

function build(lane?: 'fast') {
  const r = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
  const ctx = { task: { id: 'T-x', brief: 'b', lane } as never, dept: r.department('dev'), cwd: '/w', roster: r.members('dev'), lane } as never;
  return planPrompt(ctx, undefined, []).prompt;
}

test('lời nhắc plan: số hạng mục tối đa lấy từ MAX_SUBTASKS, không ghi cứng 1–7', () => {
  const p = build();
  assert.ok(p.includes(`1–${MAX_SUBTASKS} hạng mục`));
  assert.ok(!p.includes('1–7'));
});

test('lời nhắc plan: có ngoại lệ reviewer ở cả hai làn và trần nhất quán', () => {
  for (const lane of [undefined, 'fast' as const]) {
    const p = build(lane);
    assert.match(p, /NGOẠI LỆ: nếu đề bài giao một hạng mục có mã riêng cho vai reviewer/);
  }
  assert.ok(build('fast').includes(`Số hạng mục tối đa là ${MAX_SUBTASKS} cho mọi làn`));
});

// ---- K2: mã hạng mục + vai bắt buộc trong lời nhắc; lý do nguyên văn; attention plan-brief-items ----
import fs from 'node:fs';
import { replanPrompt } from '../src/prompts.js';
import { briefItems, planGate, planStopAttention, type GateSubtask } from '../src/plan-gate.js';

const K_BRIEF = '# Đề\n\n**K1 — backend-dev: sửa cổng**\nsrc/a.ts\n\n**K2 — data-scientist: số liệu**\nlàm\n\n**K5 — qa-tester: review K1–K4**\nrà\n';

function buildWith(brief: string, lane?: 'fast') {
  const r = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
  const ctx = { task: { id: 'T-x', brief, lane } as never, dept: r.department('dev'), cwd: '/w', roster: r.members('dev'), lane } as never;
  return planPrompt(ctx, undefined, []).prompt;
}

test('K2: lời nhắc lập kế hoạch của cả hai làn liệt kê mã, vai và yêu cầu ghi mã ở đầu tiêu đề', () => {
  for (const lane of [undefined, 'fast' as const]) {
    const p = buildWith(K_BRIEF, lane);
    assert.match(p, /- K1 \(vai backend-dev\)/);
    assert.match(p, /- K2 \(vai data-scientist\)/);
    assert.match(p, /- K5 \(vai qa-tester\) — REVIEW/);
    assert.match(p, /ĐÚNG Ở ĐẦU `title`/);
  }
  assert.ok(!buildWith('không có mã nào').includes('hạng mục đánh mã'));
});

test('K2: briefItems vẫn nhận dòng **K2 — data-scientist: …**', () => {
  const it = briefItems('**K2 — data-scientist: phân tích**\nthân').find((i) => i.code === 'K2');
  assert.equal(it?.role, 'data-scientist');
});

const b22 = fs.readFileSync(path.join('docs', 'research', 'BRIEF-22b.md'), 'utf8');
const plan22: GateSubtask[] = JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'brief-item', 'plan-brief22b-first.json'), 'utf8')).subtasks;

test('K2: replanPrompt đưa nguyên văn lý do brief-item và nhắc mã thiếu', () => {
  const g = planGate({ brief: b22, planSummary: '', subtasks: plan22 });
  assert.ok(g.rules.includes('brief-item'));
  const r = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
  const ctx = { task: { id: 'T-x', brief: b22 } as never, dept: r.department('research'), cwd: '/w', roster: r.members('research') } as never;
  const p = replanPrompt(ctx, b22, '', [], g, []).prompt;
  for (const reason of g.reasons) assert.ok(p.includes(reason), `thiếu nguyên văn: ${reason}`);
  assert.match(p, /ĐÚNG Ở ĐẦU `title`/);
  assert.match(p, /K1/);
});

test('K2: attention của ca brief-item là plan-brief-items, detail nêu mã và không rỗng', () => {
  const g = planGate({ brief: b22, planSummary: '', subtasks: plan22 });
  const a = planStopAttention('Nghiên cứu', g);
  assert.equal(a.reason, 'plan-brief-items');
  assert.match(a.detail, /thiếu hạng mục đề bài: K1/);
  assert.match(a.detail, /K2/);
  assert.ok(!/đọc dở:\s*—/.test(a.detail));
});

test('K2: attention không bao giờ có lý do rỗng; chỉ B → plan-unreadable kèm lý do B; A → plan-coverage', () => {
  const b = planStopAttention('Dev', { rules: ['B'], uncovered: [], reasons: ['B (iv) cụt'] });
  assert.equal(b.reason, 'plan-unreadable');
  assert.match(b.detail, /B \(iv\) cụt/);
  const empty = planStopAttention('Dev', { rules: ['B'], uncovered: [], reasons: [] });
  assert.match(empty.detail, /không rõ lý do/);
  assert.equal(planStopAttention('Dev', { rules: ['A', 'brief-item'], uncovered: ['x.ts'], reasons: ['brief-item: K1: thiếu'] }).reason, 'plan-coverage');
});
