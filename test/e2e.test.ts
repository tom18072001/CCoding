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

test('ngân sách: chế độ "pause" tạm dừng khi chạm trần, tiếp tục từ checkpoint; "complete" chạy tới khi xong; hủy', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Việc lớn', mode: 'department', department: 'dev', options: { budgetTokens: 1000, budgetMode: 'pause' } });
    const r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'paused');
    assert.equal(r.pause?.reason, 'budget');
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'budget.100' && a.taskId === t.id));
    const plansBefore = app.store.transcript(t.id).filter((m) => m.kind === 'plan').length;
    assert.throws(() => app.orchestrator.resume(t.id), /tăng ngân sách/);
    app.orchestrator.resume(t.id, { addBudget: 50_000_000 });
    const r2 = await app.orchestrator.waitFor(t.id);
    assert.equal(r2.status, 'done', r2.error ?? r2.pause?.detail);
    assert.equal(r2.resumes, 1);
    assert.equal(app.store.transcript(t.id).filter((m) => m.kind === 'plan').length, plansBefore, 'không lập lại kế hoạch đã có');
    assert.ok(r2.runs[0].subtasks.every((s) => s.status === 'done'));

    const over = app.orchestrator.submit({ brief: 'Việc vượt trần nhưng phải xong', mode: 'department', department: 'research', options: { budgetTokens: 1000, budgetMode: 'complete', review: false } });
    const o = await app.orchestrator.waitFor(over.id);
    assert.equal(o.status, 'done');
    assert.ok(o.usage.input + o.usage.output > 1000);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'budget.100' && a.level === 'warn' && a.taskId === over.id), 'vượt trần ở chế độ complete chỉ cảnh báo');

    // chạy lại một hạng mục đã xong (vd. để áp dụng vào repo) → review/tổng hợp chạy lại
    const st = r2.runs[0].subtasks[0];
    app.orchestrator.resume(t.id, { rerun: [st.id] });
    const r3 = await app.orchestrator.waitFor(t.id);
    assert.equal(r3.status, 'done');
    assert.ok(r3.runs[0].subtasks.find((s) => s.id === st.id)!.attempts >= 2);

    const c = app.orchestrator.submit({ brief: 'Sẽ bị hủy', mode: 'department', department: 'dev' });
    setTimeout(() => app.orchestrator.cancel(c.id), 15);
    const cr = await app.orchestrator.waitFor(c.id);
    assert.equal(cr.status, 'cancelled');
  } finally {
    app.cleanup();
  }
});

test('server khởi động lại giữa chừng → nhiệm vụ chuyển "tạm dừng" để tiếp tục, không mất tiến độ', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết đề cương', mode: 'department', department: 'research', options: { review: false } });
    await app.orchestrator.waitFor(t.id);
    const saved = app.store.get(t.id)!;
    saved.status = 'running';
    saved.runs[0].status = 'running';
    saved.runs[0].stage = 'executed';
    saved.runs[0].finalPath = undefined;
    app.store.put(saved, true);
    const again = testApp({ dataDir: app.config.dataDir });
    const t2 = again.store.get(t.id)!;
    assert.equal(t2.status, 'paused');
    assert.equal(t2.pause?.reason, 'interrupted');
    const calls = again.usage.all({ task: t.id }).length;
    again.orchestrator.resume(t.id);
    const done = await again.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done');
    const phases = again.usage.all({ task: t.id }).slice(calls).map((r) => r.phase);
    assert.deepEqual([...new Set(phases)], ['synthesize'], 'chỉ chạy phần còn thiếu');
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
