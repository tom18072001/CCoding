import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { auditOf } from '../src/audit.js';
import { CATCH_UP_MS, describeSchedule, nextRun, Routines } from '../src/routines.js';
import type { Routine } from '../src/types.js';
import { testApp } from './helpers.js';

// UX-4d: Kiểm toán, Sản phẩm, Kỹ năng & Kết nối, Việc định kỳ.

const L = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0); // giờ địa phương

test('lịch việc định kỳ: hằng ngày, theo thứ, mỗi N giờ; mô tả tiếng Việt', () => {
  // 2/11/2026 là thứ Hai
  const mon10 = L(2026, 11, 2, 10, 0);
  assert.equal(mon10.getDay(), 1);
  assert.equal(nextRun({ kind: 'daily', time: '08:30' }, mon10)!.getTime(), L(2026, 11, 3, 8, 30).getTime(), 'đã qua 08:30 hôm nay → ngày mai');
  assert.equal(nextRun({ kind: 'daily', time: '10:01' }, mon10)!.getTime(), L(2026, 11, 2, 10, 1).getTime());
  assert.equal(nextRun({ kind: 'daily', time: '10:00' }, mon10)!.getTime(), L(2026, 11, 3, 10, 0).getTime(), 'đúng mốc hiện tại → lần sau');
  assert.equal(nextRun({ kind: 'weekly', time: '09:00', days: [1, 3, 5] }, mon10)!.getTime(), L(2026, 11, 4, 9, 0).getTime(), 'T2 9h đã qua → T4');
  assert.equal(nextRun({ kind: 'weekly', time: '09:00', days: [1] }, mon10)!.getTime(), L(2026, 11, 9, 9, 0).getTime(), 'T2 9h đã qua → T2 tuần sau');
  assert.equal(nextRun({ kind: 'weekly', time: '09:00', days: [0] }, mon10)!.getTime(), L(2026, 11, 8, 9, 0).getTime(), '→ CN');
  assert.equal(nextRun({ kind: 'interval', everyHours: 6 }, mon10)!.getTime(), mon10.getTime() + 6 * 3600e3);
  assert.equal(nextRun({ kind: 'interval', everyHours: 6 }, mon10, new Date(mon10.getTime() - 20 * 3600e3).toISOString())!.getTime(), mon10.getTime() + 4 * 3600e3, 'lỡ nhiều chu kỳ → chu kỳ kế tiếp sau bây giờ');
  assert.equal(nextRun({ kind: 'weekly', time: '09:00', days: [] }, mon10), undefined);
  assert.equal(nextRun({ kind: 'daily', time: '25:00' }, mon10), undefined);
  assert.equal(nextRun({ kind: 'interval', everyHours: 0 }, mon10), undefined);
  assert.equal(describeSchedule({ kind: 'weekly', time: '09:00', days: [0, 5, 1] }), 'T2, T6, CN lúc 09:00');
  assert.equal(describeSchedule({ kind: 'daily', time: '08:30' }), 'Hằng ngày 08:30');
  assert.equal(describeSchedule({ kind: 'interval', everyHours: 6 }), 'Mỗi 6 giờ');
  // đồng hồ máy bị chỉnh lùi: lần trước "ở tương lai" → không đợi quá một chu kỳ
  assert.equal(nextRun({ kind: 'interval', everyHours: 6 }, mon10, new Date(mon10.getTime() + 3 * 86400e3).toISOString())!.getTime(), mon10.getTime() + 6 * 3600e3);
});

