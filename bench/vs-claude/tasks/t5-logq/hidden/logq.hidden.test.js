'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseLine } = require('../src/parse');
const { compile, QuerySyntaxError } = require('../src/query');
const { aggregate } = require('../src/agg');

// ── 1. parseLine
const P = (l) => parseLine(l);
const okRec = (l, rec) => test(`parse ok: ${JSON.stringify(l)}`, () => assert.deepStrictEqual(P(l), { ok: true, record: rec }));
const notOk = (l) => test(`parse lỗi: ${JSON.stringify(l)}`, () => assert.deepStrictEqual(P(l), { ok: false }));

okRec('{"level":"error","msg":"boom"}', { level: 'error', msg: 'boom' });
okRec('  {"a":1}\r', { a: 1 });
okRec('{"http":{"status":500,"req":{"m":"GET"}},"tags":["x","y"]}', { 'http.status': 500, 'http.req.m': 'GET', tags: ['x', 'y'] });
okRec('{"a":{},"b":null,"c":{"d":{}}}', { b: null });
okRec('{}', {});
notOk('{"a":');
notOk('{oops}');
notOk('   ');
notOk('');
notOk('\r');
okRec('level=info status=200', { level: 'info', status: 200 });
okRec('a=1 b=-2.5 c=1.0.0 d=true e=false f=null g= h=01', { a: 1, b: -2.5, c: '1.0.0', d: true, e: false, f: null, g: '', h: 1 });
okRec('msg="hello world" n="42"', { msg: 'hello world', n: '42' });
okRec('m="say \\"hi\\"" p="C:\\\\tmp" q="a\\nb\\tc" r="x\\yz"', { m: 'say "hi"', p: 'C:\\tmp', q: 'a\nb\tc', r: 'x\\yz' });
okRec('a=1\t\tb=2   c=3', { a: 1, b: 2, c: 3 });
okRec('a=1 a=2', { a: 2 });
okRec('k.sub-x=1 _u=2', { 'k.sub-x': 1, _u: 2 });
okRec('url=http://x/y?a=b', { url: 'http://x/y?a=b' });
notOk('just some text');
notOk('a=1 broken');
notOk('1a=2');
notOk('a="unterminated');
notOk('a="x"b=1');
notOk('a=x"y');
notOk('=1');

test('parse: @t từ @timestamp / ts / time theo thứ tự', () => {
  assert.equal(P('{"@timestamp":"2026-11-01T10:00:00Z","ts":"2020-01-01T00:00:00Z"}').record['@t'], Date.parse('2026-11-01T10:00:00Z'));
  assert.equal(P('ts=2026-11-01T10:00:00.500Z level=x').record['@t'], Date.parse('2026-11-01T10:00:00.500Z'));
  assert.equal(P('time=2026-11-01T17:00:00+07:00').record['@t'], Date.parse('2026-11-01T10:00:00Z'));
});
test('parse: không có @t khi trường đầu tiên không phải thời gian', () => {
  assert.equal('@t' in P('ts=yesterday time=2026-11-01T10:00:00Z').record, false);
  assert.equal('@t' in P('ts=1700000000').record, false);
  assert.equal('@t' in P('{"time":"2026-11-01"}').record, false);
  assert.equal('@t' in P('level=info').record, false);
});

