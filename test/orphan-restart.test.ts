import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonl } from '../src/util/fsx.js';
import { Store } from '../src/store.js';
import type { Task } from '../src/types.js';
import { testApp } from './helpers.js';

type App = ReturnType<typeof testApp>;

function taskFile(app: App, id: string): string {
  return path.join(app.config.dataDir, 'runs', id, 'task.json');
}
function onDisk(app: App, id: string): Task {
  return JSON.parse(fs.readFileSync(taskFile(app, id), 'utf8')) as Task;
}
function orphanEvents(app: App, id: string): unknown[] {
  const dir = path.join(app.config.dataDir, 'logs');
  const out: unknown[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) for (const r of readJsonl<{ kind?: string; taskId?: string }>(p)) if (r.kind === 'task.orphaned' && r.taskId === id) out.push(r);
    }
  };
  walk(dir);
  return out;
}

/** Tạo nhiệm vụ xong trong app, ép trạng thái trên đĩa thành `status` (giả lập server chết giữa chừng), rồi dựng app mới như lúc khởi động lại. */
async function crashed(status: 'running' | 'queued' | 'done' | 'failed', withBoot?: string): Promise<{ app: App; again: App; id: string }> {
  const app = testApp();
  const t = app.orchestrator.submit({ brief: 'Viết đề cương', mode: 'department', department: 'research', options: { review: false } });
  await app.orchestrator.waitFor(t.id);
  const saved = app.store.get(t.id)!;
  saved.status = status;
  if (status === 'running') {
    saved.runs[0].status = 'running';
    saved.runs[0].subtasks[0].status = 'running';
    saved.runs[0].stage = 'executed';
    saved.runs[0].finalPath = undefined;
  }
  saved.serverBootId = withBoot;
  app.store.put(saved, true);
  const again = testApp({ dataDir: app.config.dataDir });
  return { app, again, id: t.id };
}

test('nhiệm vụ running mồ côi → paused/interrupted, subtask về pending, ghi đĩa + sự kiện, resume chạy tới done', async () => {
  const { app, again, id } = await crashed('running');
  try {
    // nạp xong: chỉ đổi trong bộ nhớ, chưa ghi đĩa (đường CLI)
    assert.equal(onDisk(again, id).status, 'running');
    assert.equal(orphanEvents(again, id).length, 0);
    const recovered = again.orchestrator.recoverOrphans();
    assert.deepEqual(recovered, [id]);
    const t = again.store.get(id)!;
    assert.equal(t.status, 'paused');
    assert.equal(t.pause?.reason, 'interrupted');
    assert.match(t.pause!.detail, /server dừng giữa chừng/);
    assert.equal(t.runs[0].status, 'paused');
    assert.equal(t.runs[0].subtasks[0].status, 'pending');
    const d = onDisk(again, id);
    assert.equal(d.status, 'paused');
    assert.equal(d.pause?.reason, 'interrupted');
    assert.equal(d.runs[0].subtasks[0].status, 'pending');
    const ev = orphanEvents(again, id) as { data?: { from?: string; returned?: number } }[];
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data?.from, 'running');
    assert.equal(ev[0].data?.returned, 1);
    // gọi lại không ghi thêm
    assert.deepEqual(again.orchestrator.recoverOrphans(), []);
    assert.equal(orphanEvents(again, id).length, 1);
    // không tự chạy lại; resume chạy tới done và gắn mã phiên hiện tại
    assert.equal(again.store.get(id)!.status, 'paused');
    again.orchestrator.resume(id);
    assert.equal(again.store.get(id)!.serverBootId, again.orchestrator.bootId);
    const done = await again.orchestrator.waitFor(id);
    assert.equal(done.status, 'done');
  } finally {
    again.cleanup();
    app.cleanup();
  }
});

test('nhiệm vụ queued mồ côi → paused/interrupted', async () => {
  const { app, again, id } = await crashed('queued');
  try {
    assert.deepEqual(again.orchestrator.recoverOrphans(), [id]);
    assert.equal(onDisk(again, id).status, 'paused');
    const ev = orphanEvents(again, id) as { data?: { from?: string } }[];
    assert.equal(ev[0].data?.from, 'queued');
  } finally {
    again.cleanup();
    app.cleanup();
  }
});

test('nhiệm vụ done và failed giữ nguyên', async () => {
  for (const st of ['done', 'failed'] as const) {
    const { app, again, id } = await crashed(st);
    try {
      assert.deepEqual(again.orchestrator.recoverOrphans(), []);
      assert.equal(again.store.get(id)!.status, st);
      assert.equal(onDisk(again, id).status, st);
      assert.equal(orphanEvents(again, id).length, 0);
    } finally {
      again.cleanup();
      app.cleanup();
    }
  }
});

test('nhiệm vụ running mang serverBootId của phiên hiện tại không bị đổi', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết đề cương', mode: 'department', department: 'research', options: { review: false } });
    await app.orchestrator.waitFor(t.id);
    const live = app.store.get(t.id)!;
    live.status = 'running';
    live.serverBootId = app.orchestrator.bootId;
    app.store.put(live, true);
    assert.deepEqual(app.orchestrator.recoverOrphans(), []);
    assert.equal(app.store.get(t.id)!.status, 'running');
    assert.equal(onDisk(app, t.id).status, 'running');
    // cùng nhiệm vụ nhưng mã phiên khác → mồ côi
    live.serverBootId = 'phien-truoc';
    assert.deepEqual(app.orchestrator.recoverOrphans(), [t.id]);
    assert.equal(app.store.get(t.id)!.status, 'paused');
  } finally {
    app.cleanup();
  }
});

test('mã phiên ghi lên nhiệm vụ khi vào hàng đợi (submit)', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết đề cương', mode: 'department', department: 'research', options: { review: false } });
    assert.equal(t.serverBootId, app.orchestrator.bootId);
    await app.orchestrator.waitFor(t.id);
  } finally {
    app.cleanup();
  }
});

test('Store kiểu CLI (không gọi recoverOrphans) không ghi paused xuống đĩa', async () => {
  const { app, again, id } = await crashed('running');
  try {
    const before = fs.readFileSync(taskFile(app, id), 'utf8');
    const cli = new Store(app.config.dataDir, again.logs);
    assert.equal(cli.get(id)!.status, 'paused'); // trong bộ nhớ
    assert.equal(fs.readFileSync(taskFile(app, id), 'utf8'), before, 'tệp task.json không đổi');
    assert.equal(onDisk(app, id).status, 'running');
  } finally {
    again.cleanup();
    app.cleanup();
  }
});
