import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const F = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken';

test('dòng đầy đủ -> object lồng nhau, đúng kiểu, không key dấu chấm', () => {
  const out = parseIisLog(`${F}\n2026-10-01 08:15:02 10.0.0.1 GET /a q=1 443 alice 10.0.0.5 Mozilla/5.0+(Windows+NT+10.0) 200 15\n`);
  assert.deepEqual(out, [{
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.1', port: 443 },
    client: { ip: '10.0.0.5' },
    http: { request: { method: 'GET' }, response: { status_code: 200 } },
    url: { path: '/a', query: 'q=1' },
    user: { name: 'alice' },
    user_agent: { original: 'Mozilla/5.0 (Windows NT 10.0)' },
    event: { duration: 15000000 },
  }]);
  assert.ok(!Object.keys(out[0]).some((k) => k !== '@timestamp' && k.includes('.')));
});

test('kiểu number', () => {
  const [r] = parseIisLog(`${F}\n2026-10-01 08:15:02 10.0.0.1 GET /a - 8080 - 10.0.0.5 - 404 15\n`);
  assert.strictEqual(r.event.duration, 15000000);
  assert.strictEqual(r.http.response.status_code, 404);
  assert.strictEqual(r.server.port, 8080);
});

test("'-' làm key biến mất, không còn field url thì không có object url", () => {
  const [a] = parseIisLog(`${F}\n2026-10-01 08:15:02 10.0.0.1 GET /a - 80 - 10.0.0.5 - 200 1\n`);
  assert.equal(a.url.path, '/a');
  assert.ok(!('query' in a.url));
  assert.ok(!('user' in a));
  assert.ok(!('user_agent' in a));
  const [b] = parseIisLog(`${F}\n2026-10-01 08:15:02 10.0.0.1 GET - - 80 - 10.0.0.5 - 200 1\n`);
  assert.ok(!('url' in b));
});

test('nhiều #Fields đổi thứ tự/số cột', () => {
  const log = [
    '#Fields: date time c-ip',
    '2026-10-01 08:00:00 1.1.1.1',
    '#Fields: sc-status cs-method time date',
    '500 POST 09:00:00 2026-10-02',
  ].join('\n');
  assert.deepEqual(parseIisLog(log), [
    { '@timestamp': '2026-10-01T08:00:00.000Z', client: { ip: '1.1.1.1' } },
    { '@timestamp': '2026-10-02T09:00:00.000Z', http: { request: { method: 'POST' }, response: { status_code: 500 } } },
  ]);
});

test('directive khác và dòng trống bị bỏ qua', () => {
  const log = '#Software: X\n#Version: 1.0\n#Date: 2026-10-01 00:00:00\n\n#Fields: c-ip cs-method\n\n1.1.1.1 GET\n\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '1.1.1.1' }, http: { request: { method: 'GET' } } }]);
});

test('dòng trước #Fields bị bỏ', () => {
  const log = '1.1.1.1 GET\n#Fields: c-ip cs-method\n2.2.2.2 PUT\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '2.2.2.2' }, http: { request: { method: 'PUT' } } }]);
});

test('dòng sai số cột bị bỏ', () => {
  const log = '#Fields: c-ip cs-method\n1.1.1.1\n1.1.1.1 GET extra\n3.3.3.3 GET\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '3.3.3.3' }, http: { request: { method: 'GET' } } }]);
});

test('field không biết bị bỏ qua', () => {
  const log = '#Fields: c-ip x-custom cs-method\n1.1.1.1 zzz GET\n';
  assert.deepEqual(parseIisLog(log), [{ client: { ip: '1.1.1.1' }, http: { request: { method: 'GET' } } }]);
});

test('log CRLF', () => {
  const log = '#Software: X\r\n#Fields: date time c-ip cs-username\r\n2026-10-01 08:15:02 1.1.1.1 bob\r\n';
  assert.deepEqual(parseIisLog(log), [{ '@timestamp': '2026-10-01T08:15:02.000Z', client: { ip: '1.1.1.1' }, user: { name: 'bob' } }]);
});

test('chuỗi rỗng -> []', () => {
  assert.deepEqual(parseIisLog(''), []);
});
