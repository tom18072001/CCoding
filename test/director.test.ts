import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { systemFor } from '../src/prompts.js';
import { pickRateHeaders } from '../src/runtimes/api.js';
import { readJsonl } from '../src/util/fsx.js';
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
  return { srv: srv2, base, json };
}

test('giao việc riêng cho một agent: bỏ định tuyến/lập kế hoạch/họp, một hạng mục, có review, báo cáo từ bàn giao', async () => {
  const app = testApp();
  try {
    assert.throws(() => app.orchestrator.submit({ brief: 'x', mode: 'agent', agentId: 'orchestrator' }), /không thuộc phòng ban/);
    assert.throws(() => app.orchestrator.submit({ brief: 'x', mode: 'agent', agentId: 'khong-co' }), /Agent không hợp lệ/);
    const t = app.orchestrator.submit({ brief: 'Viết hàm kiểm tra email hợp lệ kèm test', agentId: 'backend-dev', options: { discussionRounds: 2 } });
    assert.equal(t.mode, 'agent');
    assert.equal(t.department, 'dev');
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.runs.length, 1);
    assert.deepEqual(done.runs[0].subtasks.map((s) => [s.id, s.assignee, s.status]), [['S1', 'backend-dev', 'done']]);
    const phases = readJsonl<{ taskId: string; phase: string; agentId: string }>(`${app.config.dataDir}/usage/ledger.jsonl`).filter((r) => r.taskId === t.id).map((r) => `${r.phase}:${r.agentId}`);
    assert.ok(!phases.some((p) => /^(route|plan|discuss|finalize|synthesize):/.test(p)), phases.join(', '));
    assert.ok(phases.includes('execute:backend-dev'));
    assert.ok(phases.includes('review:qa-tester'), 'reviewer của phòng vẫn review');
    const final = app.store.readRunFile(t.id, done.finalPath ?? 'FINAL.md') ?? '';
    assert.match(final, /Việc giao riêng cho/);
    // reviewer giao việc riêng cho chính mình → không tự review
    const t2 = app.orchestrator.submit({ brief: 'Viết kế hoạch kiểm thử', agentId: 'qa-tester' });
    const d2 = await app.orchestrator.waitFor(t2.id);
    assert.equal(d2.status, 'done');
    assert.equal(d2.runs[0].review, undefined);
  } finally {
    app.cleanup();
  }
});

test('góp ý cho agent: lưu, bật/tắt, đưa vào hồ sơ (system prompt) ở lượt sau; thư viện prompt; hạn mức', async () => {
  const app = testApp();
  const { srv, json } = await serve(app);
  try {
    assert.equal((await json('/api/agents/khong-co/feedback', { text: 'x' })).status, 404);
    assert.equal((await json('/api/agents/backend-dev/feedback', {})).status, 400);
    const r = await json('/api/agents/backend-dev/feedback', { text: 'Luôn viết test trước khi sửa route', rating: 'up' });
    assert.equal(r.status, 201);
    const f = await r.json();
    const list = await (await json('/api/agents/backend-dev/feedback')).json();
    assert.equal(list.length, 1);
    assert.deepEqual(app.store.activeFeedback('backend-dev').map((x) => x.text), ['Luôn viết test trước khi sửa route']);
    const sys = systemFor(app.registry.agent('backend-dev'), app.registry.department('dev'), 'internal', 'execute', ['👍 Luôn viết test trước khi sửa route']);
    assert.match(sys, /## Góp ý của giám đốc \(Tom\) dành cho bạn[^\n]*\n- 👍 Luôn viết test/);
    assert.doesNotMatch(systemFor(app.registry.agent('backend-dev'), app.registry.department('dev'), 'internal', 'execute'), /Góp ý của giám đốc/);
    // tắt góp ý → không còn trong danh sách đang bật
    assert.equal((await json(`/api/agents/backend-dev/feedback/${f.id}`, { active: false })).status, 200);
    assert.deepEqual(app.store.activeFeedback('backend-dev'), []);
    assert.equal((await json(`/api/agents/backend-dev/feedback/${f.id}`, undefined, 'DELETE')).status, 200);
    // log góp ý không chứa nội dung
    assert.ok(app.logs.query({ agent: 'backend-dev', limit: 50 }).some((e) => e.kind === 'agent.feedback' && !e.msg.includes('Luôn viết test')));

    // thư viện prompt
    assert.equal((await json('/api/prompts', { title: '', body: 'x' })).status, 400);
    const pr = await (await json('/api/prompts', { title: 'Sửa lỗi', body: '## Mục tiêu\nSửa lỗi …', tags: ['dev'], mode: 'agent', agentId: 'backend-dev' })).json();
    assert.equal(pr.uses, 0);
    const upd = await json('/api/prompts', { id: pr.id, title: 'Sửa lỗi (bản 2)', body: 'mới' });
    assert.equal(upd.status, 200);
    assert.equal((await (await json(`/api/prompts/${pr.id}/use`, {})).json()).uses, 1);
    const all = await (await json('/api/prompts')).json();
    assert.deepEqual(all.map((x: any) => [x.title, x.uses, x.createdAt === pr.createdAt]), [['Sửa lỗi (bản 2)', 1, true]]);
    assert.equal((await json(`/api/prompts/${pr.id}`, undefined, 'DELETE')).status, 200);

    // hạn mức: theo runtime, không lộ khóa
    const q = await (await json('/api/quota')).json();
    assert.ok(q.runtimes.some((x: any) => x.id === 'mock'));
    assert.ok(!JSON.stringify(q).match(/sk-|gsk_|csk-/));
    for (const x of q.runtimes) assert.ok(!('key' in x) && !('apiKey' in x));

    // giao việc riêng qua API
    const t = await (await json('/api/tasks', { brief: 'Viết README', mode: 'agent', agentId: 'devops' })).json();
    assert.equal(t.agentId, 'devops');
    await app.orchestrator.waitFor(t.id);
  } finally {
    srv.close();
    app.cleanup();
  }
});

test('header giới hạn của nhà cung cấp: chỉ giữ x-ratelimit-* / retry-after', () => {
  const h = new Headers({ 'x-ratelimit-remaining-tokens-day': '812345', 'x-ratelimit-limit-requests': '30', 'retry-after': '12', authorization: 'Bearer secret-value', 'set-cookie': 'a=b' });
  assert.deepEqual(pickRateHeaders(h), { 'retry-after': '12', 'x-ratelimit-limit-requests': '30', 'x-ratelimit-remaining-tokens-day': '812345' });
});