// ── 2. compile
const R = [
  { level: 'ERROR', status: 503, msg: 'Connection reset by peer', path: '/api/users', service: 'api', latency_ms: 120 },
  { level: 'error', status: '404', msg: 'Not found', path: '/api/orders/7', service: 'api', latency_ms: '35' },
  { level: 'info', status: 200, message: 'GET /health ok', path: '/health', service: 'web', latency_ms: 3, user: null },
  { level: 'warn', status: 429, msg: 'rate limited AND retried', path: '/api', service: 'web', user: 'u1' },
  { level: 'debug', msg: 'cache miss', service: 'worker', latency_ms: 'n/a', 'http.status': 500, flag: true },
];
const sel = (q) => R.map((r, i) => (compile(q)(r) ? i : -1)).filter((i) => i >= 0);
for (const [q, exp] of [
  ['', [0, 1, 2, 3, 4]],
  ['   ', [0, 1, 2, 3, 4]],
  ['level:error', [0, 1]],
  ['level:ERR*', [0, 1]],
  ['level:e?ror', [0, 1]],
  ['level:err', []],
  ['status:500', []],
  ['status:503', [0]],
  ['status:404', [1]],
  ['status:5*', [0]],
  ['http.status:500', [4]],
  ['path:/api/*', [0, 1]],
  ['path:/api*', [0, 1, 3]],
  ['path:"/api/*"', []],
  ['msg:"not found"', [1]],
  ['msg:"Not"', []],
  ['flag:true', [4]],
  ['status>=500', [0]],
  ['status>=404', [0, 1, 3]],
  ['status<300', [2]],
  ['latency_ms>100', [0]],
  ['latency_ms<=35', [1, 2]],
  ['latency_ms>-1', [0, 1, 2]],
  ['status>=400 status<500', [1, 3]],
  ['_exists_:user', [3]],
  ['_exists_:message', [2]],
  ['NOT _exists_:status', [4]],
  ['reset', [0]],
  ['RESET', [0]],
  ['health', [2]],
  ['"by peer"', [0]],
  ['"rate limited AND retried"', [3]],
  ['and', [3]],
  ['level:error OR level:warn', [0, 1, 3]],
  ['level:error AND status>=500 OR level:warn', [0, 3]],
  ['level:error AND (status>=500 OR level:warn)', [0]],
  ['NOT level:error AND service:api', []],
  ['NOT (level:error AND service:api)', [2, 3, 4]],
  ['NOT NOT level:info', [2]],
  ['service:web OR service:worker NOT msg:"cache miss"', [2, 3]],
  ['(service:web OR service:worker) NOT msg:"cache miss"', [2, 3]],
  ['service:api level:error status>=500', [0]],
  ['((level:info))', [2]],
  ['level:error OR (service:worker AND _exists_:flag)', [0, 1, 4]],
]) {
  test(`truy vấn: ${q || '(rỗng)'}`, () => assert.deepEqual(sel(q), exp));
}
test('truy vấn: trường thiếu → false, không ném lỗi', () => {
  assert.equal(compile('nope:x')({}), false);
  assert.equal(compile('nope>1')({}), false);
  assert.equal(compile('word')({}), false);
  assert.equal(compile('a:x')({ a: null }), false);
});
test('truy vấn: ký tự đặc biệt của regex trong giá trị trần', () => {
  assert.equal(compile('p:a.c')({ p: 'abc' }), false);
  assert.equal(compile('p:a.c')({ p: 'a.c' }), true);
  assert.equal(compile('p:a+b')({ p: 'a+b' }), true);
  assert.equal(compile('p:a+b')({ p: 'aab' }), false);
});

for (const [q, pos] of [
  ['(level:error', 12],
  ['level:error)', 11],
  ['(a OR b))', 8],
  ['()', 1],
  ['a AND', 5],
  ['a OR', 4],
  ['NOT', 3],
  ['a AND NOT', 9],
  ['AND a', 0],
  ['OR a', 0],
  ['(OR a)', 1],
  ['a AND OR b', 6],
  ['NOT AND a', 4],
  ['status>=abc', 8],
  ['status>=', 8],
  ['x<y', 2],
  ['level:', 6],
  ['level: error', 6],
  ['msg:"abc', 4],
  ['"abc', 0],
  ['a ("b', 3],
]) {
  test(`lỗi cú pháp tại ${pos}: ${q}`, () => {
    assert.throws(
      () => compile(q),
      (e) => e instanceof QuerySyntaxError && e instanceof Error && e.name === 'QuerySyntaxError' && e.position === pos && e.message.startsWith(`syntax error at position ${pos}`),
    );
  });
}

