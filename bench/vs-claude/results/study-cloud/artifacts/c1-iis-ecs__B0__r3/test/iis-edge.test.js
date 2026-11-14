import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const FULL = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken';

test('maps every field with correct types', () => {
  const out = parseIisLog(`${FULL}\n2026-10-01 08:15:02 10.0.0.1 POST /a/b q=1 443 alice 10.0.0.5 Mozilla/5.0+(Windows+NT) 404 125\n`);
  assert.deepEqual(out, [{
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.1', port: 443 },
    client: { ip: '10.0.0.5' },
    http: { request: { method: 'POST' }, response: { status_code: 404 } },
    url: { path: '/a/b', query: 'q=1' },
    event: { duration: 125000000 },
    user_agent: { original: 'Mozilla/5.0 (Windows NT)' },
    user: { name: 'alice' },
  }]);
  assert.equal(typeof out[0].http.response.status_code, 'number');
  assert.equal(typeof out[0].server.port, 'number');
  assert.equal(typeof out[0].event.duration, 'number');
});

test('dash values omit keys', () => {
  const out = parseIisLog(`${FULL}\n2026-10-01 08:15:02 10.0.0.1 GET /x - 80 - 10.0.0.5 - 200 0\n`);
  assert.equal('query' in out[0].url, false);
  assert.equal('user' in out[0], false);
  assert.equal('user_agent' in out[0], false);
  assert.equal(out[0].event.duration, 0);
});

test('multiple #Fields with different column order', () => {
  const log = [
    '#Fields: date time c-ip sc-status',
    '2026-10-01 00:00:01 1.1.1.1 200',
    '#Fields: sc-status cs-method time date c-ip',
    '500 PUT 00:00:02 2026-10-02 2.2.2.2',
    '',
  ].join('\n');
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0]['@timestamp'], '2026-10-01T00:00:01.000Z');
  assert.equal(out[0].client.ip, '1.1.1.1');
  assert.equal(out[1]['@timestamp'], '2026-10-02T00:00:02.000Z');
  assert.equal(out[1].http.response.status_code, 500);
  assert.equal(out[1].http.request.method, 'PUT');
  assert.equal(out[1].client.ip, '2.2.2.2');
});

test('skips pre-Fields lines, mismatched lines, blanks and other directives', () => {
  const log = [
    '2026-10-01 00:00:00 9.9.9.9 200',
    '#Software: Microsoft Internet Information Services 10.0',
    '#Version: 1.0',
    '#Date: 2026-10-01 00:00:00',
    '',
    '#Fields: date time c-ip sc-status',
    '2026-10-01 00:00:01 1.1.1.1 200',
    '2026-10-01 00:00:02 1.1.1.1',
    '2026-10-01 00:00:03 1.1.1.1 200 extra',
    '',
    '2026-10-01 00:00:04 3.3.3.3 301',
  ].join('\n');
  const out = parseIisLog(log);
  assert.deepEqual(out.map((o) => o.client.ip), ['1.1.1.1', '3.3.3.3']);
});

test('handles CRLF line endings', () => {
  const log = '#Fields: date time c-ip sc-status\r\n2026-10-01 08:15:02 10.0.0.5 200\r\n2026-10-01 08:15:03 10.0.0.6 -\r\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0].http.response.status_code, 200);
  assert.equal('http' in out[1], false);
  assert.equal(out[1].client.ip, '10.0.0.6');
});

test('unknown fields ignored and no dotted keys at root', () => {
  const out = parseIisLog('#Fields: date time sc-bytes c-ip cs-method\n2026-10-01 08:15:02 512 10.0.0.5 GET\n');
  assert.deepEqual(Object.keys(out[0]).sort(), ['@timestamp', 'client', 'http']);
  assert.equal(JSON.stringify(out[0]).includes('512'), false);
  for (const k of Object.keys(out[0])) assert.ok(k === '@timestamp' || !k.includes('.'));
});

test('empty input returns []', () => {
  assert.deepEqual(parseIisLog(''), []);
  assert.deepEqual(parseIisLog('\n\n'), []);
});

test('assumptions: trailing spaces in #Fields, no timestamp without date/time', () => {
  const out = parseIisLog('#Fields: date time c-ip  \n2026-10-01 08:15:02 1.1.1.1\n');
  assert.equal(out.length, 1);
  const out2 = parseIisLog('#Fields: date c-ip\n2026-10-01 1.1.1.1\n');
  assert.equal('@timestamp' in out2[0], false);
  assert.equal(out2[0].client.ip, '1.1.1.1');
});
