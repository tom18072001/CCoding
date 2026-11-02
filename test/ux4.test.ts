import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer, snapshot } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { LogStore } from '../src/logger.js';
import { Store } from '../src/store.js';
import type { Task } from '../src/types.js';
import { testApp } from './helpers.js';

// UX-4: mã nhiệm vụ ngắn (CC-94) — số thứ tự lưu trong task.json, đánh số bù cho nhiệm vụ cũ, tra theo mã.

function oldTask(dir: string, id: string, createdAt: string, extra: Partial<Task> = {}): void {
  const t = { id, title: id, brief: '', mode: 'department', classification: 'internal', status: 'done', departments: [], runs: [], options: {}, usage: {}, createdAt, updatedAt: createdAt, ...extra };
  fs.mkdirSync(path.join(dir, 'runs', id), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', id, 'task.json'), JSON.stringify(t));
}

test('mã ngắn: đánh số bù theo lúc tạo, ghi lại task.json, số mới nối tiếp, tra theo mã', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-seq-'));
  try {
    oldTask(dir, 'T-20261001-090000-bbb', '2026-10-01T09:00:00.000Z');
    oldTask(dir, 'T-20261001-080000-aaa', '2026-10-01T08:00:00.000Z');
    oldTask(dir, 'T-20261002-080000-ccc', '2026-10-02T08:00:00.000Z');
    const logs = new LogStore(dir, { redactSecrets: true, redactPii: true, hashChain: false });
    const store = new Store(dir, logs);
    assert.deepEqual(
      store.list().map((t) => [t.id.slice(-3), t.seq]),
      [['ccc', 3], ['bbb', 2], ['aaa', 1]],
      'cũ nhất là CC-1',
    );
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'T-20261001-080000-aaa', 'task.json'), 'utf8'));
    assert.equal(disk.seq, 1, 'số bù được ghi xuống đĩa (lần khởi động sau không đổi số)');
    assert.equal(store.nextSeq(), 4);
    assert.equal(store.resolve('CC-2')?.id, 'T-20261001-090000-bbb');
    assert.equal(store.resolve('cc-2')?.id, 'T-20261001-090000-bbb', 'không phân biệt hoa thường, tiền tố bất kỳ');
    assert.equal(store.resolve('T-20261002-080000-ccc')?.seq, 3);
    assert.equal(store.resolve('CC-99'), undefined);
    assert.equal(store.resolve('T-20261002'), undefined);
    // khởi động lại: giữ nguyên số đã cấp; nhiệm vụ cũ chép thêm vào (không có số) nhận số sau số lớn nhất
    oldTask(dir, 'T-20260901-080000-zzz', '2026-09-01T08:00:00.000Z');
    const again = new Store(dir, logs);
    assert.equal(again.resolve('T-20261001-080000-aaa')?.seq, 1);
    assert.equal(again.resolve('T-20260901-080000-zzz')?.seq, 4, 'không đánh số lại các nhiệm vụ đã có số');
    assert.equal(again.nextSeq(), 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mã ngắn: tiền tố cấu hình (chữ in hoa/số, ≤ 8 ký tự, sai thì về CC)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-prefix-'));
  try {
    const cfg = (v: unknown) => {
      fs.writeFileSync(path.join(root, 'ccoding.config.json'), JSON.stringify({ taskPrefix: v }));
      return loadConfig({ root, local: false }).taskPrefix;
    };
    assert.equal(cfg('ics'), 'ICS');
    assert.equal(cfg(' Hq2 '), 'HQ2');
    assert.equal(cfg('1AB'), 'CC');
    assert.equal(cfg('QUÁ-DÀI'), 'CC');
    assert.equal(cfg('ABCDEFGHI'), 'CC');
    assert.equal(cfg(null), 'CC');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mã ngắn: nhiệm vụ mới nhận số tăng dần; API nhận mã ngắn; trạng thái có tiền tố', async () => {
  const app = testApp();
  const s0 = createServer(app);
  await new Promise<void>((r) => s0.listen(0, '127.0.0.1', r));
  const port = (s0.address() as AddressInfo).port;
  s0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  try {
    const a = app.orchestrator.submit({ brief: 'Viết tài liệu hướng dẫn cài đặt', mode: 'department', department: 'research', options: { discussionRounds: 0 } });
    const b = app.orchestrator.submit({ brief: 'Viết tài liệu kiến trúc', mode: 'department', department: 'research', options: { discussionRounds: 0 } });
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    await app.orchestrator.waitFor(a.id);
    await app.orchestrator.waitFor(b.id);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/CC-2`);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { task: Task }).task.id, b.id);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/tasks/CC-77`)).status, 404);
    assert.equal(snapshot(app).taskPrefix, 'CC');
  } finally {
    srv.close();
    app.cleanup();
  }
});
