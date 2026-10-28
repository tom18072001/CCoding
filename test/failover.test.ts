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
  const seen: Array<{ model: string; tools: boolean; names: string[]; toolMsgs: number }> = [];
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-quota' }, { id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    seen.push({ model: body.model, tools: !!body.tools, names: (body.tools ?? []).map((t: { function: { name: string } }) => t.function.name), toolMsgs });
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
    // công cụ chỉ cấp cho nhiệm vụ thuộc dự án có workspace thật
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-fo-ws-'));
    app.store.saveProject({ id: 'demo', name: 'Demo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'Viết API Node.js nhỏ và tài liệu', projectId: 'demo', options: { discussionRounds: 0, review: false, maxParallel: 1 } });
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
    // nhiệm vụ không thuộc dự án: thư mục làm việc riêng với quyền đọc/ghi (lưu sản phẩm thành tệp, kiểm kê) — KHÔNG chạy lệnh; + công cụ tra cứu
    const before = gw.seen.length;
    const t2 = app.orchestrator.submit({ brief: 'Viết đề cương ngắn', mode: 'department', department: 'research', options: { discussionRounds: 0, review: false } });
    const d2 = await app.orchestrator.waitFor(t2.id);
    assert.equal(d2.status, 'done');
    const allowed = ['list_files', 'read_file', 'search', 'write_file', 'edit_file', 'search_papers', 'web_search', 'fetch_url'];
    assert.ok(gw.seen.slice(before).every((x) => x.names.every((n) => allowed.includes(n))), 'không có run_command');
    assert.ok(gw.seen.slice(before).some((x) => x.names.includes('search_papers')), 'phòng nghiên cứu có công cụ tra cứu');
    assert.ok(gw.seen.slice(before).some((x) => x.names.includes('write_file')), 'được ghi tệp vào thư mục riêng');
    assert.ok(d2.workspace && !d2.branch);
    assert.equal(fs.readFileSync(path.join(d2.workspace!, 'tu-agent.txt'), 'utf8'), 'xin chào từ agent');
    const final2 = app.store.readRunFile(t2.id, 'FINAL.md') ?? '';
    assert.match(final2, /Tệp trong thư mục làm việc của nhiệm vụ[\s\S]*tu-agent\.txt/);
    fs.rmSync(ws, { recursive: true, force: true });
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('vòng lặp công cụ dừng khi chạm trần token đầu vào và buộc viết câu trả lời cuối', async () => {
  let calls = 0;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const last = body.messages[body.messages.length - 1];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (last.role === 'user' && String(last.content).includes('KHÔNG gọi thêm công cụ')) {
      send({ choices: [{ delta: { content: '## Tóm tắt\nKết thúc theo yêu cầu.' }, finish_reason: 'stop' }] });
    } else {
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${calls}`, function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    }
    send({ choices: [], usage: { prompt_tokens: 60000, completion_tokens: 10 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-cap-'));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'cap');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'review', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['list_files'], maxTurns: 20, maxInputTokens: 100000, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.equal(r.text, '## Tóm tắt\nKết thúc theo yêu cầu.');
    assert.equal(calls, 3, '2 lượt công cụ (120k ≥ 100k) rồi 1 lượt viết câu trả lời cuối');
    assert.match(r.diag ?? '', /chạm trần 100000 token/);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('trần token vòng công cụ: phần đọc từ cache tính theo trọng số; cache ghi không bị đếm hai lần', async () => {
  let calls = 0;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const last = body.messages[body.messages.length - 1];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (last.role === 'user' && String(last.content).includes('KHÔNG gọi thêm công cụ')) send({ choices: [{ delta: { content: '## Tóm tắt\nXong.' }, finish_reason: 'stop' }] });
    else send({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${calls}`, function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    // kiểu Bifrost → Claude: prompt_tokens gồm cả phần đọc và ghi cache
    send({ choices: [], usage: { prompt_tokens: 60000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 55000, cache_write_tokens: 4000 } } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-capc-'));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'capc');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'review', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['list_files'], maxTurns: 20, maxInputTokens: 100000, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    // mỗi lượt tính 5.000 + 55.000 × 0,1 = 10.500 → 10 lượt mới chạm 100k (không trọng số: 2 lượt)
    assert.equal(calls, 11, '10 lượt công cụ rồi 1 lượt viết câu trả lời cuối');
    assert.equal(r.capped, 'input');
    assert.deepEqual([r.usage.input, r.usage.cacheRead, r.usage.cacheWrite], [11 * 1000, 11 * 55000, 11 * 4000], 'input không gồm phần đọc/ghi cache');
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('429 giữa vòng công cụ: chờ ngắn rồi thử lại chính lượt đó, giữ ngữ cảnh (không bỏ vòng lặp)', async () => {
  let calls = 0;
  let limited = 0;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const tools = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    if (tools === 1 && limited === 0) {
      limited++;
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      return res.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'rate limited' } }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (tools === 0) send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    else send({ choices: [{ delta: { content: `## Tóm tắt\nXong sau ${tools} kết quả công cụ.` }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 5 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-rw-'));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', rateWaitMs: 10_000 }, {}, 'rw');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'execute', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 20000,
        toolPolicy: { root, allow: ['list_files'], maxTurns: 10, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.equal(r.text, '## Tóm tắt\nXong sau 1 kết quả công cụ.', 'lượt thử lại vẫn có lịch sử công cụ');
    assert.equal(calls, 3);
    assert.match(r.diag ?? '', /giới hạn tốc độ — chờ \d+ giây rồi thử lại/);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
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

test('mất kết nối giữa vòng lặp công cụ: thử lại lượt đó; vẫn lỗi thì giữ token đã tiêu trong lỗi (partial)', async () => {
  let n = 0;
  let dropTimes = 1;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    n++;
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    if (toolMsgs > 0 && dropTimes > 0) {
      dropTimes--;
      res.destroy(); // mất kết nối
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (toolMsgs === 0) send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    else send({ choices: [{ delta: { content: '## Tóm tắt\nXong.' }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 50 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-drop-'));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { RuntimeError } = await import('../src/runtimes/errors.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'drop');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const req = {
      agent, phase: 'execute' as const, system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
      toolPolicy: { root, allow: ['list_files' as const], maxTurns: 5, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false },
      meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
    };
    const ok = await rt.run(req, {});
    assert.equal(ok.text, '## Tóm tắt\nXong.', 'thử lại lượt bị rớt rồi xong');
    assert.match(ok.diag ?? '', /đã thử lại/);
    dropTimes = 2; // rớt cả lần thử lại
    await assert.rejects(
      () => rt.run(req, {}),
      (e: unknown) => e instanceof RuntimeError && e.kind === 'transient' && e.partial?.input === 1000 && e.partial.toolCalls?.length === 1,
    );
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('model "báo đã tạo tệp" mà chưa gọi công cụ ghi → nhắc một lần rồi ghi thật; extraBody theo pha', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    bodies.push(body);
    const last = body.messages[body.messages.length - 1];
    const tools = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (tools === 0 && !String(last.content).includes('CHƯA gọi write_file')) send({ choices: [{ delta: { content: '## Tóm tắt\nĐã tạo tệp `ghi-chu.md` gồm 3 quy ước.' }, finish_reason: 'stop' }] });
    else if (tools === 0) send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w1', function: { name: 'write_file', arguments: JSON.stringify({ path: 'ghi-chu.md', content: '# Quy ước\n' }) } }] }, finish_reason: 'tool_calls' }] });
    else send({ choices: [{ delta: { content: '## Tóm tắt\nĐã ghi `ghi-chu.md`.' }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 5 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-claim-'));
  try {
    const { OpenAiApiRuntime, claimsWrites } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', extraBody: { reasoning_effort: 'none' }, extraBodyByPhase: { execute: {} } }, {}, 'claim');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'execute', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['write_file'], maxTurns: 10, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false, expectWrites: true },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.ok(fs.existsSync(path.join(root, 'ghi-chu.md')), 'đã ghi thật sau lời nhắc');
    assert.match(r.diag ?? '', /báo đã tạo\/sửa tệp nhưng chưa gọi công cụ ghi/);
    assert.equal(bodies[0].reasoning_effort, undefined, 'pha execute dùng extraBodyByPhase.execute (rỗng) thay extraBody');
    assert.equal(claimsWrites('Đã hoàn thành việc viết tệp `quy-uoc-nhanh.md`'), true);
    assert.equal(claimsWrites('## Tóm tắt\nPhân tích xong, không cần tệp.'), false);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('model chỉ "suy nghĩ" mà không trả lời → nhắc một lần, lấy câu trả lời ở lượt sau', async () => {
  let calls = 0;
  const srv = http.createServer(async (req, res) => {
    for await (const _ of req) void _;
    calls++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (calls === 1) send({ choices: [{ delta: { reasoning: 'Mình cần lập kế hoạch JSON với một hạng mục…' }, finish_reason: 'stop' }] });
    else send({ choices: [{ delta: { content: '## Tóm tắt\nKế hoạch xong.' }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 5 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'think');
    const agent = parseAgent('a.md', '---\nid: dev-lead\nname: Lead\ndepartment: dev\nrole: lead\n---\nbody');
    const r = await rt.run({ agent, phase: 'plan', system: 's', prompt: 'p', model: 'm', cwd: '.', tools: [], allowTools: false, timeoutMs: 10000, meta: { taskId: 'T-x', department: 'dev', callId: 'c1' } }, {});
    assert.equal(r.text, '## Tóm tắt\nKế hoạch xong.');
    assert.equal(calls, 2);
    assert.match(r.diag ?? '', /chỉ có phần suy nghĩ/);
  } finally {
    srv.close();
  }
});

test('ngân sách ngữ cảnh vòng công cụ: toolContextTokens/contextWindow, rút gọn kết quả cũ, cắt kết quả quá lớn', async () => {
  const { fitContext, toolContextBudget, historyChars } = await import('../src/runtimes/api.js');
  assert.equal(toolContextBudget({}, 8000), 0, 'không đặt → giữ cách rút gọn theo đợt (cache)');
  assert.equal(toolContextBudget({ contextWindow: 32768 }, 8000), 32768 - 8000 - 1024);
  assert.equal(toolContextBudget({ contextWindow: 32768, toolContextTokens: 20000 }, 8000), 20000);
  const msgs: any[] = [
    { role: 'system', content: 's'.repeat(1000) },
    { role: 'user', content: 'u'.repeat(1000) },
  ];
  for (let i = 0; i < 4; i++) {
    msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read_file', arguments: `{"path":"f${i}"}` } }] });
    msgs.push({ role: 'tool', tool_call_id: `c${i}`, content: String(i).repeat(5000) });
  }
  assert.equal(fitContext(msgs, 100_000), null, 'dưới ngân sách thì không đụng');
  const r = fitContext(msgs, 12_000)!;
  assert.ok(historyChars(msgs) <= 12_000, `còn ${historyChars(msgs)} ký tự`);
  assert.equal(r.over, false);
  assert.equal(msgs.at(-1).content, '3'.repeat(5000), 'kết quả mới nhất giữ nguyên');
  assert.match(msgs[3].content, /đã lược bớt/);
  // kết quả mới nhất quá lớn → bị cắt để vừa, kèm ghi chú đọc đoạn nhỏ hơn
  msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: 'big', type: 'function', function: { name: 'read_file', arguments: '{"path":"big"}' } }] });
  msgs.push({ role: 'tool', tool_call_id: 'big', content: 'b'.repeat(30_000) });
  fitContext(msgs, 12_000);
  assert.ok(historyChars(msgs) <= 12_100);
  assert.match(msgs.at(-1).content, /cắt để vừa ngữ cảnh model/);

  // vòng lặp thật: mỗi lượt đọc một tệp 6.000 ký tự; model báo prompt_tokens = ký tự / 2,5
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-ctx-'));
  for (let i = 0; i < 8; i++) fs.writeFileSync(path.join(root, `f${i}.txt`), `${'dòng dữ liệu mẫu '.repeat(20)}\n`.repeat(18));
  const sizes: number[] = [];
  let calls = 0;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const chars = body.messages.reduce((n: number, m: any) => n + (typeof m.content === 'string' ? m.content.length : 0) + (m.tool_calls ?? []).reduce((k: number, tc: any) => k + tc.function.arguments.length + 40, 0), 0);
    sizes.push(chars);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (calls <= 8) send({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${calls}`, function: { name: 'read_file', arguments: JSON.stringify({ path: `f${calls - 1}.txt` }) } }] }, finish_reason: 'tool_calls' }] });
    else send({ choices: [{ delta: { content: '## Tóm tắt\nXong.' }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: Math.round(chars / 2.5), completion_tokens: 10 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', toolContextTokens: 6000 }, {}, 'ctx');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'execute', system: 's'.repeat(2000), prompt: 'p'.repeat(2000), model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['read_file'], maxTurns: 20, maxInputTokens: 10_000_000, commandTimeoutSec: 10, maxOutputChars: 30000, denyCommands: [], allowGitCommit: false },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.equal(r.text, '## Tóm tắt\nXong.');
    assert.equal(calls, 9);
    // ngân sách 6.000 token × 2,5 ký tự/token = 15.000 ký tự (+ tối đa một kết quả công cụ mới của lượt cuối)
    assert.ok(Math.max(...sizes) <= 15_000 + 200, `lượt lớn nhất ${Math.max(...sizes)} ký tự`);
    assert.match(r.diag ?? '', /ngữ cảnh vượt 6000 token/);
    // không đặt ngân sách: lịch sử lớn dần tới ngưỡng rút gọn theo đợt (40.000 ký tự)
    sizes.length = 0;
    calls = 0;
    const rt2 = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'ctx2');
    await rt2.run(
      {
        agent, phase: 'execute', system: 's'.repeat(2000), prompt: 'p'.repeat(2000), model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['read_file'], maxTurns: 20, maxInputTokens: 10_000_000, commandTimeoutSec: 10, maxOutputChars: 30000, denyCommands: [], allowGitCommit: false },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c2' },
      },
      {},
    );
    assert.ok(Math.max(...sizes) > 30_000, `không ngân sách: lượt lớn nhất ${Math.max(...sizes)}`);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('khảo sát mãi không ghi: đọc liên tiếp N lần → nhắc; 2N lần → từ chối đọc tới khi ghi tệp', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-streak-'));
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(root, `f${i}.txt`), `nội dung ${i}\n`);
  let calls = 0;
  const seenTool: string[] = [];
  const nudges: string[] = [];
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const lastTool = [...body.messages].reverse().find((m: any) => m.role === 'tool');
    if (lastTool) seenTool.push(String(lastTool.content).slice(0, 160));
    for (const m of body.messages) if (m.role === 'user' && String(m.content).includes('liên tiếp mà chưa ghi') && !nudges.includes(m.content)) nudges.push(m.content);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const call = (name: string, args: unknown) => send({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${calls}`, function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
    if (calls <= 6) call('read_file', { path: `f${calls - 1}.txt` }); // 6 lần đọc khác nhau (N = 3 → chặn từ lần thứ 7)
    else if (calls === 7) call('read_file', { path: 'f9.txt' }); // bị từ chối
    else if (calls === 8) call('write_file', { path: 'out.md', content: 'bản nháp' });
    else if (calls === 9) call('read_file', { path: 'f10.txt' }); // ghi xong → đọc lại được
    else send({ choices: [{ delta: { content: '## Tóm tắt\nXong.' }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 10 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'streak');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'execute', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['read_file', 'write_file'], maxTurns: 30, maxInputTokens: 10_000_000, commandTimeoutSec: 10, maxOutputChars: 30000, denyCommands: [], allowGitCommit: false, expectWrites: true, readsBeforeWrite: 3 },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.equal(r.text, '## Tóm tắt\nXong.');
    assert.equal(nudges.length, 1, 'nhắc một lần ở lần đọc thứ 3');
    assert.match(seenTool[6], /^⛔ Từ chối: đã đọc\/tìm 6 lần/);
    assert.ok(fs.existsSync(path.join(root, 'out.md')));
    assert.match(seenTool[8], /nội dung 10/, 'sau khi ghi thì đọc tiếp được');
    assert.equal(r.toolCalls?.filter((x) => !x.ok).length, 1);
    assert.match(r.diag ?? '', /từ chối 1 lần đọc/);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
