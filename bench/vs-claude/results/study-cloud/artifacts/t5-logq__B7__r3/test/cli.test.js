'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const bin = path.join(path.dirname(__dirname), 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, 'ts=2024-01-01T00:00:01Z level=error status=500\n\ngarbage\r\n{"level":"info","status":200}\nlevel=error status=503');
const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });

test('in bản ghi khớp, không có @t, --stats', () => {
  const r = run(['--query', 'level:error', '--stats', f1]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:01Z","level":"error","status":500}\n{"level":"error","status":503}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('stdin, tùy chọn sau tệp, không khớp = 0', () => {
  const r = run(['-', '--query', 'zzz'], 'a=1\n');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(run([f1, '--agg', 'count']).stdout, '{"type":"count","value":3}\n');
});

test('table', () => {
  const r = run(['--agg', 'count by status', '--format', 'table', f1]);
  assert.equal(r.stdout, 'key  count\n200  1\n500  1\n503  1\n');
  assert.equal(run(['--agg', 'avg nope', '--format', 'table', f1]).stdout, 'null\n');
  assert.equal(run(['--agg', 'count by level', '--format', 'table', f1]).stdout, 'key    count\nerror  2\ninfo   1\n');
});

test('mã thoát', () => {
  let r = run(['--query', '(a', f1]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f1]).status, 2);
  assert.equal(run(['--bogus', f1]).status, 2);
  assert.equal(run(['--format', 'table', f1]).status, 2);
  assert.equal(run(['--format', 'xml', '--agg', 'count', f1]).status, 2);
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(r.stdout, '');
});

test('histogram table có mốc trống, nhiều tệp, stdin "-" lẫn tệp, --stats', () => {
  const f2 = path.join(dir, 'h.log');
  fs.writeFileSync(f2, 'ts=2024-01-01T00:00:30Z a=x\nts=2024-01-01T00:03:00Z a=y\nbad\n');
  const r = run(['--agg', 'histogram 1m', '--format', 'table', '--stats', f2]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  0\n2024-01-01T00:02:00.000Z  0\n2024-01-01T00:03:00.000Z  1\n');
  assert.equal(r.stderr, 'lines=3 matched=2 malformed=1\n');
  const m = run(['--agg', 'count', '--stats', f2, '-'], 'a=1\n\n');
  assert.equal(m.stdout, '{"type":"count","value":3}\n');
  assert.equal(m.stderr, 'lines=5 matched=3 malformed=2\n');
});

test('lỗi: stdout rỗng, không in --stats; spec sai và tùy chọn thiếu giá trị = 2', () => {
  let r = run(['--stats', '--query', 'a AND', f1]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^syntax error at position 5/);
  assert.doesNotMatch(r.stderr, /lines=/);
  r = run(['--agg', 'nope', path.join(dir, 'missing.log')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^invalid aggregation/);
  assert.equal(run(['--query']).status, 2);
  assert.equal(run(['--agg', 'top 1 level', '--format', 'table', f1]).stdout, 'key    count\nerror  2\n');
});
