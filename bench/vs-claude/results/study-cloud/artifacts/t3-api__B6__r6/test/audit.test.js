'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

test('nhật ký: seq, at, changes; lỗi không ghi; /audit chỉ admin', async () => {
  let tick = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++)) });
  try {
    await app.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A', priority: 1 } }); // t13
    await app.call('PATCH', '/tasks/t13', { headers: as('u2'), body: { title: 'N', priority: 3, status: 'doing' } });
    await app.call('POST', '/tasks', { headers: as('u1'), body: { title: '', team: 'A' } }); // 400: không ghi
    await app.call('PATCH', '/tasks/t4', { headers: as('u2'), body: { title: 'x' } }); // 403: không ghi
    await app.call('DELETE', '/tasks/nope', { headers: as('u1') }); // 404: không ghi
    await app.call('DELETE', '/tasks/t13', { headers: as('u1') });
    const r = await app.call('GET', '/audit', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 3);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    const [del, upd, cre] = r.json.items;
    assert.deepEqual(cre, { seq: 1, at: cre.at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.equal(cre.at, new Date(Date.UTC(2026, 10, 1, 0, 0, 0)).toISOString().replace('00:00:00', cre.at.slice(11, 19)));
    assert.deepEqual(upd.changes, ['priority', 'status']); // title không đổi
    assert.equal(upd.action, 'update');
    assert.equal(upd.userId, 'u2');
    assert.deepEqual(del.changes, []);
    assert.equal(del.action, 'delete');
    assert.ok(Date.parse(del.at) > Date.parse(cre.at));

    const f = await app.call('GET', '/audit?taskId=t13', { headers: as('u1') });
    assert.equal(f.json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: as('u1') })).json.items.length, 0);
  } finally {
    await app.close();
  }
});

test('/audit: 403 cho không phải admin, 400 sau 401 và trước 403', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { headers: as('u2') })).status, 403);
    assert.equal((await app.call('GET', '/audit', { headers: as('u3') })).json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('GET', '/audit?x=1', { headers: as('u2') })).status, 400);
    assert.equal((await app.call('GET', '/audit?x=1')).status, 401);
    const dup = await app.call('GET', '/audit?taskId=a&taskId=b', { headers: as('u1') });
    assert.equal(dup.status, 400);
    assert.equal(dup.json.error.code, 'INVALID_QUERY');
  } finally {
    await app.close();
  }
});
