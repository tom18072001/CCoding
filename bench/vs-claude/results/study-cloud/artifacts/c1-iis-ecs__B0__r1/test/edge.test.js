import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIisLog } from '../src/iis.js';

const F1 = '#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status time-taken';
const L1 = '2026-10-01 08:15:02 10.0.0.1 GET /a q=1 443 bob 10.0.0.5 Mozilla/5.0+(Windows+NT+10.0) 404 15';
const L2 = '2026-10-01 08:15:03 10.0.0.1 POST /b - 80 - 10.0.0.6 - 200 7';

test('data lines before any #Fields are skipped', () => {
  const out = parseIisLog(`${L1}\n${F1}\n${L2}\n`);
  assert.equal(out.length, 1);
  assert.equal(out[0].url.path, '/b');
});

test('two #Fields blocks with different column order', () => {
  const text = [
    '#Fields: date time cs-method sc-status',
    '2026-10-01 01:00:00 GET 200',
    '#Fields: sc-status cs-uri-stem time date',
    '500 /x 02:00:00 2026-10-02',
  ].join('\n');
  const out = parseIisLog(text);
  assert.deepEqual(out, [
    { '@timestamp': '2026-10-01T01:00:00.000Z', http: { request: { method: 'GET' }, response: { status_code: 200 } } },
    { '@timestamp': '2026-10-02T02:00:00.000Z', http: { response: { status_code: 500 } }, url: { path: '/x' } },
  ]);
});

test('lines with extra or missing columns are skipped, others kept', () => {
  const text = [F1, L1, L1 + ' extra', '2026-10-01 08:15:02 10.0.0.1 GET', L2].join('\n');
  const out = parseIisLog(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].url.path, '/a');
  assert.equal(out[1].url.path, '/b');
});

test('blank lines and other directives are ignored', () => {
  const text = ['#Software: Microsoft Internet Information Services 10.0', '#Version: 1.0', '#Date: 2026-10-01 00:00:00', '', F1, '', L1, '', ''].join('\n');
  assert.equal(parseIisLog(text).length, 1);
});

test('CRLF gives same result as LF', () => {
  const lf = [F1, L1, L2].join('\n') + '\n';
  assert.deepEqual(parseIisLog(lf.replaceAll('\n', '\r\n')), parseIisLog(lf));
  assert.equal(parseIisLog(lf).length, 2);
});

test('dash values leave keys absent and no empty objects', () => {
  const [out] = parseIisLog(`${F1}\n2026-10-01 08:15:02 10.0.0.1 GET /a - 80 - 10.0.0.5 - 200 5\n`);
  assert.ok(!('query' in out.url));
  assert.ok(!('user' in out));
  assert.ok(!('user_agent' in out));
  for (const v of Object.values(out)) {
    if (typeof v === 'object') assert.ok(Object.keys(v).length > 0);
  }
});

test('numeric types and duration conversion', () => {
  const [out] = parseIisLog(`${F1}\n${L1}\n`);
  assert.equal(typeof out.http.response.status_code, 'number');
  assert.equal(typeof out.server.port, 'number');
  assert.equal(typeof out.event.duration, 'number');
  assert.equal(out.event.duration, 15000000);
});

test('User-Agent plus signs become spaces', () => {
  const [out] = parseIisLog(`${F1}\n${L1}\n`);
  assert.equal(out.user_agent.original, 'Mozilla/5.0 (Windows NT 10.0)');
});

test('unknown fields are ignored', () => {
  const text = '#Fields: date time sc-substatus cs-method\n2026-10-01 08:15:02 0 GET\n';
  const [out] = parseIisLog(text);
  assert.deepEqual(out, { '@timestamp': '2026-10-01T08:15:02.000Z', http: { request: { method: 'GET' } } });
  assert.ok(!JSON.stringify(out).includes('substatus'));
});

test('no dotted top-level keys except @timestamp', () => {
  for (const r of parseIisLog(`${F1}\n${L1}\n${L2}\n`)) {
    for (const k of Object.keys(r)) {
      if (k !== '@timestamp') assert.ok(!k.includes('.'), k);
    }
  }
});

test('empty input or directives only return []', () => {
  assert.deepEqual(parseIisLog(''), []);
  assert.deepEqual(parseIisLog('#Software: x\n#Version: 1.0\n#Fields: date time\n'), []);
});
