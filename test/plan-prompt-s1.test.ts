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
