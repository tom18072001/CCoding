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

test('full mapping, multiple #Fields, skips and dashes', () => {
  const log = [
    '2026-10-01 00:00:00 1.1.1.1 skipped-before-fields',
    '#Fields: date time s-ip cs-uri-query sc-status time-taken cs(User-Agent) cs-username s-port',
    '2026-10-01 08:15:02 10.0.0.1 a=b 404 15 Mozilla/5.0+(X11) bob 443',
    '2026-10-01 08:15:03 10.0.0.1 - 200 1 - - 80',
    '2026-10-01 08:15:04 too few',
    '',
    '#Fields: c-ip cs-method',
    '9.9.9.9 POST',
  ].join('\r\n');
  const out = parseIisLog(log);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], {
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.1', port: 443 },
    url: { query: 'a=b' },
    http: { response: { status_code: 404 } },
    event: { duration: 15000000 },
    user_agent: { original: 'Mozilla/5.0 (X11)' },
    user: { name: 'bob' },
  });
  assert.equal(out[1].url, undefined);
  assert.equal(out[1].user, undefined);
  assert.deepEqual(out[2], { client: { ip: '9.9.9.9' }, http: { request: { method: 'POST' } } });
});
