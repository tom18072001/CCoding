import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const hasDotKey = (o) =>
  o !== null && typeof o === 'object' &&
  Object.entries(o).some(([k, v]) => k.includes('.') || hasDotKey(v));

test('empty input returns []', () => {
  assert.deepEqual(parseIisLog(''), []);
  assert.deepEqual(parseIisLog('\n\n'), []);
});

test('multiple #Fields with different column order', () => {
  const log = [
    '#Fields: date time c-ip sc-status',
    '2026-10-01 08:15:02 10.0.0.5 200',
    '#Fields: sc-status cs-method date time',
    '404 POST 2026-10-02 01:02:03',
  ].join('\n');
  assert.deepEqual(parseIisLog(log), [
    { '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '10.0.0.5' }, http: { response: { status_code: 200 } } },
    { '@timestamp': '2026-10-02T01:02:03.000Z', http: { request: { method: 'POST' }, response: { status_code: 404 } } },
  ]);
});

test('lines before #Fields are skipped', () => {
  const log = '2026-10-01 08:15:02 10.0.0.5 GET\n#Fields: date time c-ip cs-method\n2026-10-01 08:15:03 10.0.0.6 PUT\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '10.0.0.6');
});

test('column count mismatch is skipped', () => {
  const log = '#Fields: date time c-ip cs-method\n2026-10-01 08:15:02 10.0.0.5\n2026-10-01 08:15:02 10.0.0.5 GET extra\n2026-10-01 08:15:02 10.0.0.7 GET\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '10.0.0.7');
});

test('other directives and blank lines are ignored', () => {
  const log = '#Software: X\n#Version: 1.0\n\n#Date: 2026-10-01 00:00:00\n#Fields: date time c-ip\n\n2026-10-01 08:15:02 10.0.0.5\n\n';
  assert.equal(parseIisLog(log).length, 1);
});

test('dash omits key entirely', () => {
  const log = '#Fields: date time c-ip cs-uri-query cs-username sc-status\n2026-10-01 08:15:02 10.0.0.5 - - -\n';
  const [d] = parseIisLog(log);
  assert.deepEqual(d, { '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '10.0.0.5' } });
  assert.ok(!('url' in d));
  assert.ok(!('user' in d));
});

test('full mapping with types', () => {
  const log = '#Fields: date time s-ip s-port c-ip cs-method cs-uri-stem cs-uri-query cs-username cs(User-Agent) sc-status time-taken\n' +
    '2026-10-01 08:15:02 192.0.2.1 443 10.0.0.5 GET /a/b q=1&r=2 alice Mozilla/5.0+(X11;+Linux) 302 125\n';
  const [d] = parseIisLog(log);
  assert.deepEqual(d, {
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '192.0.2.1', port: 443 },
    client: { ip: '10.0.0.5' },
    http: { request: { method: 'GET' }, response: { status_code: 302 } },
    url: { path: '/a/b', query: 'q=1&r=2' },
    user: { name: 'alice' },
    user_agent: { original: 'Mozilla/5.0 (X11; Linux)' },
    event: { duration: 125 * 1e6 },
  });
  assert.equal(typeof d.event.duration, 'number');
  assert.equal(typeof d.server.port, 'number');
  assert.equal(typeof d.http.response.status_code, 'number');
  assert.ok(!hasDotKey(d));
});

test('time-taken 0 gives duration 0', () => {
  const [d] = parseIisLog('#Fields: date time time-taken\n2026-10-01 08:15:02 0\n');
  assert.strictEqual(d.event.duration, 0);
});

test('unknown fields are ignored', () => {
  const [d] = parseIisLog('#Fields: date time foo c-ip cs-bar\n2026-10-01 08:15:02 x 10.0.0.5 y\n');
  assert.deepEqual(d, { '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '10.0.0.5' } });
});

test('CRLF line endings', () => {
  const log = '#Fields: date time c-ip sc-status\r\n2026-10-01 08:15:02 10.0.0.5 200\r\n2026-10-01 08:15:03 10.0.0.6 500\r\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[1].http.response.status_code, 500);
  assert.equal(out[1].client.ip, '10.0.0.6');
});