// ── 3. aggregate
const A = [
  { s: 'b', n: 5, code: 500, '@t': Date.parse('2026-11-01T10:00:10Z') },
  { s: 'a', n: '1', code: 200, '@t': Date.parse('2026-11-01T10:00:50Z') },
  { s: 'b', n: 3, code: 500, '@t': Date.parse('2026-11-01T10:03:00Z') },
  { s: 'c', n: 'x', code: 200 },
  { s: 'a', n: true, code: 404, '@t': Date.parse('2026-11-01T10:01:59.999Z') },
  { n: 10, s: null },
  { s: 'd', n: '2.5', code: 200 },
];
for (const [spec, exp] of [
  ['count', { type: 'count', value: 7 }],
  ['  count  ', { type: 'count', value: 7 }],
  ['count by s', { type: 'count_by', field: 's', buckets: [{ key: 'a', count: 2 }, { key: 'b', count: 2 }, { key: 'c', count: 1 }, { key: 'd', count: 1 }] }],
  ['count by code', { type: 'count_by', field: 'code', buckets: [{ key: 200, count: 3 }, { key: 500, count: 2 }, { key: 404, count: 1 }] }],
  ['count by missing', { type: 'count_by', field: 'missing', buckets: [] }],
  ['top 2 s', { type: 'top', field: 's', buckets: [{ key: 'a', count: 2 }, { key: 'b', count: 2 }] }],
  ['top 10 code', { type: 'top', field: 'code', buckets: [{ key: 200, count: 3 }, { key: 500, count: 2 }, { key: 404, count: 1 }] }],
  ['sum n', { type: 'sum', field: 'n', value: 21.5 }],
  ['avg n', { type: 'avg', field: 'n', value: 4.3 }],
  ['min n', { type: 'min', field: 'n', value: 1 }],
  ['max n', { type: 'max', field: 'n', value: 10 }],
  ['p50 n', { type: 'p50', field: 'n', value: 3 }],
  ['p90 n', { type: 'p90', field: 'n', value: 10 }],
  ['p99 n', { type: 'p99', field: 'n', value: 10 }],
  ['avg nothing', { type: 'avg', field: 'nothing', value: null }],
  ['p95 nothing', { type: 'p95', field: 'nothing', value: null }],
  ['histogram 1m', { type: 'histogram', interval: '1m', buckets: [
    { key: '2026-11-01T10:00:00.000Z', count: 2 }, { key: '2026-11-01T10:01:00.000Z', count: 1 }, { key: '2026-11-01T10:02:00.000Z', count: 0 }, { key: '2026-11-01T10:03:00.000Z', count: 1 },
  ] }],
  ['histogram 2m', { type: 'histogram', interval: '2m', buckets: [{ key: '2026-11-01T10:00:00.000Z', count: 3 }, { key: '2026-11-01T10:02:00.000Z', count: 1 }] }],
  ['histogram 30s', { type: 'histogram', interval: '30s', buckets: [
    { key: '2026-11-01T10:00:00.000Z', count: 1 }, { key: '2026-11-01T10:00:30.000Z', count: 1 }, { key: '2026-11-01T10:01:00.000Z', count: 0 }, { key: '2026-11-01T10:01:30.000Z', count: 1 },
    { key: '2026-11-01T10:02:00.000Z', count: 0 }, { key: '2026-11-01T10:02:30.000Z', count: 0 }, { key: '2026-11-01T10:03:00.000Z', count: 1 },
  ] }],
  ['histogram 1d', { type: 'histogram', interval: '1d', buckets: [{ key: '2026-11-01T00:00:00.000Z', count: 4 }] }],
]) {
  test(`tổng hợp: ${spec}`, () => assert.deepStrictEqual(aggregate(A, spec), exp));
}
test('tổng hợp: percentile nearest-rank', () => {
  const xs = [15, 20, 35, 40, 50].map((v) => ({ v }));
  assert.equal(aggregate(xs, 'p50 v').value, 35);
  assert.equal(aggregate(xs, 'p90 v').value, 50);
  assert.equal(aggregate(xs.slice(0, 4), 'p50 v').value, 20);
  assert.equal(aggregate([{ v: 7 }], 'p99 v').value, 7);
});
test('tổng hợp: avg làm tròn 4 chữ số', () => {
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 2 }], 'avg v').value, 1.6667);
});
test('tổng hợp: histogram rỗng', () => {
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 5m'), { type: 'histogram', interval: '5m', buckets: [] });
});
for (const spec of ['', 'counts', 'count by', 'count s', 'top s', 'top 0 s', 'top x s', 'median n', 'avg', 'histogram', 'histogram 0m', 'histogram 1w', 'histogram m', 'sum a b']) {
  test(`tổng hợp sai: ${JSON.stringify(spec)}`, () => assert.throws(() => aggregate(A, spec), (e) => e instanceof Error && e.message.startsWith('invalid aggregation')));
}

