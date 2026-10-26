import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { fileSafeName } from '../src/uploads.js';
import { testApp } from './helpers.js';

test('tải tệp lên qua API → đính kèm nhiệm vụ → nội dung vào prompt lập kế hoạch, tệp tạm bị xóa', async () => {
  const app = testApp();
  const probe = createServer(app);
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as AddressInfo).port;
  probe.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal(fileSafeName('Kế hoạch dự án (bản 2).MD'), 'Ke-hoach-du-an-ban-2.md');
    const up = await fetch(`${base}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown', 'x-filename': encodeURIComponent('Yêu cầu Kepper.md') },
      body: '# Yêu cầu\nMô-đun báo cáo tuần phải có bộ lọc theo phòng ban. MÃ-KIỂM-TRA-4711\n',
    });
    assert.equal(up.status, 201);
    const meta = await up.json();
    assert.equal(meta.kind, 'text');
    assert.ok(meta.chars > 20);
    assert.equal((await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 400, 'thiếu tên tệp');
    const res = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'Lập kế hoạch theo tài liệu đính kèm', mode: 'department', department: 'dev', options: { review: false, discussionRounds: 0 }, attachments: [meta.id] }),
    });
    assert.equal(res.status, 201);
    const t = await res.json();
    assert.equal(t.attachments.length, 1);
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const dir = app.store.runDir(t.id);
    assert.ok(fs.readFileSync(path.join(dir, t.attachments[0].textPath), 'utf8').includes('MÃ-KIỂM-TRA-4711'));
    assert.ok(!fs.existsSync(path.join(app.config.dataDir, 'uploads', meta.id)), 'bản tạm đã xóa sau khi gắn vào nhiệm vụ');
    const prompts = fs.readdirSync(path.join(dir, 'prompts'));
    const plan = prompts.find((f) => f.endsWith('-plan.md'))!;
    const text = fs.readFileSync(path.join(dir, 'prompts', plan), 'utf8');
    assert.ok(text.includes('Tài liệu đính kèm') && text.includes('MÃ-KIỂM-TRA-4711'));
    // workspace của nhiệm vụ có bản đầu vào cho agent đọc bằng công cụ
    assert.ok(fs.existsSync(path.join(done.workspace!, '.ccoding', t.id, 'inputs', 'BRIEF.md')));
    const ev = await (await fetch(`${base}/api/tasks/${t.id}/events?limit=50`)).json();
    assert.ok(Array.isArray(ev) && ev.length > 0);
    const calls = await (await fetch(`${base}/api/tasks/${t.id}/calls`)).json();
    assert.ok(calls.length >= 2 && 'sizes' in calls[0]);
  } finally {
    srv.close();
    app.cleanup();
  }
});
