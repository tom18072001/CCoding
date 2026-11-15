'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, [
  '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}',
  '{"level":"info","status":200,"ts":"2024-01-01T00:00:02Z"}',
  '',
  'garbage line',
  '',
].join('\n'));
fs.writeFileSync(f2, '{"level":"error","status":503}\n{"level":"warn","status":404}');

const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

test('in bản ghi khớp, bỏ @t, nhiều tệp', () => {
  const r = run(['--query', 'level:error', f1, f2]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":503}\n');
});

test('tùy chọn đứng sau tệp, --stats', () => {
  const r = run([f1, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n');
});

test('stdin khi không có tệp và với "-"', () => {
  const r = run(['--agg', 'count'], 'a=1\nb=2\n');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['-', '--agg', 'count'], 'a=1').stdout, '{"type":"count","value":1}\n');
});

test('table count_by căn cột', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1, f2]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\nwarn   1\n');
});

test('table vô hướng', () => {
  assert.equal(run(['--agg', 'sum status', '--format', 'table', f2]).stdout, '907\n');
  assert.equal(run(['--agg', 'avg nope', '--format', 'table', f2]).stdout, 'null\n');
});

test('lỗi cú pháp truy vấn → 2, stdout rỗng', () => {
  const r = run(['--query', '(a', f1]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 2/);
});

test('spec agg sai → 2', () => {
  const r = run(['--agg', 'bogus', f1]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /invalid aggregation/);
});

test('dùng sai tùy chọn → 2', () => {
  for (const a of [['--nope'], ['--query'], ['--format', 'xml', '--agg', 'count'], ['--format', 'table', f1]]) {
    const r = run(a, '');
    assert.equal(r.status, 2, a.join(' '));
    assert.equal(r.stdout, '');
  }
});

test('không đọc được tệp → 1, không in gì dù tệp trước hợp lệ', () => {
  const missing = path.join(dir, 'missing.log');
  const r = run([f1, missing]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes(`cannot read ${missing}`));
});

test('không khớp gì → 0', () => {
  const r = run(['--query', 'level:nothing', f1]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('đầu ra lớn qua pipe không bị cắt', () => {
  const big = Array.from({ length: 50000 }, (_, i) => `n=${i}`).join('\n') + '\n';
  const r = spawnSync('node', [BIN], { input: big, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.stdout.split('\n').length - 1, 50000);
});
