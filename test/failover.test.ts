import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { readJsonl } from '../src/util/fsx.js';

/** Gateway giả tương thích OpenAI: model "m-quota" luôn báo hết hạn mức, "m-ok" trả lời + gọi công cụ ghi file khi thực thi. */
async function fakeGateway() {
  const seen: Array<{ model: string; tools: boolean; toolMsgs: number }> = [];
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-quota' }, { id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    seen.push({ model: body.model, tools: !!body.tools, toolMsgs });
    if (body.model === 'm-quota') {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '900' });
      return res.end(JSON.stringify({ error: { message: 'Claude AI usage limit reached' } }));
    }
    const user = String(body.messages.filter((m: { role: string }) => m.role === 'user').map((m: { content: string }) => m.content).join('\n'));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (body.tools && toolMsgs === 0 && user.includes('## Hạng mục của bạn')) {
      send({ model: 'm-ok', choices: [{ delta: { content: 'Tôi sẽ tạo file.' } }] });
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'write_file', arguments: '' } }] } }] });
      send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ path: 'tu-agent.txt', content: 'xin chào từ agent' }) } }] }, finish_reason: 'tool_calls' }] });
      send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 40 } });
    } else {
      send({ model: 'm-ok', choices: [{ delta: { content: '## Tóm tắt\nĐã xong phần việc, file tu-agent.txt đã tạo.' } }] });
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
      send({ choices: [], usage: { prompt_tokens: 200, completion_tokens: 20 } });
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

test('hết hạn mức → tự chuyển sang model kế tiếp trong chuỗi, cảnh báo, agent dùng công cụ ghi file thật', async () => {
  const gw = await fakeGateway();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-fo-'));
  const base = loadConfig();
  const chain = ['m-quota', 'm-ok'];
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: gw.url, tags: 'none', local: false } },
    models: { fake: { opus: chain, sonnet: chain, haiku: chain } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    const t = app.orchestrator.submit({ brief: 'Viết API Node.js nhỏ và tài liệu', mode: 'department', department: 'dev', options: { discussionRounds: 0, review: false, maxParallel: 1 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error ?? done.pause?.detail);
    // chỉ thử model hết hạn mức một lần, sau đó bị "nghỉ" và bỏ qua
    assert.equal(gw.seen.filter((s) => s.model === 'm-quota').length, 1);
    const h = app.runtimes.health.get('fake::m-quota');
    assert.ok(h?.until && h.until > Date.now() + 10 * 60_000, 'tạm ngừng theo retry-after');
    assert.ok(app.usage.all({ task: t.id }).every((r) => r.runtime === 'fake' && r.requestedModel === 'm-ok'));
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'runtime.quota'));
    // công cụ: agent ghi file thật trong workspace của nhiệm vụ
    assert.ok(done.workspace);
    assert.equal(fs.readFileSync(path.join(done.workspace!, 'tu-agent.txt'), 'utf8'), 'xin chào từ agent');
    assert.ok(gw.seen.some((s) => s.toolMsgs > 0), 'kết quả công cụ được gửi lại cho model');
    const logs = app.logs.query({ task: t.id, limit: 2000 });
    assert.ok(logs.some((e) => e.kind === 'tool.call' && e.msg.includes('write_file')));
    assert.ok(logs.some((e) => e.kind === 'runtime.failover'));
    const calls = readJsonl<{ attempts: Array<{ kind: string }>; text: string; tools?: unknown[] }>(app.store.callsFile(t.id));
    assert.ok(calls.length >= 3);
    assert.equal(calls[0].attempts[0].kind, 'quota');
    assert.ok(calls.some((c) => c.tools?.length));
    assert.ok(fs.existsSync(path.join(done.workspace!, '.ccoding', '.gitignore')));
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('mọi tài nguyên hết hạn mức → tạm dừng nhiệm vụ (không rơi về mock) và hẹn tự tiếp tục', async () => {
  const gw = await fakeGateway();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-fo2-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: gw.url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-quota'], sonnet: ['m-quota'], haiku: ['m-quota'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    const t = app.orchestrator.submit({ brief: 'Việc bất kỳ', mode: 'department', department: 'research' });
    const r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'paused');
    assert.equal(r.pause?.reason, 'quota');
    assert.ok(r.pause?.resumeAt && Date.parse(r.pause.resumeAt) > Date.now());
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'task.paused.quota'));
    assert.equal(app.usage.all({ task: t.id }).length, 0);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