test('việc định kỳ: kiểm dữ liệu, tới giờ thì giao, lần trước chưa xong thì bỏ qua, lỡ lịch lâu thì bỏ qua, lưu ra tệp', async () => {
  const app = testApp();
  try {
    const R = app.routines;
    assert.throws(() => R.upsert({ name: '', schedule: { kind: 'daily', time: '08:00' }, template: { brief: 'x' } }), /tên/);
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'weekly', time: '08:00', days: [] }, template: { brief: 'x' } }), /thứ/);
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'daily', time: '8h' }, template: { brief: 'x' } }), /HH:MM/);
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'daily', time: '08:00' }, template: { brief: ' ' } }), /brief/);
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'daily', time: '08:00' }, template: { brief: 'x', mode: 'department', department: 'khong-co' } }), /phòng ban/);
    const now = L(2026, 11, 2, 7, 0);
    const r = R.upsert({ name: 'Tổng hợp tin buổi sáng', schedule: { kind: 'daily', time: '8:00' }, template: { brief: 'Tổng quan tài liệu mới về phát hiện bất thường', mode: 'department', department: 'research', options: { discussionRounds: 0, review: false, budgetTokens: 50 } } }, undefined, now);
    assert.equal(r.schedule.time, '08:00');
    assert.equal(r.template.options?.budgetTokens, undefined, 'ngân sách < 1000 bị bỏ');
    assert.equal(Date.parse(r.nextRunAt!), L(2026, 11, 2, 8, 0).getTime());
    assert.equal(R.tick(L(2026, 11, 2, 7, 59)), 0, 'chưa tới giờ');
    assert.equal(R.tick(L(2026, 11, 2, 8, 0, )), 1, 'tới giờ → giao');
    const r1 = R.get(r.id)!;
    const t1 = app.store.get(r1.lastTaskId!)!;
    assert.equal(t1.routineId, r.id);
    assert.equal(t1.title, 'Tổng hợp tin buổi sáng');
    assert.equal(Date.parse(r1.nextRunAt!), L(2026, 11, 3, 8, 0).getTime());
    // lần trước còn chạy → bỏ qua, ghi lý do
    assert.ok(['queued', 'running'].includes(t1.status));
    assert.equal(R.tick(L(2026, 11, 3, 8, 0)), 0);
    assert.match(R.get(r.id)!.lastSkip!.reason, /chưa xong/);
    await app.orchestrator.waitFor(t1.id);
    // server tắt lâu: trễ quá 6 giờ → bỏ qua tới lịch kế tiếp; trễ ít → chạy bù
    const rr = R.get(r.id)!;
    rr.nextRunAt = L(2026, 11, 4, 8, 0).toISOString();
    assert.equal(R.tick(new Date(L(2026, 11, 4, 8, 0).getTime() + CATCH_UP_MS + 60_000)), 0);
    assert.match(R.get(r.id)!.lastSkip!.reason, /lỡ lịch/);
    R.get(r.id)!.nextRunAt = L(2026, 11, 5, 8, 0).toISOString();
    assert.equal(R.tick(L(2026, 11, 5, 9, 30)), 1, 'trễ 1,5 giờ → chạy bù một lần');
    await app.orchestrator.waitFor(R.get(r.id)!.lastTaskId!);
    // tắt thì không chạy; chạy ngay vẫn được
    R.upsert({ enabled: false }, r.id);
    assert.equal(R.get(r.id)!.nextRunAt, undefined);
    assert.equal(R.tick(L(2026, 11, 9, 8, 0)), 0);
    const manual = R.run(r.id, { manual: true });
    assert.ok(app.store.get(manual.taskId));
    assert.throws(() => R.run(r.id), /chưa xong/, 'đang chạy thì không chạy chồng');
    await app.orchestrator.waitFor(manual.taskId);
    // lưu ra data/routines.json, nạp lại được
    const disk = JSON.parse(fs.readFileSync(path.join(app.config.dataDir, 'routines.json'), 'utf8')) as Routine[];
    assert.equal(disk.length, 1);
    assert.equal(new Routines(app.config.dataDir, { store: app.store, registry: app.registry, logs: app.logs, orchestrator: app.orchestrator }).get(r.id)?.name, 'Tổng hợp tin buổi sáng');
    const kinds = app.logs.query({ limit: 500 }).map((e) => e.kind);
    for (const k of ['routine.saved', 'routine.run', 'routine.skip']) assert.ok(kinds.includes(k), k);
    assert.equal(R.remove(r.id), true);
    assert.equal(R.all().length, 0);
  } finally {
    app.cleanup();
  }
});

