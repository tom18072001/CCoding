'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bin = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f = path.join(dir, 'a.log');
fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\r\n{"level":"info","status":200}\nlevel=error status=503\n');

test('in bản ghi khớp, không có @t', () => {
  const r = run(['--query', 'level:error', f]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n{"level":"error","status":503}\n');
});
test('stats + stdin + tùy chọn sau tệp', () => {
  const r = run(['--stats', '--query', 'status>=500'], fs.readFileSync(f));
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  const r2 = run([f, '-', '--stats'], '');
  assert.equal(r2.stderr, 'lines=5 matched=3 malformed=2\n');
});
test('agg json và table', () => {
  assert.equal(run(['--agg', 'count by level', f]).stdout, '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1}]}\n');
  assert.equal(run(['--agg', 'count by level', '--format', 'table', f]).stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'sum nope', '--format', 'table', f]).stdout, 'null\n');
  assert.equal(run(['--agg', 'count', '--format', 'table', f]).stdout, '3\n');
});
test('mã thoát', () => {
  let r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 2/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f]).status, 2);
  assert.equal(run(['--bogus', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--format', 'xml', '--agg', 'count', f]).status, 2);
  assert.equal(run(['--query']).status, 2);
  r = run([f, path.join(dir, 'missing')]);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read .*missing/); assert.equal(r.stdout, '');
  assert.equal(run(['--query', 'zzz', f]).status, 0);
});
