import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { periodStart } from '../src/budgets.js';
import { testApp } from './helpers.js';

async function serve(app: ReturnType<typeof testApp>) {
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  app.config.server.port = port;
  srv.close();
  const srv2 = createServer(app);
  await new Promise<void>((r) => srv2.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  const json = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { srv: srv2, json };
}

test('UI-7 thuộc tính: sửa tiêu đề và ưu tiên, kiểm tra đầu vào, ghi nhật ký', async () => {
  const app = testApp();
  const { srv, json } = await serve(app);
  try {
    const t = app.orchestrator.submit({ brief: 'Viết hàm kiểm tra email hợp lệ kèm test', agentId: 'backend-dev' });
    await app.orchestrator.waitFor(t.id);
    let r = await json(`/api/tasks/${t.id}/props`, { title: '  Kiểm tra   email  ', priority: 'high' });
    assert.equal(r.status, 200);
    let body = await r.json();
    assert.equal(body.title, 'Kiểm tra email');
    assert.equal(body.priority, 'high');
    assert.equal(app.store.get(t.id)?.priority, 'high');
    r = await json(`/api/tasks/${t.id}/props`, { priority: '' });
    body = await r.json();
    assert.equal(body.priority, undefined, 'chuỗi rỗng = bỏ ưu tiên');
    assert.equal((await json(`/api/tasks/${t.id}/props`, { priority: 'gấp' })).status, 400);
    assert.equal((await json(`/api/tasks/${t.id}/props`, { title: '   ' })).status, 400);
    assert.equal((await json(`/api/tasks/${t.id}/props`, { title: 5 })).status, 400);
    assert.equal((await json('/api/tasks/T-khong-co/props', { title: 'x' })).status, 404);
    const sys = fs.readFileSync(`${app.config.dataDir}/logs/system.jsonl`, 'utf8');
    assert.match(sys, /task\.updated/);
  } finally {
    srv.close();
    app.cleanup();
  }
});

test('UI-7 ngân sách theo agent: trần cứng tạm dừng nhiệm vụ, chỉ cảnh báo thì chạy tiếp', async () => {
  const app = testApp();
  const { srv, json } = await serve(app);
  try {
    // kiểm tra đầu vào
    assert.equal((await json('/api/budgets', { scope: 'agent', target: 'khong-co', tokens: 5000 })).status, 400);
    assert.equal((await json('/api/budgets', { scope: 'project', target: 'khong-co', tokens: 5000 })).status, 400);
    assert.equal((await json('/api/budgets', { scope: 'agent', target: 'backend-dev', tokens: 10 })).status, 400);
    assert.equal((await json('/api/budgets', { scope: 'agent', target: 'backend-dev', tokens: 5000, softPct: 0 })).status, 400);

    // lượt đầu ghi token cho backend-dev, sau đó đặt trần thấp hơn mức đã dùng
    const t1 = app.orchestrator.submit({ brief: 'Viết hàm cộng hai số kèm test', agentId: 'backend-dev' });
    assert.equal((await app.orchestrator.waitFor(t1.id)).status, 'done');
    let r = await json('/api/budgets', { scope: 'agent', target: 'backend-dev', period: 'day', tokens: 1000, softPct: 50, hard: true });
    assert.equal(r.status, 200);
    const pol = await r.json();
    assert.equal(pol.level, 'hard');
    assert.ok(pol.used > 1000);
    // trùng phạm vi + đối tượng + kỳ → từ chối
    assert.equal((await json('/api/budgets', { scope: 'agent', target: 'backend-dev', period: 'day', tokens: 9000 })).status, 400);

    const t2 = app.orchestrator.submit({ brief: 'Viết hàm trừ hai số kèm test', agentId: 'backend-dev' });
    const d2 = await app.orchestrator.waitFor(t2.id);
    assert.equal(d2.status, 'paused');
    assert.equal(d2.pause?.reason, 'budget');
    assert.match(d2.pause?.detail ?? '', /agent @backend-dev/);

    // đổi sang chỉ cảnh báo → tiếp tục chạy được tới xong
    r = await json('/api/budgets', { id: pol.id, scope: 'agent', target: 'backend-dev', period: 'day', tokens: 1000, softPct: 50, hard: false });
    assert.equal(r.status, 200);
    app.orchestrator.resume(t2.id, {});
    assert.equal((await app.orchestrator.waitFor(t2.id)).status, 'done');

    const list = await (await json('/api/budgets')).json();
    assert.equal(list.policies.length, 1);
    assert.equal(list.policies[0].hard, false);
    assert.equal((await json(`/api/budgets/${pol.id}`, undefined, 'DELETE')).status, 200);
    assert.equal((await json(`/api/budgets/${pol.id}`, undefined, 'DELETE')).status, 404);
    assert.ok(fs.existsSync(`${app.config.dataDir}/budgets.json`));
  } finally {
    srv.close();
    app.cleanup();
  }
});

test('UI-7 đầu kỳ ngân sách: ngày, tháng, toàn bộ', () => {
  const now = new Date(2026, 10, 18, 15, 30);
  assert.equal(new Date(periodStart('day', now)!).getDate(), 18);
  assert.equal(new Date(periodStart('day', now)!).getHours(), 0);
  assert.equal(new Date(periodStart('month', now)!).getDate(), 1);
  assert.equal(periodStart('total', now), undefined);
});

test('UI-7 agent ngoài: tiến trình stdin/stdout JSON, không lộ biến bí mật; HTTP chỉ "cục bộ" khi loopback', async () => {
  const { ExternalRuntime, parseExternalOutput, isLoopbackUrl } = await import('../src/runtimes/external.js');
  const { RuntimeManager } = await import('../src/runtimes/index.js');
  const { loadConfig } = await import('../src/config.js');
  const http = await import('node:http');
  const path = await import('node:path');
  const os = await import('node:os');
  const agent = { id: 'backend-dev', name: 'Backend', role: 'member', department: 'dev' } as never;
  const req = (cwd: string) => ({ agent, phase: 'execute' as const, system: 'Bạn là backend', prompt: 'Viết hàm cộng', model: 'm', cwd, tools: [], allowTools: false, timeoutMs: 10_000, meta: { taskId: 'T-1', department: 'dev', callId: 'T-1#1' } });

  assert.deepEqual(parseExternalOutput('xin chào'), { text: 'xin chào' });
  assert.equal(parseExternalOutput('{"text":"a","usage":{"input":3,"output":-1}}').output, undefined);
  assert.ok(isLoopbackUrl('http://127.0.0.1:9/x') && !isLoopbackUrl('https://example.com/run'));

  // tiến trình: dùng agent mẫu; thêm một agent in biến môi trường để chắc khóa API không lọt
  process.env.CCODING_TEST_SECRET = 'sk-khong-duoc-lo';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
  try {
    const sample = new ExternalRuntime('ext', { type: 'process', command: process.execPath, extraArgs: [path.resolve('examples/external-agent.mjs')] });
    assert.equal(sample.local, true);
    assert.equal((await sample.available()).ok, true);
    const r = await sample.run(req(tmp), {});
    assert.equal(r.error, undefined, r.error);
    assert.match(r.text, /@backend-dev/);
    assert.equal(r.model, 'external-echo');
    assert.equal(r.estimated, false);
    fs.writeFileSync(path.join(tmp, 'env.mjs'), 'process.stdout.write(JSON.stringify(process.env))');
    const envRt = new ExternalRuntime('ext2', { type: 'process', command: process.execPath, extraArgs: [path.join(tmp, 'env.mjs')] });
    const env = JSON.parse((await envRt.run(req(tmp), {})).text);
    assert.equal(env.CCODING_TEST_SECRET, undefined);
    assert.equal(env.CCODING_AGENT_ID, 'backend-dev');
    assert.equal(env.CCODING_RUN_ID, 'T-1#1');
    fs.writeFileSync(path.join(tmp, 'bad.mjs'), 'process.stderr.write("hỏng"); process.exit(3)');
    const bad = await new ExternalRuntime('ext3', { type: 'process', command: process.execPath, extraArgs: [path.join(tmp, 'bad.mjs')] }).run(req(tmp), {});
    assert.match(bad.error ?? '', /thoát mã 3/);
    assert.equal((await new ExternalRuntime('ext4', { type: 'process', command: 'khong-co-lenh-nay' }).available()).ok, false);
  } finally {
    delete process.env.CCODING_TEST_SECRET;
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // HTTP: máy chủ loopback nhận đúng thân yêu cầu
  let got: Record<string, unknown> = {};
  const srv = http.createServer((q, s) => {
    let b = '';
    q.on('data', (c) => (b += c));
    q.on('end', () => {
      got = JSON.parse(b);
      s.end(JSON.stringify({ text: 'ok từ http', usage: { input: 10, output: 2 } }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/run`;
    const h = new ExternalRuntime('team', { type: 'http', baseUrl: url });
    assert.equal(h.local, true);
    const r = await h.run(req(os.tmpdir()), {});
    assert.equal(r.text, 'ok từ http');
    assert.equal(r.usage.input, 10);
    assert.equal(got.prompt, 'Viết hàm cộng');
    assert.equal((got.agent as { id: string }).id, 'backend-dev');
    assert.equal(new ExternalRuntime('far', { type: 'http', baseUrl: 'https://agents.example.com/run', local: true }).local, false, 'máy ở xa không được tự nhận là cục bộ');
  } finally {
    srv.close();
  }

  // đăng ký qua cấu hình
  const base = loadConfig();
  const rm = new RuntimeManager({ ...base, runtimes: { ...base.runtimes, 'my-agent': { type: 'process', command: process.execPath, extraArgs: ['x.mjs'] }, team: { type: 'http', baseUrl: 'http://localhost:1/run' } } });
  assert.ok(rm.get('my-agent') instanceof ExternalRuntime);
  assert.ok(rm.get('team') instanceof ExternalRuntime);
});
