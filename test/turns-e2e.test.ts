import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunRequest, RunResult } from '../src/types.js';
import { testApp } from './helpers.js';

// D26/K2: `turns` đi từ runtime → Orchestrator.call() → calls.jsonl. Runtime là giả (mock), không gọi claude -p.

type App = ReturnType<typeof testApp>;
const BRIEF = 'Viết tài liệu API nhỏ cho dịch vụ thanh toán';

/** Ở pha execute, bọc kết quả mock: `turns` = số vòng giả; undefined ⇒ xóa khóa turns. */
function withTurns(a: App, turns: number | undefined) {
  const mock = a.runtimes.get('mock')!;
  const orig = mock.run.bind(mock);
  mock.run = async (req: RunRequest, hooks) => {
    const res: RunResult = await orig(req, hooks);
    if (req.phase !== 'execute') return res;
    const { turns: _drop, ...rest } = res;
    return turns === undefined ? (rest as RunResult) : { ...rest, turns };
  };
}

async function execRecords(a: App, turns: number | undefined) {
  withTurns(a, turns);
  const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
  await a.orchestrator.waitFor(t.id);
  const recs = a.usage.all({ task: t.id }).filter((r) => r.phase === 'execute');
  assert.ok(recs.length >= 1, 'có bản ghi execute');
  return recs as unknown as Array<Record<string, unknown>>;
}

test('runtime trả turns: 3 ⇒ calls.jsonl có turns === 3', async () => {
  const a = testApp();
  try {
    const recs = await execRecords(a, 3);
    assert.ok(recs.every((r) => r.turns === 3), JSON.stringify(recs.map((r) => r.turns)));
  } finally {
    a.cleanup();
  }
});

test('runtime không trả turns ⇒ bản ghi không có khóa turns', async () => {
  const a = testApp();
  try {
    const recs = await execRecords(a, undefined);
    assert.ok(recs.every((r) => !('turns' in r)), JSON.stringify(recs.map((r) => r.turns)));
  } finally {
    a.cleanup();
  }
});
