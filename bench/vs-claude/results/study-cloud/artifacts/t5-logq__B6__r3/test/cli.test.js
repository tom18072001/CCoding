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
  '{"@timestamp":"2024-01-01T00:00:00Z","level":"error","status":500}',
  'level=info status=200',
  '',
  'garbage',
  'level=error status=503',
].join('\n') + '\n');
fs.writeFileSync(f2, 'level=error status=404'); // không có newline cuối

const run = (args, input) => spawnSync('node', [BIN, ...args], { encoding: 'utf8', input });

test('in bản ghi khớp, bỏ @t, thứ tự đọc nhiều tệp', () => {
  const r = run(['--query', 'level:error', f1, f2]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout,
    '{"@timestamp":"2024-01-01T00:00:00Z","level":"error","status":500}\n' +
    '{"level":"error","status":503}\n{"level":"error","status":404}\n');
});

test('tùy chọn sau tệp + --stats', () => {
  const r = run([f1, '--stats', '--agg', 'count']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"type":"count","value":3}\n');
  assert.equal(r.stderr.trim(), 'lines=5 matched=3 malformed=2');
});

test('stdin khi không có tệp và với "-"', () => {
  assert.equal(run(['--agg', 'count'], 'a=1\nb=2\n').stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['--agg', 'count', '-'], 'a=1').stdout, '{"type":"count","value":1}\n');
  const r = run(['--stats'], 'a=1\n\n');
  assert.equal(r.stderr.trim(), 'lines=2 matched=1 malformed=1');
});

test('table count_by căn cột', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
});

test('table vô hướng, null', () => {
  assert.equal(run(['--agg', 'sum status', '--format', 'table', f1]).stdout, '1203\n');
  assert.equal(run(['--agg', 'max nope', '--format', 'table', f1]).stdout, 'null\n');
});

test('mã thoát 2 và stdout rỗng', () => {
  for (const args of [
    ['--query', 'a AND', f1], ['--agg', 'bogus', f1], ['--bad', f1], ['--query'],
    ['--format', 'xml', f1], ['--format', 'table', f1],
  ]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', 'a AND', f1]).stderr, /syntax error at position 5/);
});

test('mã thoát 1 khi không đọc được tệp; lỗi query ưu tiên', () => {
  const missing = path.join(dir, 'nope.log');
  const r = run([f1, missing]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
  assert.equal(run(['--query', '(', missing]).status, 2);
});
