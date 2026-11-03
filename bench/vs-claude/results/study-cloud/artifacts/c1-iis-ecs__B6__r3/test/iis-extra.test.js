import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const FULL = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken';

function noDottedKeys(o) {
  for (const [k, v] of Object.entries(o)) {
    assert.ok(!k.includes('.'), `dotted key: ${k}`);
    if (v && typeof v === 'object') noDottedKeys(v);
  }
}

test('full line maps every field with correct types', () => {
  const out = parseIisLog(`${FULL}\n2026-10-01 08:15:02 10.0.0.1 POST /api/x q=1&b=2 443 alice 192.168.1.9 Mozilla/5.0 404 150\n`);
  assert.deepEqual(out, [{
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.1', port: 443 },
    http: { request: { method: 'POST' }, response: { status_code: 404 } },
    url: { path: '/api/x', query: 'q=1&b=2' },
    user: { name: 'alice' },
    client: { ip: '192.168.1.9' },
    user_agent: { original: 'Mozilla/5.0' },
    event: { duration: 150000000 },
  }]);
  const r = out[0];
  assert.equal(typeof r.http.response.status_code, 'number');
  assert.equal(typeof r.server.port, 'number');
  assert.equal(typeof r.event.duration, 'number');
  noDottedKeys(r);
});

test('plus signs in User-Agent become spaces (multiple)', () => {
  const out = parseIisLog('#Fields: date time cs(User-Agent)\n2026-10-01 00:00:00 Mozilla/5.0+(Windows+NT+10.0;+Win64;+x64)+AppleWebKit\n');
  assert.equal(out[0].user_agent.original, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit');
});

test('"-" values omit the key and empty parents are not created', () => {
  const out = parseIisLog(`${FULL}\n2026-10-01 08:15:02 10.0.0.1 GET /a - 80 - 1.2.3.4 - 200 5\n`);
  const r = out[0];
  assert.equal('user' in r, false);
  assert.equal('user_agent' in r, false);
  assert.equal('query' in r.url, false);
  assert.equal(r.url.path, '/a');
  assert.equal(r.event.duration, 5000000);
});

test('"-" for all children of a parent leaves no parent object', () => {
  const out = parseIisLog('#Fields: date time cs-username c-ip\n2026-10-01 08:15:02 - -\n');
  assert.deepEqual(out, [{ '@timestamp': '2026-10-01T08:15:02.000Z' }]);
});

test('multiple #Fields lines each apply to following lines', () => {
  const log = [
    '#Fields: date time c-ip sc-status',
    '2026-10-01 01:00:00 1.1.1.1 200',
    '#Fields: sc-status cs-method date time',
    '500 PUT 2026-10-02 02:30:00',
    '#Fields: date time cs-uri-stem',
    '2026-10-03 03:00:00 /z',
  ].join('\n');
  const out = parseIisLog(log);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { '@timestamp': '2026-10-01T01:00:00.000Z', client: { ip: '1.1.1.1' }, http: { response: { status_code: 200 } } });
  assert.deepEqual(out[1], { '@timestamp': '2026-10-02T02:30:00.000Z', http: { request: { method: 'PUT' }, response: { status_code: 500 } } });
  assert.deepEqual(out[2], { '@timestamp': '2026-10-03T03:00:00.000Z', url: { path: '/z' } });
});

test('other directives and blank lines are ignored', () => {
  const log = '#Software: IIS\n#Version: 1.0\n#Date: 2026-10-01 00:00:00\n\n#Fields: date time c-ip\n\n2026-10-01 00:00:01 1.1.1.1\n\n';
  assert.deepEqual(parseIisLog(log), [{ '@timestamp': '2026-10-01T00:00:01.000Z', client: { ip: '1.1.1.1' } }]);
});

test('lines with wrong column count are skipped', () => {
  const log = '#Fields: date time c-ip\n2026-10-01 00:00:01 1.1.1.1 extra\n2026-10-01 00:00:02\n2026-10-01 00:00:03 2.2.2.2\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '2.2.2.2');
});

test('lines before the first #Fields are skipped', () => {
  const log = '2026-10-01 00:00:00 9.9.9.9\n#Fields: date time c-ip\n2026-10-01 00:00:01 1.1.1.1\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '1.1.1.1');
});

test('unknown fields are ignored', () => {
  const out = parseIisLog('#Fields: date time foo c-ip cs-bytes\n2026-10-01 00:00:01 bar 1.1.1.1 123\n');
  assert.deepEqual(out, [{ '@timestamp': '2026-10-01T00:00:01.000Z', client: { ip: '1.1.1.1' } }]);
});

test('CRLF line endings', () => {
  const log = '#Software: IIS\r\n#Fields: date time c-ip sc-status\r\n2026-10-01 00:00:01 1.1.1.1 200\r\n2026-10-01 00:00:02 2.2.2.2 301\r\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0].http.response.status_code, 200);
  assert.equal(out[1].http.response.status_code, 301);
  assert.equal(out[1].client.ip, '2.2.2.2');
});

test('empty string returns []', () => {
  assert.deepEqual(parseIisLog(''), []);
});
