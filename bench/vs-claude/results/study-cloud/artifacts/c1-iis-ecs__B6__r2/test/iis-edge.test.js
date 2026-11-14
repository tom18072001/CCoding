import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const hasDotKey = (o) =>
  Object.entries(o).some(([k, v]) => k.includes('.') || (v && typeof v === 'object' && hasDotKey(v)));

test('empty input returns []', () => {
  assert.deepEqual(parseIisLog(''), []);
  assert.deepEqual(parseIisLog('\n\n'), []);
});

test('multiple #Fields with different column order', () => {
  const log = [
    '#Fields: date time c-ip cs-method',
    '2026-10-01 08:15:02 10.0.0.5 GET',
    '#Fields: cs-method sc-status date time',
    'POST 404 2026-10-02 01:02:03',
  ].join('\n');
  assert.deepEqual(parseIisLog(log), [
    { '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '10.0.0.5' }, http: { request: { method: 'GET' } } },
    { '@timestamp': '2026-10-02T01:02:03.000Z', http: { request: { method: 'POST' }, response: { status_code: 404 } } },
  ]);
});

test('lines before #Fields are skipped', () => {
  const log = '2026-10-01 08:15:02 10.0.0.5 GET\n#Fields: date time c-ip cs-method\n2026-10-01 08:15:03 10.0.0.6 PUT\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '10.0.0.6');
});

test('column count mismatch skipped', () => {
  const log = '#Fields: date time c-ip\n2026-10-01 08:15:02 1.1.1.1 extra\n2026-10-01 08:15:02\n2026-10-01 08:15:04 2.2.2.2\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '2.2.2.2');
});

test('other directives and blank lines ignored', () => {
  const log = '#Software: IIS\n#Version: 1.0\n#Date: 2026-10-01 00:00:00\n\n#Fields: c-ip\n\n1.2.3.4\n\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '1.2.3.4' } }]);
});

test('dash removes keys, including nested', () => {
  const log = '#Fields: date time c-ip cs-method cs-uri-query cs-username sc-status\n2026-10-01 08:15:02 1.2.3.4 GET - - -\n';
  const [r] = parseIisLog(log);
  assert.deepEqual(r, { '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '1.2.3.4' }, http: { request: { method: 'GET' } } });
  assert.equal('url' in r, false);
  assert.equal('user' in r, false);
  assert.equal('response' in r.http, false);
});

test('plus in user agent becomes space', () => {
  const log = '#Fields: cs(User-Agent)\nMozilla/5.0+(Windows+NT+10.0)+Gecko\n';
  assert.equal(parseIisLog(log)[0].user_agent.original, 'Mozilla/5.0 (Windows NT 10.0) Gecko');
});

test('numeric types and duration conversion', () => {
  const log = '#Fields: sc-status s-port time-taken s-ip cs-username\n200 443 15 10.1.1.1 alice\n';
  const [r] = parseIisLog(log);
  assert.strictEqual(r.http.response.status_code, 200);
  assert.strictEqual(r.server.port, 443);
  assert.strictEqual(r.event.duration, 15000000);
  assert.strictEqual(r.server.ip, '10.1.1.1');
  assert.strictEqual(r.user.name, 'alice');
});

test('unknown fields ignored', () => {
  const log = '#Fields: c-ip cs-host sc-bytes\n1.2.3.4 example.test 512\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '1.2.3.4' } }]);
});

test('output is nested with no dotted keys', () => {
  const log = '#Fields: date time s-ip c-ip cs-method cs-uri-stem cs-uri-query sc-status time-taken cs(User-Agent) cs-username s-port\n2026-10-01 08:15:02 1.1.1.1 2.2.2.2 GET /a q=1 200 15 UA+x bob 80\n';
  const [r] = parseIisLog(log);
  assert.equal(hasDotKey(r), false);
  assert.equal(r.url.query, 'q=1');
  assert.equal(r.http.request.method, 'GET');
});

test('CRLF line endings', () => {
  const log = '#Software: IIS\r\n#Fields: date time c-ip\r\n2026-10-01 08:15:02 1.2.3.4\r\n2026-10-01 08:15:03 1.2.3.5\r\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0].client.ip, '1.2.3.4');
  assert.equal(out[1]['@timestamp'], '2026-10-01T08:15:03.000Z');
});
