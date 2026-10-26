import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { totalTokens } from '../src/types.js';
import { verifyChain } from '../src/logger.js';
import { testApp } from './helpers.js';

test('luồng đầy đủ: định tuyến → kế hoạch → họp → thực thi → review/sửa → báo cáo', async () => {
  const app = testApp({ reviewRejectRate: 1 });
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash', mode: 'auto' });
    assert.equal(t.title, 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash');
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.deepEqual(done.departments, ['dev']);
    const run = done.runs[0];
    assert.ok(run.subtasks.length >= 2);
    assert.ok(run.subtasks.every((s) => s.status === 'done' && s.output));
    assert.ok(run.subtasks.some((s) => s.attempts > 1), 'có ít nhất một hạng mục được sửa theo review');
    const transcript = app.store.transcript(t.id);
    for (const k of ['decision', 'plan', 'discussion', 'handoff', 'review', 'final']) assert.ok(transcript.some((m) => m.kind === k), `thiếu tin nhắn ${k}`);
    // bộ đếm token khớp nhau giữa sổ cái và nhiệm vụ
    const ledger = app.usage.total({ task: t.id });
    assert.equal(ledger.input, done.usage.input);
    assert.equal(ledger.output, done.usage.output);
    assert.equal(app.usage.summary('agent', { task: t.id }).reduce((n, r) => n + r.total, 0), totalTokens(done.usage));
    assert.ok(app.usage.summary('department', { task: t.id }).some((r) => r.key === 'office'), 'lượt định tuyến được tính cho văn phòng điều phối');
    // file đầu ra & log từng vị trí
    const dir = app.store.runDir(t.id);
    assert.ok(fs.readFileSync(path.join(dir, 'FINAL.md'), 'utf8').includes('Phụ lục: token'));
    for (const s of run.subtasks) assert.ok(fs.existsSync(app.logs.fileFor('agent', s.assignee)));
    assert.equal(verifyChain(app.logs.fileFor('system')).ok, true);
    assert.equal(verifyChain(app.usage.file).ok, true);
  } finally {
    app.cleanup();
  }
});

test('liên phòng chạy nghiên cứu trước rồi phát triển; chế độ phòng ban & dự án', async () => {
  const app = testApp();
  try {
    const joint = app.orchestrator.submit({ brief: 'Tổng quan tài liệu về phát hiện bất thường rồi dựng prototype', mode: 'joint', options: { discussionRounds: 0 } });
    const dept = app.orchestrator.submit({ brief: 'Viết đề cương luận văn', mode: 'department', department: 'research', options: { review: false } });
    const [j, d] = await Promise.all([app.orchestrator.waitFor(joint.id), app.orchestrator.waitFor(dept.id)]);
    assert.equal(j.status, 'done', j.error);
    assert.deepEqual(j.departments, ['research', 'dev']);
    assert.ok(fs.readFileSync(path.join(app.store.runDir(j.id), 'FINAL.md'), 'utf8').startsWith('# Báo cáo liên phòng'));
    assert.equal(d.status, 'done', d.error);
    assert.deepEqual(d.departments, ['research']);
    assert.equal(app.store.transcript(d.id).filter((m) => m.kind === 'review').length, 0);

    app.store.saveProject({ id: 'bao-mat', name: 'Dự án bảo mật', department: 'dev', classification: 'restricted', runtime: 'anthropic-api', createdAt: new Date().toISOString() });
    const p = app.orchestrator.submit({ brief: 'Rà soát cấu hình', projectId: 'bao-mat' });
    const pr = await app.orchestrator.waitFor(p.id);
    assert.equal(pr.status, 'done', pr.error);
    assert.equal(pr.classification, 'restricted');
    // dữ liệu "Hạn chế" không được gửi tới runtime bên ngoài
    assert.ok(app.usage.all({ task: p.id }).every((r) => r.runtime === 'mock'));
    assert.ok(app.logs.query({ task: p.id, limit: 500 }).some((e) => e.kind === 'runtime.fallback'));
  } finally {
    app.cleanup();
  }
});

test('ngân sách token và hủy nhiệm vụ', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Việc lớn', mode: 'department', department: 'dev', options: { budgetTokens: 1000 } });
    const r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'failed');
    assert.match(r.error ?? '', /ngân sách/);

    const c = app.orchestrator.submit({ brief: 'Sẽ bị hủy', mode: 'department', department: 'dev' });
    setTimeout(() => app.orchestrator.cancel(c.id), 15);
    const cr = await app.orchestrator.waitFor(c.id);
    assert.equal(cr.status, 'cancelled');
  } finally {
    app.cleanup();
  }
});

test('API: trạng thái, chống CSRF/DNS rebinding, giao việc', async () => {
  const app = testApp();
  app.config.server.port = 0;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  app.config.server.port = port;
  const srv2 = createServer(app); // tạo lại để danh sách host hợp lệ có cổng thật
  srv.close();
  await new Promise<void>((r) => srv2.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  try {
    const st = await (await fetch(`${base}/api/state`)).json();
    assert.equal(st.agents.length, 16);
    assert.equal((await fetch(`${base}/api/tasks`, { method: 'POST', body: '{"brief":"x"}' })).status, 415);
    assert.equal((await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{"brief":"x"}' })).status, 403);
    const res = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: 'Viết tổng quan tài liệu', mode: 'department', department: 'research' }) });
    assert.equal(res.status, 201);
    const t = await res.json();
    await app.orchestrator.waitFor(t.id);
    const usage = await (await fetch(`${base}/api/usage?by=department`)).json();
    assert.ok(usage.rows.some((r: { key: string }) => r.key === 'research'));
    const fin = await fetch(`${base}/api/tasks/${t.id}/file?path=../../../etc/passwd`);
    assert.equal(fin.status, 404);
  } finally {
    srv2.close();
    app.cleanup();
  }
});
