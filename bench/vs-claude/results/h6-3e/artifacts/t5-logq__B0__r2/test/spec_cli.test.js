'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.resolve(__dirname, '../bin/logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-cli-'));
const A = path.join(dir, 'a.log');
const B = path.join(dir, 'b.log');
const DATA_A = '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z","msg":"boom"}\n\nnot json {\r\nlevel=info status=200 msg=ok\n';
const DATA_B = '{"level":"info","status":"404","ts":"2024-01-01T02:00:00Z"}\n';
fs.writeFileSync(A, DATA_A);
fs.writeFileSync(B, DATA_B);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function run(args, input) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('không --agg: mỗi bản ghi một dòng JSON, không có @t, đúng thứ tự', () => {
  const r = run([A, B]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out,
    '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z","msg":"boom"}\n' +
    '{"level":"info","status":200,"msg":"ok"}\n' +
    '{"level":"info","status":"404","ts":"2024-01-01T02:00:00Z"}\n');
});

test('tùy chọn đứng trước hoặc sau tệp', () => {
  const x = run(['--query', 'level:info', A, B]);
  const y = run([A, B, '--query', 'level:info']);
  assert.strictEqual(x.out, y.out);
  assert.strictEqual(x.out.split('\n').length, 3);
});

test('stdin khi không có tệp và khi dùng -', () => {
  assert.strictEqual(run([], DATA_B).out, run(['-'], DATA_B).out);
  assert.strictEqual(run(['-', B], DATA_B).out.split('\n').length, 3);
});

test('--stats in stderr: lines gồm dòng rỗng, matched, malformed', () => {
  const r = run(['--stats', A]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.err, 'lines=4 matched=2 malformed=2\n');
  const r2 = run(['--stats', '--query', 'level:error', A, B]);
  assert.strictEqual(r2.err, 'lines=5 matched=1 malformed=2\n');
  assert.strictEqual(run(['--stats'], '').err, 'lines=0 matched=0 malformed=0\n');
});

test('--agg json: một dòng JSON', () => {
  const r = run(['--agg', 'count by level', A, B]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, '{"type":"count_by","field":"level","buckets":[{"key":"info","count":2},{"key":"error","count":1}]}\n');
});

test('--format table: giá trị đơn và bucket', () => {
  assert.strictEqual(run(['--agg', 'count', '--format', 'table', A]).out, '2\n');
  assert.strictEqual(run(['--agg', 'sum nope', '--format', 'table', A]).out, 'null\n');
  assert.strictEqual(run(['--agg', 'count by level', '--format', 'table', A, B]).out, 'key    count\ninfo   2\nerror  1\n');
  assert.strictEqual(run(['--agg', 'count by level', '--format', 'table', '--query', 'level:zzz', A]).out, 'key  count\n');
  const h = run(['--agg', 'histogram 1h', '--format', 'table', A, B]).out.split('\n');
  assert.deepStrictEqual(h, [
    'key                       count',
    '2024-01-01T00:00:00.000Z  1',
    '2024-01-01T01:00:00.000Z  0',
    '2024-01-01T02:00:00.000Z  1', '']);
});

test('--format table không --agg → mã 2, stdout rỗng', () => {
  const r = run(['--format', 'table', A]);
  assert.strictEqual(r.code, 2);
  assert.strictEqual(r.out, '');
});

test('tùy chọn lạ / thiếu giá trị / format sai → mã 2', () => {
  for (const args of [['--bogus', A], ['-x', A], ['--query'], ['--format', 'xml', A]]) {
    const r = run(args);
    assert.strictEqual(r.code, 2, args.join(' '));
    assert.strictEqual(r.out, '');
  }
});

test('truy vấn sai → mã 2, stderr có vị trí, stdout rỗng', () => {
  const r = run(['--query', 'a AND (b', A]);
  assert.strictEqual(r.code, 2);
  assert.match(r.err, /syntax error at position 8/);
  assert.strictEqual(r.out, '');
  const r2 = run(['--query', 'status>=abc', path.join(dir, 'khong-ton-tai')]);
  assert.strictEqual(r2.code, 2);
  assert.match(r2.err, /syntax error at position 8/);
});

test('spec tổng hợp sai → mã 2', () => {
  const r = run(['--agg', 'bogus', A]);
  assert.strictEqual(r.code, 2);
  assert.match(r.err, /invalid aggregation/);
  assert.strictEqual(r.out, '');
});

test('tệp không đọc được → mã 1, cannot read, stdout rỗng', () => {
  const missing = path.join(dir, 'missing.log');
  const r = run([A, missing, '--stats']);
  assert.strictEqual(r.code, 1);
  assert.ok(r.err.includes('cannot read ' + missing));
  assert.strictEqual(r.out, '');
});

test('không khớp gì → mã 0, đầu ra rỗng', () => {
  const r = run(['--query', 'level:zzz', A]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, '');
  assert.strictEqual(run(['--agg', 'count', '--query', 'level:zzz', A]).out, '{"type":"count","value":0}\n');
});
