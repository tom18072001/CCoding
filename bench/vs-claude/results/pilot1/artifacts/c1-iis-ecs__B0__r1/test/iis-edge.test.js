import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const allKeys = (o, acc = []) => {
  for (const k of Object.keys(o)) {
    acc.push(k);
    if (o[k] && typeof o[k] === 'object') allKeys(o[k], acc);
  }
  return acc;
};

test('(a) multiple #Fields blocks use their own column order', () => {
  const log = [
    '#Fields: date time c-ip cs-method',
    '2026-10-01 08:00:00 10.0.0.1 GET',
    '#Fields: cs-method c-ip time date',
    'POST 10.0.0.2 09:30:00 2026-10-02',
  ].join('\n');
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0]['@timestamp'], '2026-10-01T08:00:00.000Z');
  assert.equal(out[0].client.ip, '10.0.0.1');
  assert.equal(out[0].http.request.method, 'GET');
  assert.equal(out[1]['@timestamp'], '2026-10-02T09:30:00.000Z');
  assert.equal(out[1].client.ip, '10.0.0.2');
  assert.equal(out[1].http.request.method, 'POST');
});

test('(b) other directives and blank lines are ignored', () => {
  const log = '#Software: IIS\n#Version: 1.0\n#Date: 2026-10-01 00:00:00\n\n#Fields: c-ip cs-method\n\n10.0.0.1 GET\n\n   \n10.0.0.2 PUT\n';
  const out = parseIisLog(log);
  assert.deepEqual(out.map((r) => r.client.ip), ['10.0.0.1', '10.0.0.2']);
});

test('(c) data lines before #Fields are skipped', () => {
  const log = '10.0.0.9 GET\n#Fields: c-ip cs-method\n10.0.0.1 GET\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '10.0.0.1');
});

test('(d) lines with wrong column count are skipped, others kept', () => {
  const log = '#Fields: c-ip cs-method cs-uri-stem\n10.0.0.1 GET /a\n10.0.0.2 GET\n10.0.0.3 GET /c extra\n10.0.0.4 GET /d\n';
  const out = parseIisLog(log);
  assert.deepEqual(out.map((r) => r.client.ip), ['10.0.0.1', '10.0.0.4']);
});

test('(e) "-" omits key and leaves no empty parent object', () => {
  const log = '#Fields: c-ip cs-uri-stem cs-uri-query cs-username\n10.0.0.1 /a - -\n';
  const [out] = parseIisLog(log);
  assert.equal('query' in out.url, false);
  assert.equal(out.url.path, '/a');
  assert.equal('user' in out, false);
});

test('(f) all mappings, numeric types and duration', () => {
  const log = '#Fields: date time s-ip s-port c-ip cs-method cs-uri-stem cs-uri-query cs-username sc-status time-taken\n' +
    '2026-10-01 08:15:02 10.0.0.2 443 10.0.0.5 GET /search q=1 alice 404 15\n' +
    '2026-10-01 08:15:03 10.0.0.2 80 10.0.0.5 GET /x - bob 200 0\n';
  const out = parseIisLog(log);
  assert.deepEqual(out[0], {
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.2', port: 443 },
    client: { ip: '10.0.0.5' },
    http: { request: { method: 'GET' }, response: { status_code: 404 } },
    url: { path: '/search', query: 'q=1' },
    user: { name: 'alice' },
    event: { duration: 15000000 },
  });
  assert.equal(typeof out[0].server.port, 'number');
  assert.equal(typeof out[0].http.response.status_code, 'number');
  assert.equal(out[1].event.duration, 0);
  assert.equal(out[1].server.port, 80);
});

test('(g) every + in User-Agent becomes a space', () => {
  const log = '#Fields: cs(User-Agent)\nMozilla/5.0+(Windows+NT+10.0;+Win64)+AppleWebKit/537.36\n';
  const [out] = parseIisLog(log);
  assert.equal(out.user_agent.original, 'Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36');
});

test('(h) CRLF line endings', () => {
  const log = '#Fields: c-ip cs-method\r\n10.0.0.1 GET\r\n10.0.0.2 POST\r\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0].http.request.method, 'GET');
  assert.equal(out[1].http.request.method, 'POST');
});

test('(i) output is nested with no dotted keys', () => {
  const log = '#Fields: date time s-ip s-port c-ip cs-method cs-uri-stem cs-uri-query cs-username sc-status time-taken cs(User-Agent)\n' +
    '2026-10-01 08:15:02 10.0.0.2 443 10.0.0.5 GET /s q=1 alice 200 5 curl/8+x\n';
  const [out] = parseIisLog(log);
  const keys = allKeys(out);
  assert.ok(keys.length > 10);
  assert.deepEqual(keys.filter((k) => k.includes('.')), []);
  assert.equal(typeof out.http, 'object');
});

test('(j) unknown fields are ignored', () => {
  const log = '#Fields: c-ip foo-bar cs-method sc-substatus\n10.0.0.1 zzz GET 0\n';
  const out = parseIisLog(log);
  assert.deepEqual(out, [{ client: { ip: '10.0.0.1' }, http: { request: { method: 'GET' } } }]);
});
