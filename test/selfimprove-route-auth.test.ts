import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { ROOT } from '../src/config.js';
import { createServer } from '../src/server.js';
import { actorFromToken, proposalStatus, recordDirector, recordProposed, type Deps } from '../src/selfimprove.js';
import { testApp } from './helpers.js';

// D13-K1 (sửa M1): route /api/selfimprove/* ghi người duyệt thật (actor từ server.token), không ghi cứng 'director'.

const TOKEN = 'tok-gia-cho-test-d13';
const meta = { pid: 'P-1', clusterId: 'CL-1', author: 'research-lead', labeledBy: ['methodologist'], kind: 'optimize' as const, hypothesis: 'thêm kiểm biên' };
const PATCH = 'diff --git a/src/prompts.ts b/src/prompts.ts\n--- a/src/prompts.ts\n+++ b/src/prompts.ts\n@@ -1 +1 @@\n-dòng-không-tồn-tại-trong-tệp-đích\n+Kiểm biên rỗng.\n';

type Ev = { kind: string; data?: Record<string, unknown> };
const readEvents = (file: string): Ev[] => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Ev) : []);

async function setup() {
  const app = testApp();
  const srv0 = createServer(app);
  await new Promise<void>((r) => srv0.listen(0, '127.0.0.1', r));
  const port = (srv0.address() as AddressInfo).port;
  srv0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  app.config.selfImprove = { ...app.config.selfImprove, enabled: true };
  const si: Deps = { cfg: app.config.selfImprove, logs: app.logs, dataDir: app.config.dataDir, root: ROOT };
  recordProposed('P-1', PATCH, meta, si);
  const post = (verb: string, auth?: string) =>
    fetch(`http://127.0.0.1:${port}/api/selfimprove/proposals/P-1/${verb}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: '{}' });
  const decisions = () => readEvents(app.logs.fileFor('system')).filter((e) => /^selfimprove\.(approved|rejected|applied|rollback\.confirmed|rolledback)$/.test(e.kind));
  return { app, srv, si, post, decisions, done: () => { srv.close(); app.cleanup(); } };
}

test('K1: thiếu token hoặc token sai ⇒ 401 tiếng Việt, không ghi sự kiện selfimprove.*', async () => {
  const t = await setup();
  t.app.config.server.token = TOKEN;
  try {
    for (const verb of ['approve', 'reject', 'apply', 'rollback-confirm']) {
      for (const auth of [undefined, 'Bearer sai-token']) {
        const r = await t.post(verb, auth);
        assert.equal(r.status, 401, `${verb} ${auth ?? '(không token)'}`);
        assert.match(((await r.json()) as { error: string }).error, /token/);
      }
    }
    assert.deepEqual(t.decisions(), []);
  } finally {
    t.done();
  }
});

test('K1: server.token chưa cấu hình ⇒ 403, không ghi sự kiện', async () => {
  const t = await setup();
  t.app.config.server.token = '';
  try {
    for (const verb of ['approve', 'reject', 'apply', 'rollback-confirm']) {
      const r = await t.post(verb);
      assert.equal(r.status, 403, verb);
      assert.equal(((await r.json()) as { error: string }).error, 'Chưa cấu hình server.token — không xác định được người duyệt');
    }
    assert.deepEqual(t.decisions(), []);
  } finally {
    t.done();
  }
});

test('K1: token đúng ⇒ ghi đúng actor { by: token-<8 hex sha256>, auth }, log không chứa token thô', async () => {
  const t = await setup();
  t.app.config.server.token = TOKEN;
  try {
    const r = await t.post('approve', `Bearer ${TOKEN}`);
    assert.equal(r.status, 200);
    const expectBy = `token-${crypto.createHash('sha256').update(TOKEN).digest('hex').slice(0, 8)}`;
    assert.deepEqual(actorFromToken(TOKEN), { by: expectBy, auth: 'server.token' });
    const ev = t.decisions();
    assert.equal(ev.length, 1);
    assert.equal(ev[0].kind, 'selfimprove.approved');
    assert.equal(ev[0].data?.by, expectBy);
    assert.equal(ev[0].data?.auth, 'server.token');
    assert.ok(!fs.readFileSync(t.app.logs.fileFor('system'), 'utf8').includes(TOKEN), 'log lộ token thô');
    const list = (await (await fetch(`http://127.0.0.1:${t.app.config.server.port}/api/selfimprove/proposals`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as Array<{ id: string; status: string }>;
    assert.equal(list.find((x) => x.id === 'P-1')!.status, 'approved');
  } finally {
    t.done();
  }
});

test('K1: hàm ghi từ chối khi thiếu actor; sự kiện by:director cũ vẫn đọc là approved (tương thích ngược trước D13)', async () => {
  const t = await setup();
  try {
    assert.throws(() => recordDirector('approved', 'P-1', t.si, undefined), /danh tính/);
    assert.throws(() => recordDirector('approved', 'P-1', t.si, { by: 'director', auth: 'server.token' }), /danh tính/);
    assert.deepEqual(t.decisions(), []);
    t.app.logs.write({ level: 'info', kind: 'selfimprove.approved', msg: 'cũ', data: { pid: 'P-1', by: 'director' } });
    const evs = readEvents(t.app.logs.fileFor('system')).filter((e) => e.data?.pid === 'P-1') as Parameters<typeof proposalStatus>[0];
    assert.equal(proposalStatus(evs), 'approved');
    // bản ghi giả mạo (by tự đặt, không có auth) không được tính là duyệt
    const fake = [{ kind: 'selfimprove.proposed', data: { pid: 'X' } }, { kind: 'selfimprove.approved', data: { pid: 'X', by: 'token-deadbeef' } }] as Parameters<typeof proposalStatus>[0];
    assert.equal(proposalStatus(fake), 'proposed');
  } finally {
    t.done();
  }
});
