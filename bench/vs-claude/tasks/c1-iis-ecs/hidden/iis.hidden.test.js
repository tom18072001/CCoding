import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const H1 = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken';
test('full field mapping', () => {
  const r = parseIisLog(`${H1}\n2026-10-01 23:59:59 192.168.1.10 POST /api/login a=1&b=2 443 bob 10.1.1.1 Mozilla/5.0+(Windows+NT+10.0) 401 15\n`)[0];
  assert.equal(r['@timestamp'], '2026-10-01T23:59:59.000Z');
  assert.equal(r.server.ip, '192.168.1.10');
  assert.equal(r.server.port, 443);
  assert.equal(r.user.name, 'bob');
  assert.equal(r.url.query, 'a=1&b=2');
  assert.equal(r.user_agent.original, 'Mozilla/5.0 (Windows NT 10.0)');
  assert.equal(r.http.response.status_code, 401);
  assert.equal(r.event.duration, 15000000);
});
test('dash means absent key', () => {
  const r = parseIisLog(`${H1}\n2026-10-01 00:00:00 192.168.1.10 GET / - 80 - 10.1.1.1 - 200 0\n`)[0];
  assert.equal(r.url.query, undefined);
  assert.equal(r.user, undefined);
  assert.equal(r.user_agent, undefined);
  assert.equal(r.event.duration, 0);
});
test('fields directive changes mid file', () => {
  const log = `#Fields: date time c-ip sc-status\n2026-10-01 01:00:00 1.1.1.1 200\n#Date: 2026-10-01\n#Fields: date time sc-status c-ip cs-method\n2026-10-01 02:00:00 503 2.2.2.2 GET\n`;
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[1].client.ip, '2.2.2.2');
  assert.equal(out[1].http.response.status_code, 503);
  assert.equal(out[1].http.request.method, 'GET');
});
test('skips lines before fields, malformed lines, blanks, CRLF', () => {
  const log = `2026-10-01 01:00:00 1.1.1.1 200\r\n#Fields: date time c-ip sc-status\r\n\r\n2026-10-01 01:00:00 1.1.1.1\r\n2026-10-01 01:00:01 1.1.1.2 404\r\n`;
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.ip, '1.1.1.2');
});
test('status and port are numbers, nested objects not dotted keys', () => {
  const r = parseIisLog('#Fields: date time sc-status s-port\n2026-10-01 01:00:00 500 8080\n')[0];
  assert.strictEqual(r.http.response.status_code, 500);
  assert.strictEqual(r.server.port, 8080);
  assert.equal(Object.keys(r).some((k) => k.includes('.') ), false);
});
test('unknown fields ignored', () => {
  const r = parseIisLog('#Fields: date time sc-substatus sc-win32-status c-ip\n2026-10-01 01:00:00 0 0 9.9.9.9\n')[0];
  assert.deepEqual(Object.keys(r).sort(), ['@timestamp', 'client']);
});