test('kiểm toán: phân loại nhật ký; lệnh bị chặn; việc giao bởi lịch không tính là giám đốc', () => {
  assert.equal(auditOf({ kind: 'plan.approved', level: 'info', msg: 'x', ts: 't' })?.actor, 'director');
  assert.equal(auditOf({ kind: 'task.created', level: 'info', msg: 'x', ts: 't', data: { routineId: 'r1' } })?.actor, 'system');
  assert.equal(auditOf({ kind: 'task.resumed', level: 'info', msg: 'x', ts: 't', data: { auto: true } })?.actor, 'system');
  assert.equal(auditOf({ kind: 'accept.done', level: 'info', msg: 'x', ts: 't', agentId: 'cto' })?.actor, 'cto');
  assert.equal(auditOf({ kind: 'tool.call', level: 'warn', msg: 'x', ts: 't', data: { error: 'Lệnh bị chặn theo chính sách' } })?.cat, 'security');
  assert.equal(auditOf({ kind: 'tool.call', level: 'info', msg: 'x', ts: 't', data: {} }), null);
  assert.equal(auditOf({ kind: 'call.end', level: 'info', msg: 'x', ts: 't' }), null);
  // review UX-4d: đúng người thao tác
  assert.equal(auditOf({ kind: 'task.created', level: 'info', msg: 'x', ts: 't', data: { routineId: 'r1', routineManual: true } })?.actor, 'director', '"▶ Chạy ngay" là giám đốc');
  assert.equal(auditOf({ kind: 'routine.run', level: 'info', msg: 'x', ts: 't', data: { manual: true } })?.actor, 'director');
  assert.equal(auditOf({ kind: 'routine.run', level: 'info', msg: 'x', ts: 't', data: { manual: false } })?.actor, 'system');
  assert.equal(auditOf({ kind: 'task.resumed', level: 'info', msg: 'x', ts: 't', data: { auto: false } })?.actor, 'director');
  assert.equal(auditOf({ kind: 'task.resumed', level: 'info', msg: 'x', ts: 't' })?.actor, 'unknown', 'nhật ký cũ không có data.auto → không đoán');
  assert.equal(auditOf({ kind: 'task.autoresume', level: 'warn', msg: 'x', ts: 't' })?.label, 'Tự tiếp tục thất bại');
  // sự kiện trước đây bị sót
  assert.equal(auditOf({ kind: 'alert.checks.regression', level: 'warn', msg: 'x', ts: 't' })?.cat, 'security');
  assert.equal(auditOf({ kind: 'tool.call', level: 'warn', msg: 'x', ts: 't', data: { error: 'CCoding chặn lệnh: agent không được push' } })?.cat, 'security', 'lệnh bị hook Claude Code chặn');
  assert.deepEqual([auditOf({ kind: 'budget.update', level: 'info', msg: 'x', ts: 't' })?.cat, auditOf({ kind: 'budget.update', level: 'info', msg: 'x', ts: 't' })?.actor], ['decision', 'director']);
  assert.equal(auditOf({ kind: 'project.deleted', level: 'info', msg: 'x', ts: 't' })?.cat, 'config');
});

test('việc định kỳ (review): giữ dự án ở mọi chế độ — không hạ nhãn dữ liệu; tắt được khi dự án đã xóa; lần trước bị gián đoạn không chặn; tạm dừng chờ xử lý thì nêu rõ', async () => {
  const app = testApp();
  try {
    const R = app.routines;
    app.store.saveProject({ id: 'sec', name: 'Dự án mật', department: 'research', classification: 'restricted', createdAt: new Date().toISOString() } as never);
    // nhiệm vụ giao tay chế độ phòng ban trong dự án "Hạn chế" → việc định kỳ cũng phải mang dự án đó
    const r = R.upsert({ name: 'Mật hằng ngày', schedule: { kind: 'daily', time: '08:00' }, template: { brief: 'Viết đề cương', mode: 'department', department: 'research', projectId: 'sec', options: { discussionRounds: 0 } } });
    assert.equal(r.template.projectId, 'sec');
    const { taskId } = R.run(r.id, { manual: true });
    const t = app.store.get(taskId)!;
    assert.deepEqual([t.projectId, t.classification], ['sec', 'restricted']);
    app.orchestrator.cancel(taskId);
    await app.orchestrator.waitFor(taskId);
    assert.ok(app.logs.query({ limit: 200 }).some((e) => e.kind === 'task.created' && e.taskId === taskId && (e.data as { routineManual?: boolean }).routineManual === true));
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'daily', time: '08:00' }, template: { brief: 'x', projectId: 'khong-co' } }), /không còn/);
    // dự án bị xóa: sửa mẫu thì báo lỗi, nhưng TẮT luôn được (không lỗi mãi mỗi lần tới lịch)
    app.store.removeProject('sec');
    assert.throws(() => R.upsert({ name: 'Đổi tên' }, r.id), /không còn/);
    const off = R.upsert({ enabled: false }, r.id);
    assert.equal(off.enabled, false);
    assert.equal(R.get(r.id)!.nextRunAt, undefined);
    assert.equal(R.get(r.id)!.enabled, false);
    assert.throws(() => R.upsert({ enabled: true }, r.id), /không còn/, 'bật lại thì phải sửa mẫu trước');
    // dữ liệu vào
    assert.throws(() => R.upsert(null as never), /không hợp lệ/);
    assert.throws(() => R.upsert({ name: 'A', schedule: { kind: 'daily', time: '08:00' }, template: { brief: 'x', mode: 'agent', agentId: 'orchestrator' } }), /thuộc một phòng ban/);

    // lần trước bị gián đoạn (server khởi động lại) → không chặn lần mới
    const r2 = R.upsert({ name: 'B', schedule: { kind: 'interval', everyHours: 1 }, template: { brief: 'Viết đề cương', mode: 'department', department: 'research', options: { discussionRounds: 0 } } });
    const first = R.run(r2.id);
    await app.orchestrator.waitFor(first.taskId);
    const ft = app.store.get(first.taskId)!;
    ft.status = 'paused';
    ft.pause = { reason: 'interrupted', detail: 'Bị gián đoạn', at: new Date().toISOString() };
    app.store.put(ft, true);
    const second = R.run(r2.id);
    assert.notEqual(second.taskId, first.taskId);
    await app.orchestrator.waitFor(second.taskId);
    // tạm dừng chờ giám đốc (hết ngân sách) → vẫn chặn, lý do nói rõ cần xử lý
    const st = app.store.get(second.taskId)!;
    st.status = 'paused';
    st.pause = { reason: 'budget', detail: 'Hết ngân sách', at: new Date().toISOString() };
    app.store.put(st, true);
    assert.throws(() => R.run(r2.id), /hết ngân sách.*cần xử lý/);
    R.get(r2.id)!.nextRunAt = new Date(Date.now() - 60_000).toISOString();
    assert.equal(R.tick(), 0);
    assert.match(R.get(r2.id)!.lastSkip!.reason, /cần xử lý/);

    // routines.json sai dạng không làm hỏng việc tạo app (mọi lệnh CLI)
    fs.writeFileSync(path.join(app.config.dataDir, 'routines.json'), '{}');
    assert.equal(new Routines(app.config.dataDir, { store: app.store, registry: app.registry, logs: app.logs, orchestrator: app.orchestrator }).all().length, 0);
  } finally {
    app.cleanup();
  }
});