// ── 4. CLI
const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const F1 = path.join(dir, 'a.log');
const F2 = path.join(dir, 'b.log');
fs.writeFileSync(F1, [
  '{"ts":"2026-11-01T10:00:05Z","level":"error","service":"api","status":503,"msg":"upstream timeout"}',
  'ts=2026-11-01T10:00:40Z level=info service=web status=200 msg="GET /"',
  'this line is broken',
  '',
  'ts=2026-11-01T10:02:10Z level=error service=api status=500 msg="db down" latency_ms=900',
].join('\n') + '\n');
fs.writeFileSync(F2, 'level=warn service=web status=429 msg="slow down"\r\n{"level":"error","service":"worker","status":500}\r\n');
function cli(args, input) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: in bản ghi khớp dạng JSON, bỏ @t, theo thứ tự đọc', () => {
  const r = cli(['--query', 'level:error', F1, F2]);
  assert.equal(r.code, 0, r.err);
  assert.equal(
    r.out,
    '{"ts":"2026-11-01T10:00:05Z","level":"error","service":"api","status":503,"msg":"upstream timeout"}\n' +
      '{"ts":"2026-11-01T10:02:10Z","level":"error","service":"api","status":500,"msg":"db down","latency_ms":900}\n' +
      '{"level":"error","service":"worker","status":500}\n',
  );
});
test('CLI: không truy vấn = mọi dòng hợp lệ; tùy chọn đứng sau tệp', () => {
  const r = cli([F2, '--format', 'json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trim().split('\n').length, 2);
});
test('CLI: --stats ra stderr', () => {
  const r = cli(['--stats', '--query', 'status>=500', F1, F2]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err.trim(), 'lines=7 matched=3 malformed=2');
  assert.equal(r.out.trim().split('\n').length, 3);
});
test('CLI: đọc stdin khi không có tệp và khi tệp là -', () => {
  const input = 'a=1 msg=hi\na=2 msg=bye\n';
  assert.equal(cli(['--query', 'hi'], input).out, '{"a":1,"msg":"hi"}\n');
  assert.equal(cli(['--query', 'a>=2', '-'], input).out, '{"a":2,"msg":"bye"}\n');
});
test('CLI: --agg json', () => {
  const r = cli(['--agg', 'count by service', F1, F2]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, JSON.stringify({ type: 'count_by', field: 'service', buckets: [{ key: 'api', count: 2 }, { key: 'web', count: 2 }, { key: 'worker', count: 1 }] }) + '\n');
});
test('CLI: --agg kết hợp --query', () => {
  const r = cli(['--query', 'service:api', '--agg', 'max latency_ms', F1]);
  assert.equal(r.out, '{"type":"max","field":"latency_ms","value":900}\n');
});
test('CLI: --format table cho bucket (căn cột, hai dấu cách)', () => {
  const r = cli(['--agg', 'count by service', '--format', 'table', F1, F2]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'key     count\napi     2\nweb     2\nworker  1\n');
});
test('CLI: --format table cho histogram', () => {
  const r = cli(['--agg', 'histogram 1m', '--format', 'table', F1]);
  assert.equal(r.out, 'key                       count\n2026-11-01T10:00:00.000Z  2\n2026-11-01T10:01:00.000Z  0\n2026-11-01T10:02:00.000Z  1\n');
});
test('CLI: --format table cho giá trị đơn', () => {
  assert.equal(cli(['--agg', 'count', '--format', 'table', F1, F2]).out, '5\n');
  assert.equal(cli(['--agg', 'avg nothing', '--format', 'table', F1]).out, 'null\n');
});
test('CLI: không khớp gì vẫn thoát 0', () => {
  const r = cli(['--query', 'level:fatal', F1]);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});
test('CLI: lỗi cú pháp truy vấn → mã 2, stderr có vị trí, stdout rỗng', () => {
  const r = cli(['--query', 'level:error AND', F1]);
  assert.equal(r.code, 2);
  assert.match(r.err, /syntax error at position 15/);
  assert.equal(r.out, '');
});
test('CLI: spec tổng hợp sai → mã 2', () => {
  const r = cli(['--agg', 'median x', F1]);
  assert.equal(r.code, 2);
  assert.match(r.err, /invalid aggregation/);
  assert.equal(r.out, '');
});
test('CLI: table không có --agg → mã 2', () => {
  assert.equal(cli(['--format', 'table', F1]).code, 2);
});
test('CLI: tùy chọn lạ / format lạ → mã 2', () => {
  assert.equal(cli(['--color', F1]).code, 2);
  assert.equal(cli(['--format', 'xml', '--agg', 'count', F1]).code, 2);
});
test('CLI: tệp không đọc được → mã 1, stdout rỗng', () => {
  const missing = path.join(dir, 'nope.log');
  const r = cli([F1, missing]);
  assert.equal(r.code, 1);
  assert.match(r.err, new RegExp('cannot read ' + missing.replace(/[\\.]/g, '\\$&')));
  assert.equal(r.out, '');
});
