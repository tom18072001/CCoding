import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const H = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken\n';

test('maps all fields with types', () => {
  const [r] = parseIisLog(H + '2026-10-01 08:15:02 10.0.0.1 GET /a q=1 443 bob 10.0.0.5 Mozilla/5.0+(X11) 404 12\n');
  assert.deepEqual(r, {
    '@timestamp': '2026-10-01T08:15:02.000Z',
    server: { ip: '10.0.0.1', port: 443 },
    http: { request: { method: 'GET' }, response: { status_code: 404 } },
    url: { path: '/a', query: 'q=1' },
    user: { name: 'bob' },
    client: { ip: '10.0.0.5' },
    user_agent: { original: 'Mozilla/5.0 (X11)' },
    event: { duration: 12000000 },
  });
});

test('dash omits keys', () => {
  const [r] = parseIisLog(H + '2026-10-01 08:15:02 10.0.0.1 GET /a - 80 - 10.0.0.5 - 200 5\r\n');
  assert.equal(r.url.query, undefined);
  assert.equal(r.user, undefined);
  assert.equal(r.user_agent, undefined);
});

test('multiple #Fields and bad column counts', () => {
  const log = '2026-10-01 08:00:00 x\n#Fields: date time c-ip\n2026-10-01 08:00:00 1.1.1.1\n2026-10-01 08:00:00\n#Fields: c-ip sc-status\n2.2.2.2 500\n';
  const out = parseIisLog(log);
  assert.equal(out.length, 2);
  assert.equal(out[0].client.ip, '1.1.1.1');
  assert.equal(out[1].http.response.status_code, 500);
  assert.equal(out[1]['@timestamp'], undefined);
});