test('API: kiểm toán, kiểm chuỗi băm, sản phẩm, kỹ năng & kết nối, việc định kỳ', async () => {
  const app = testApp();
  const s0 = createServer(app);
  await new Promise<void>((r) => s0.listen(0, '127.0.0.1', r));
  const port = (s0.address() as AddressInfo).port;
  s0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  const post = (p: string, body: unknown) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API quản lý hồ sơ có phân quyền, log kiểm toán, test và tài liệu', mode: 'department', department: 'dev', options: { discussionRounds: 0 } });
    await app.orchestrator.waitFor(t.id);
    const au = (await (await fetch(`${base}/api/audit?limit=50`)).json()) as { rows: Array<{ kind: string; cat: string; taskId?: string }>; counts: Record<string, number> };
    assert.ok(au.rows.some((r) => r.kind === 'task.created' && r.taskId === t.id));
    assert.ok(au.rows.some((r) => r.kind === 'accept.done'));
    assert.ok(au.rows.every((r) => r.kind !== 'call.end'), 'chỉ sự kiện kiểm toán');
    const dec = (await (await fetch(`${base}/api/audit?cat=decision`)).json()) as { rows: Array<{ cat: string }> };
    assert.ok(dec.rows.length >= 1 && dec.rows.every((r) => r.cat === 'decision'));
    const v = (await (await fetch(`${base}/api/audit/verify`)).json()) as { ok: boolean; lines: number };
    assert.equal(v.ok, true);
    assert.ok(v.lines > 10);

    const ar = (await (await fetch(`${base}/api/artifacts`)).json()) as { total: number; items: Array<{ kind: string; taskId: string; path?: string; seq?: number }> };
    const mine = ar.items.filter((a) => a.taskId === t.id);
    assert.ok(mine.some((a) => a.kind === 'report' && a.path === 'FINAL.md'));
    assert.ok(mine.some((a) => a.kind === 'acceptance' && a.path === 'ACCEPTANCE.md'));
    assert.ok(mine.filter((a) => a.kind === 'output').length >= 1);
    assert.equal(mine[0].seq, 1);
    const onlyRep = (await (await fetch(`${base}/api/artifacts?kind=report`)).json()) as { items: Array<{ kind: string }> };
    assert.ok(onlyRep.items.every((a) => a.kind === 'report'));
    // tệp sản phẩm mở được qua API cũ
    const out = mine.find((a) => a.kind === 'output')!;
    assert.equal((await fetch(`${base}/api/tasks/${t.id}/file?path=${encodeURIComponent(out.path!)}`)).status, 200);

    const sk = (await (await fetch(`${base}/api/skills`)).json()) as { skills: Array<{ name: string; agents: string[] }>; tools: Array<{ name: string; agents: string[] }>; runtimes: Array<{ id: string }> };
    assert.ok(sk.skills.find((x) => x.name === 'acceptance')?.agents.includes('cto'));
    assert.ok(sk.tools.find((x) => x.name === 'Read')!.agents.length >= 10);
    assert.ok(sk.runtimes.some((r) => r.id === 'mock'));

    assert.equal((await post('/api/routines', { name: 'x', schedule: { kind: 'daily', time: '99:00' }, template: { brief: 'y' } })).status, 400);
    const cr = await post('/api/routines', { name: 'Báo cáo tuần', schedule: { kind: 'weekly', time: '09:00', days: [1] }, template: { brief: 'Tổng hợp tiến độ tuần', mode: 'department', department: 'research', options: { discussionRounds: 0 } } });
    assert.equal(cr.status, 201);
    const routine = (await cr.json()) as Routine;
    const list = (await (await fetch(`${base}/api/routines`)).json()) as Array<Routine & { scheduleText: string }>;
    assert.equal(list[0].scheduleText, 'T2 lúc 09:00');
    const run = await post(`/api/routines/${routine.id}/run`, {});
    assert.equal(run.status, 201);
    const { taskId } = (await run.json()) as { taskId: string };
    assert.equal(app.store.get(taskId)?.routineId, routine.id);
    assert.equal((await post(`/api/routines/${routine.id}/run`, {})).status, 409, 'lần trước chưa xong');
    assert.equal((await post('/api/routines/khong-co/run', {})).status, 404);
    assert.equal((await fetch(base + '/api/routines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })).status, 400);
    await app.orchestrator.waitFor(taskId);
    assert.equal((await post(`/api/routines/${routine.id}`, { enabled: false })).status, 200);
    assert.equal((await post('/api/routines/khong-co', { name: 'z' })).status, 404);
    assert.equal((await fetch(`${base}/api/routines/${routine.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/routines/${routine.id}`, { method: 'DELETE' })).status, 404);
    // "Xem thêm cũ hơn": nhiều sự kiện cùng mốc thời gian không bị rơi khi phân trang
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) app.logs.write({ ts, level: 'info', kind: 'kpi.finding', msg: `u${i}` });
    const all = (await (await fetch(`${base}/api/audit?q=u&cat=config&limit=2000`)).json()) as { rows: Array<{ seq: number; msg: string }> };
    const pages: string[] = [];
    let cursor: number | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const pg = (await (await fetch(`${base}/api/audit?q=u&cat=config&limit=2${cursor !== undefined ? `&beforeSeq=${cursor}` : ''}`)).json()) as { rows: Array<{ seq: number; msg: string }> };
      if (!pg.rows.length) break;
      pages.push(...pg.rows.map((x) => x.msg));
      cursor = pg.rows.at(-1)!.seq;
    }
    assert.deepEqual(pages, all.rows.map((x) => x.msg));
    assert.ok(['u4', 'u3', 'u2', 'u1', 'u0'].every((m) => pages.includes(m)));
    assert.ok(((await (await fetch(`${base}/api/audit?limit=abc`)).json()) as { rows: unknown[] }).rows.length > 0, 'limit sai → mặc định');
    assert.ok(((await (await fetch(`${base}/api/artifacts?limit=abc`)).json()) as { items: unknown[] }).items.length > 0);
    // xóa dự án: có dòng kiểm toán; không có thì 404
    app.store.saveProject({ id: 'tmpp', name: 'Tạm', department: 'dev', classification: 'internal', createdAt: new Date().toISOString() } as never);
    assert.equal((await fetch(`${base}/api/projects/tmpp`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/projects/tmpp`, { method: 'DELETE' })).status, 404);
    assert.ok(((await (await fetch(`${base}/api/audit?cat=config`)).json()) as { rows: Array<{ kind: string }> }).rows.some((x) => x.kind === 'project.deleted'));
    // routineId không đặt được qua API giao việc
    const r2 = await post('/api/tasks', { brief: 'Viết đề cương', mode: 'department', department: 'research', routineId: 'gia-mao' });
    const t2 = (await r2.json()) as { id: string; routineId?: string };
    assert.equal(t2.routineId, undefined);
    await app.orchestrator.waitFor(t2.id);
  } finally {
    srv.close();
    app.cleanup();
  }
});
