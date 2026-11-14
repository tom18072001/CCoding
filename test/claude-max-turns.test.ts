// B-07 (D-01): --max-turns cho runtime claude-cli theo phases.toolTurns, sau công tắc runtimes.claude-cli.maxTurns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs, ClaudeStreamParser } from '../src/runtimes/claude-cli.js';
import type { RunRequest } from '../src/types.js';

function req(phase: string, maxTurns: number, allowTools = true): RunRequest {
  return {
    phase, model: 'sonnet', cwd: 'C:/tmp/x', tools: allowTools ? ['Read', 'Grep'] : [], allowTools, timeoutMs: 1000, system: 's', prompt: 'p',
    toolPolicy: { root: 'C:/tmp/x', allow: [], maxTurns, commandTimeoutSec: 10, maxOutputChars: 1000 },
    meta: { taskId: 't', department: 'dev', callId: 'c' },
  } as unknown as RunRequest;
}
const val = (args: string[]) => { const i = args.indexOf('--max-turns'); return i < 0 ? undefined : args[i + 1]; };

test('B-07: mặc định bật → --max-turns đúng giá trị theo pha', () => {
  for (const [phase, n] of [['plan', 8], ['execute', 40], ['review', 10]] as const) {
    assert.equal(val(buildClaudeArgs({}, req(phase, n), 'm').args), String(n), phase);
  }
});

test('B-07: tắt (maxTurns=false) → không có cờ, args y hệt bản không có công tắc', () => {
  const r = req('execute', 40);
  const off = buildClaudeArgs({ maxTurns: false }, r, 'm').args;
  assert.equal(val(off), undefined);
  const on = buildClaudeArgs({}, r, 'm').args;
  const i = on.indexOf('--max-turns');
  assert.deepEqual([...on.slice(0, i), ...on.slice(i + 2)], off);
});

test('B-07: không công cụ hoặc trần không hợp lệ → không có cờ', () => {
  assert.equal(val(buildClaudeArgs({}, req('plan', 8, false), 'm').args), undefined);
  assert.equal(val(buildClaudeArgs({}, req('plan', 0), 'm').args), undefined);
});

test('B-07: result error_max_turns không phải lỗi, ghi subtype để run() báo capped', () => {
  const p = new ClaudeStreamParser();
  p.feed(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } }));
  assert.equal(p.subtype, 'error_max_turns');
  assert.equal(p.isError, false);
  const q = new ClaudeStreamParser();
  q.feed(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'hỏng' }));
  assert.equal(q.isError, true);
});
