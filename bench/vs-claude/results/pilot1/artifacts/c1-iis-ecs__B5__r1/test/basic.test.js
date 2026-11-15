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

test('multiple #Fields, dashes, mismatches, mapping', () => {
  const log = [
    '2026-10-01 00:00:00 1.1.1.1 GET', // before fields: skipped
    '#Fields: date time s-ip s-port cs-uri-query cs(User-Agent) time-taken cs-username',
    '2026-10-01 08:15:02 10.0.0.1 80 a=1 Mozilla/5.0+(X11) 12 -',
    '',
    '2026-10-01 08:15:03 10.0.0.1 80 -',
    '#Fields: c-ip cs-method',
    '9.9.9.9 POST',
  ].join('\r\n');
  const out = parseIisLog(log);
  assert.deepEqual(out, [
    {
      '@timestamp': '2026-10-01T08:15:02.000Z',
      server: { ip: '10.0.0.1', port: 80 },
      url: { query: 'a=1' },
      user_agent: { original: 'Mozilla/5.0 (X11)' },
      event: { duration: 12000000 },
    },
    { client: { ip: '9.9.9.9' }, http: { request: { method: 'POST' } } },
  ]);
});
