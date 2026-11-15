// K2 (D24): runtime claude-cli đọc num_turns của sự kiện result → RunResult.turns. Tiến trình giả, không gọi claude -p thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeCliRuntime, ClaudeStreamParser } from '../src/runtimes/claude-cli.js';
import type { AgentDef, RunRequest } from '../src/types.js';

function parse(events: unknown[]): ClaudeStreamParser {
  const p = new ClaudeStreamParser();
  for (const e of events) p.feed(JSON.stringify(e));
  return p;
}

test('parser: result success có num_turns → numTurns', () => {
  assert.equal(parse([{ type: 'result', subtype: 'success', result: 'ok', num_turns: 5 }]).numTurns, 5);
});

test('parser: result error_max_turns có num_turns → numTurns, không phải lỗi', () => {
  const p = parse([{ type: 'result', subtype: 'error_max_turns', is_error: false, num_turns: 7 }]);
  assert.equal(p.numTurns, 7);
  assert.equal(p.isError, false);
});

test('parser: thiếu hoặc không phải số → numTurns vắng', () => {
  assert.equal(parse([{ type: 'result', subtype: 'success', result: 'ok' }]).numTurns, undefined);
  assert.equal(parse([{ type: 'result', subtype: 'success', result: 'ok', num_turns: '5' }]).numTurns, undefined);
  assert.equal(parse([{ type: 'result', subtype: 'success', result: 'ok', num_turns: null }]).numTurns, undefined);
});

function fakeBin(dir: string, events: unknown[]): string {
  const js = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(js, `process.stdin.on('data',()=>{});process.stdin.on('end',()=>{for(const e of ${JSON.stringify(events)})console.log(JSON.stringify(e));});\n`);
  const win = process.platform === 'win32';
  const bin = path.join(dir, win ? 'fake-claude.cmd' : 'fake-claude');
  fs.writeFileSync(bin, win ? `@echo off\r\nnode "${js}"\r\n` : `#!/bin/sh\nexec node "${js}"\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}
const req = (dir: string): RunRequest => ({ agent: { id: 'backend-dev' } as AgentDef, phase: 'execute', system: 's', prompt: 'p', model: 'sonnet', cwd: dir, tools: [], allowTools: false, timeoutMs: 20_000, meta: { taskId: 't', department: 'dev', callId: 'c' } });

async function runWith(events: unknown[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-num-turns-'));
  try {
    const rt = new ClaudeCliRuntime({ command: fakeBin(dir, events) } as never, {});
    return await rt.run(req(dir), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('run(): kết thúc bình thường → turns đúng', async () => {
  const r = await runWith([{ type: 'result', subtype: 'success', result: 'ok', num_turns: 4, usage: { input_tokens: 1, output_tokens: 1 } }]);
  assert.equal(r.turns, 4);
  assert.equal(r.capped, undefined);
});

test('run(): error_max_turns → turns đúng và capped = turns', async () => {
  const r = await runWith([{ type: 'result', subtype: 'error_max_turns', is_error: false, result: 'x', num_turns: 6, usage: { input_tokens: 1, output_tokens: 1 } }]);
  assert.equal(r.turns, 6);
  assert.equal(r.capped, 'turns');
});

test('run(): không có num_turns → không có khóa turns', async () => {
  const r = await runWith([{ type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }]);
  assert.equal('turns' in r, false);
});
