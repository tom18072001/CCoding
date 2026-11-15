import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeCliRuntime, ClaudeStreamParser, diagFlags, isUnexpectedApiKeySource, sanitizeAuthSource } from '../src/runtimes/claude-cli.js';
import type { AgentDef } from '../src/types.js';
import type { RunRequest, RunResult } from '../src/types.js';
import { testApp } from './helpers.js';

// K2: authSource của lượt claude-cli. Mọi chuỗi khóa trong test là mẫu giả; không gọi claude -p thật.
const FAKE_KEY = 'sk-ant-FAKE-TEST-0000';
const initLine = (src?: unknown) => JSON.stringify({ type: 'system', subtype: 'init', model: 'm', ...(src === undefined ? {} : { apiKeySource: src }) });

function parse(lines: string[]): ClaudeStreamParser {
  const p = new ClaudeStreamParser();
  for (const l of lines) p.feed(l);
  return p;
}

test('parser: init có apiKeySource → authSource', () => {
  assert.equal(parse([initLine('none')]).authSource, 'none');
  assert.equal(parse([initLine('ANTHROPIC_API_KEY')]).authSource, 'ANTHROPIC_API_KEY');
  assert.equal(parse([initLine('/login managed key')]).authSource, '/login managed key');
});

test('parser: không có init (hoặc init không có apiKeySource) → không lỗi, authSource vắng', () => {
  assert.equal(parse([JSON.stringify({ type: 'result', subtype: 'success', result: 'ok' })]).authSource, undefined);
  assert.equal(parse([initLine()]).authSource, undefined);
});

test('parser: nhãn dạng token/không hợp lệ → "unrecognized", không ghi chuỗi gốc', () => {
  assert.equal(parse([initLine(FAKE_KEY)]).authSource, 'unrecognized');
  assert.equal(parse([initLine('x'.repeat(41))]).authSource, 'unrecognized');
  assert.equal(parse([initLine('a;b$c')]).authSource, 'unrecognized');
  assert.equal(sanitizeAuthSource(123), undefined);
});

test('cảnh báo chỉ khi nhãn lạ/khóa API mà useApiKey tắt', () => {
  assert.equal(isUnexpectedApiKeySource('ANTHROPIC_API_KEY', false), true);
  assert.equal(isUnexpectedApiKeySource('ANTHROPIC_API_KEY', true), false);
  assert.equal(isUnexpectedApiKeySource('none', false), false);
  assert.equal(isUnexpectedApiKeySource('/login managed key', undefined), false);
  assert.equal(isUnexpectedApiKeySource(undefined, false), false);
});

test('diagFlags: chỉ có/không, tính trên env truyền vào', () => {
  assert.deepEqual(diagFlags({ CI: '1' }), { ci: true, disableNonessentialTraffic: false });
  assert.deepEqual(diagFlags({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }), { ci: false, disableNonessentialTraffic: true });
  assert.deepEqual(diagFlags({}), { ci: false, disableNonessentialTraffic: false });
});

// ---- runtime thật với tiến trình giả (kịch bản node) ----

function fakeBin(dir: string, events: unknown[]): string {
  const js = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(js, `process.stdin.on('data',()=>{});process.stdin.on('end',()=>{for(const e of ${JSON.stringify(events)})console.log(JSON.stringify(e));});\n`);
  // Windows chạy qua .cmd (spawn.ts dùng ComSpec); nơi khác dùng shebang sh
  const win = process.platform === 'win32';
  const bin = path.join(dir, win ? 'fake-claude.cmd' : 'fake-claude');
  fs.writeFileSync(bin, win ? `@echo off\r\nnode "${js}"\r\n` : `#!/bin/sh\nexec node "${js}"\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}
const req = (dir: string): RunRequest => ({ agent: { id: 'backend-dev' } as AgentDef, phase: 'execute', system: 's', prompt: 'p', model: 'sonnet', cwd: dir, tools: [], allowTools: false, timeoutMs: 20_000, meta: { taskId: 't', department: 'dev', callId: 'c' } });
const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-auth-src-'));

test('run(): init apiKeySource → RunResult.authSource; lỗi auth kèm authSource + cờ có/không, không lộ khóa', async () => {
  const dir = mkdir();
  const old = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  try {
    const ok = new ClaudeCliRuntime({ command: fakeBin(dir, [{ type: 'system', subtype: 'init', apiKeySource: 'none' }, { type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }]) } as never, {});
    const r1 = await ok.run(req(dir), {});
    assert.equal(r1.authSource, 'none');
    assert.equal(r1.error, undefined);

    const bad = new ClaudeCliRuntime({ command: fakeBin(dir, [{ type: 'system', subtype: 'init', apiKeySource: FAKE_KEY }, { type: 'result', subtype: 'error', is_error: true, result: 'Failed to authenticate. API Error: 403 Forbidden' }]) } as never, {});
    const r2 = await bad.run(req(dir), {});
    assert.equal(r2.authSource, 'unrecognized');
    assert.match(r2.error ?? '', /authSource=unrecognized; ci=có; disableNonessentialTraffic=không/, 'CI do scrubEnv tự đặt ⇒ có');
    assert.equal(JSON.stringify(r2).includes(FAKE_KEY), false, 'khóa giả không lọt vào kết quả/thông báo lỗi');
  } finally {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run(): không có init → authSource vắng, không lỗi', async () => {
  const dir = mkdir();
  try {
    const rt = new ClaudeCliRuntime({ command: fakeBin(dir, [{ type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }]) } as never, {});
    const r = await rt.run(req(dir), {});
    assert.equal(r.authSource, undefined);
    assert.equal(r.authSourceUnexpected, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- call(): bản ghi lượt gọi và sự kiện warn (runtime mock giả kết quả claude-cli) ----
function injectAuth(a: ReturnType<typeof testApp>, extra: Partial<RunResult>) {
  const mock = a.runtimes.get('mock')!;
  const origRun = mock.run.bind(mock);
  mock.run = async (rq, hooks) => ({ ...(await origRun(rq, hooks)), ...extra });
}

test('call(): authSource vào bản ghi lượt gọi; khóa API ngoài cấu hình → warn; không lộ khóa giả', async () => {
  const a = testApp();
  const old = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  try {
    injectAuth(a, { authSource: 'ANTHROPIC_API_KEY', authSourceUnexpected: true });
    const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    const recs = a.usage.all({ task: t.id });
    assert.ok(recs.length > 0 && recs.every((r) => r.authSource === 'ANTHROPIC_API_KEY'), 'bản ghi có authSource');
    const logs = a.logs.query({ task: t.id, limit: 5000 });
    const w = logs.filter((e) => e.kind === 'runtime.auth-source');
    assert.ok(w.length > 0 && w.every((e) => e.level === 'warn'), 'có sự kiện warn');
    assert.equal(JSON.stringify(logs).includes(FAKE_KEY) || JSON.stringify(recs).includes(FAKE_KEY), false);
  } finally {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = old;
    a.cleanup();
  }
});

test('call(): authSource=none → có bản ghi, không warn', async () => {
  const a = testApp();
  try {
    injectAuth(a, { authSource: 'none' });
    const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    assert.ok(a.usage.all({ task: t.id }).some((r) => r.authSource === 'none'));
    assert.equal(a.logs.query({ task: t.id, limit: 5000 }).some((e) => e.kind === 'runtime.auth-source'), false);
  } finally {
    a.cleanup();
  }
});
