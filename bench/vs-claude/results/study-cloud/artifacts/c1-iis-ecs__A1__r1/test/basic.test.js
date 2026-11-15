import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

test('parses one basic line', () => {
  const log = '#Software: Microsoft Internet Information Services 10.0\n#Fields: date time c-ip cs-method cs-uri-stem sc-status\n2026-10-01 08:15:02 10.0.0.5 GET /index.html 200\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 1);
  assert.equal(out[0]['@timestamp'], '2026-10-01T08:15:02.000Z');
  assert.equal(out[0].client.ip, '10.0.0.5');
  assert.equal(out[0].http.request.method, 'GET');
  assert.equal(out[0].url.path, '/index.html');
  assert.equal(out[0].http.response.status_code, 200);
});

test('full mapping, multiple #Fields, skipping, CRLF', () => {
  const log = [
    '2026-10-01 00:00:00 before fields',
    '#Fields: date time s-ip s-port cs-uri-query time-taken cs(User-Agent) cs-username bogus',
    '2026-10-01 08:15:02 1.1.1.1 80 a=b 15 Mozilla/5.0+(X11) bob x',
    '2026-10-01 08:15:03 1.1.1.1 80 - 5 - - x',
    'too few columns',
    '',
    '#Fields: c-ip sc-status',
    '9.9.9.9 404',
  ].join('\r\n');
  const out = parseIisLog(log);
  assert.deepEqual(out, [
    { '@timestamp': '2026-10-01T08:15:02.000Z', server: { ip: '1.1.1.1', port: 80 }, url: { query: 'a=b' },
      event: { duration: 15e6 }, user_agent: { original: 'Mozilla/5.0 (X11)' }, user: { name: 'bob' } },
    { '@timestamp': '2026-10-01T08:15:03.000Z', server: { ip: '1.1.1.1', port: 80 }, event: { duration: 5e6 } },
    { client: { ip: '9.9.9.9' }, http: { response: { status_code: 404 } } },
  ]);
});
