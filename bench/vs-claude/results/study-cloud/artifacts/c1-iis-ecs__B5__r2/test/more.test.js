import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

test('multiple Fields, dashes, UA, duration, skips', () => {
  const log = 'x y\n#Fields: date time cs(User-Agent) time-taken s-port cs-username foo\r\n2026-10-01 08:15:02 a+b+c 5 80 - z\r\n2026-10-01 08:15:03 short\n\n#Fields: c-ip sc-status\n1.2.3.4 404\n';
  const out = parseIisLog(log);
  assert.deepEqual(out, [
    { '@timestamp': '2026-10-01T08:15:02.000Z', user_agent: { original: 'a b c' }, event: { duration: 5e6 }, server: { port: 80 } },
    { client: { ip: '1.2.3.4' }, http: { response: { status_code: 404 } } },
  ]);
});
