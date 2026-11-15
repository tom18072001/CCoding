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

test('full mapping, dashes, multiple #Fields, skips', () => {
  const log = [
    '2026-10-01 00:00:00 skipped-before-fields',
    '#Fields: date time s-ip s-port cs-method cs-uri-query cs-username cs(User-Agent) sc-status time-taken x-unknown',
    '2026-10-01 08:15:02 1.1.1.1 80 GET q=1 bob Mozilla/5.0+(X11) 404 12 foo\r',
    '2026-10-01 08:15:03 1.1.1.1 80 GET - - - - 5 foo',
    '',
    'too few columns',
    '#Fields: date time c-ip',
    '2026-10-02 01:02:03 9.9.9.9',
  ].join('\n');
  const out = parseIisLog(log);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], {
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '1.1.1.1', port: 80 },
    http: { request: { method: 'GET' }, response: { status_code: 404 } },
    url: { query: 'q=1' },
    user: { name: 'bob' },
    user_agent: { original: 'Mozilla/5.0 (X11)' },
    event: { duration: 12000000 },
  });
  assert.deepEqual(out[1], {
    '@timestamp': '2026-10-01T08:15:03.000Z',
    server: { ip: '1.1.1.1', port: 80 },
    http: { request: { method: 'GET' } },
    event: { duration: 5000000 },
  });
  assert.deepEqual(out[2], { '@timestamp': '2026-10-02T01:02:03.000Z', client: { ip: '9.9.9.9' } });
});

test('field names matching Object.prototype members are ignored', () => {
  const out = parseIisLog('#Fields: constructor toString c-ip\na b 1.2.3.4\n');
  assert.deepEqual(out, [{ client: { ip: '1.2.3.4' } }]);
});
