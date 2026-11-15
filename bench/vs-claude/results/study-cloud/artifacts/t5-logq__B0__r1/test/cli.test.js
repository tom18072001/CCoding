'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-cli-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function w(name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}
function run(args, input) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const A = w('a.log', [
  '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}',
  'level=info status=200 msg="all fine"',
  '',
  'garbage line',
  'level=error status=503 ts=2024-01-01T00:01:00Z',
  '',
].join('\n'));
const B = w('b.log', 'level=error status=500 msg=again\n');

test('lọc và bỏ @t khỏi output', () => {
  const r = run(['--query', 'level:error', A]);
  assert.equal(r.code, 0);
  assert.equal(r.out,
    '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n' +
    '{"level":"error","status":503,"ts":"2024-01-01T00:01:00Z"}\n');
  assert.ok(!r.out.includes('@t'));
});

test('không khớp gì vẫn mã 0, stdout rỗng', () => {
  const r = run(['--query', 'level:nope', A]);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('agg json một dòng', () => {
  const r = run(['--agg', 'count by level', A]);
  assert.equal(r.code, 0);
  assert.equal(r.out, '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1}]}\n');
});

test('agg table: đệm cột key', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', A]);
  assert.equal(r.out, 'key    count\nerror  2\ninfo   1\n');
  const r2 = run(['--agg', 'count by status', '--format', 'table', A]);
  assert.equal(r2.out, 'key  count\n200  1\n500  1\n503  1\n');
});

test('agg table: giá trị đơn và null', () => {
  assert.equal(run(['--agg', 'count', '--format', 'table', A]).out, '3\n');
  assert.equal(run(['--agg', 'max nofield', '--format', 'table', A]).out, 'null\n');
  assert.equal(run(['--agg', 'max nofield', A]).out, '{"type":"max","field":"nofield","value":null}\n');
  assert.equal(run(['--agg', 'avg status', '--format', 'table', A]).out, '401\n');
});

test('agg table: histogram', () => {
  const r = run(['--agg', 'histogram 1m', '--format', 'table', A]);
  assert.equal(r.out, 'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  1\n');
});

test('--stats: dòng rỗng và dòng lỗi', () => {
  const r = run(['--query', 'level:error', '--stats', A]);
  assert.equal(r.err, 'lines=5 matched=2 malformed=2\n');
  assert.equal(r.code, 0);
});

test('stdin khi không có tệp và với "-"', () => {
  const r1 = run(['--query', 'level:error', '--stats'], 'level=error msg=x\n');
  assert.equal(r1.out, '{"level":"error","msg":"x"}\n');
  assert.equal(r1.err, 'lines=1 matched=1 malformed=0\n');
  const r2 = run(['--agg', 'count', '-'], 'a=1\nb=2\n');
  assert.equal(r2.out, '{"type":"count","value":2}\n');
  const r3 = run(['--stats'], '');
  assert.equal(r3.err, 'lines=0 matched=0 malformed=0\n');
});

test('nhiều tệp theo thứ tự, tùy chọn đứng sau tệp', () => {
  const r = run([A, B, '--query', 'status:500', '--stats']);
  assert.equal(r.code, 0);
  const lines = r.out.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).msg, 'again');
  assert.equal(r.err, 'lines=6 matched=2 malformed=2\n');
});

test('trộn tệp và stdin', () => {
  const r = run([B, '-', '--agg', 'count'], 'x=1\n');
  assert.equal(r.out, '{"type":"count","value":2}\n');
});

test('mã 1: tệp không đọc được, kể cả tệp thứ hai; stdout rỗng, không stats', () => {
  const missing = path.join(dir, 'missing.log');
  const r = run([A, missing, '--stats']);
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.ok(r.err.includes('cannot read ' + missing));
  assert.ok(!r.err.includes('lines='));
});

test('mã 2: cú pháp truy vấn', () => {
  const r = run(['--query', '(a', A]);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.ok(r.err.includes('syntax error at position 2'));
});

test('mã 2: spec agg sai (kể cả khi tệp không tồn tại)', () => {
  const r = run(['--agg', 'bogus', path.join(dir, 'missing.log')]);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.ok(r.err.includes('invalid aggregation'));
});

test('mã 2: dùng sai tùy chọn', () => {
  for (const args of [
    ['--nope', A],
    ['--query'],
    [A, '--agg'],
    ['--format', 'xml', '--agg', 'count', A],
    ['--format', 'table', A],
    ['--format'],
  ]) {
    const r = run(args);
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.equal(r.out, '');
  }
});

test('truy vấn rỗng khớp mọi bản ghi; CRLF được xử lý', () => {
  const r = run(['--agg', 'count'], 'a=1\r\nb=2\r\n');
  assert.equal(r.out, '{"type":"count","value":2}\n');
});

// S5: bổ sung — cột key tính cả chữ "key" (độ rộng tối thiểu 3) khi mọi key ngắn hơn 3 ký tự.
test('agg table: key ngắn hơn "key" vẫn đệm tới độ rộng của chữ key', () => {
  const r = run(['--agg', 'count by k', '--format', 'table'], 'k=a\nk=a\nk=b\n');
  assert.equal(r.out, 'key  count\na    2\nb    1\n');
});
