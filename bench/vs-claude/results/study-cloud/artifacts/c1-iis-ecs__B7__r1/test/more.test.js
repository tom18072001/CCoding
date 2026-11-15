import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

test('multi fields, dashes, ua, duration, skips', () => {
  const log = ['2026-10-01 00:00:00 x', '#Fields: date time s-port cs-username cs(User-Agent) time-taken cs-uri-query',
    '2026-10-01 08:15:02 80 - Mozilla/5.0+(X) 12 a=1', 'bad line', '#Fields: c-ip', '1.2.3.4', ''].join('\r\n');
  const out = parseIisLog(log);
  assert.deepEqual(out, [
    { '@timestamp': '2026-10-01T08:15:02.000Z', server: { port: 80 }, user_agent: { original: 'Mozilla/5.0 (X)' }, event: { duration: 12000000 }, url: { query: 'a=1' } },
    { client: { ip: '1.2.3.4' } },
  ]);
});
