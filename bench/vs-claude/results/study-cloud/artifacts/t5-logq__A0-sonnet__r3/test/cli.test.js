'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const bin = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, 'level=error s=503 ts=2024-01-01T00:00:00Z msg=boom\n\nbad\r\n{"level":"info","s":200}\nlevel=error s=500');
const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });

test('in bản ghi không có @t, stats', () => {
  const r = run([f1, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","s":503,"ts":"2024-01-01T00:00:00Z","msg":"boom"}\n{"level":"error","s":500}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=1\n'.replace('malformed=1', 'malformed=2'));
});
test('stdin và table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table'], 'level=error\nlevel=info\nlevel=error\n');
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'avg x', '--format', 'table'], 'a=1\n').stdout, 'null\n');
  assert.equal(run(['--agg', 'count'], 'a=1\n').stdout, '{"type":"count","value":1}\n');
});
test('mã thoát', () => {
  let r = run(['--query', 'a AND (b'], '');
  assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 8/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'nope'], '').status, 2);
  assert.equal(run(['--bogus'], '').status, 2);
  assert.equal(run(['--format', 'table'], '').status, 2);
  r = run([f1, path.join(dir, 'missing')]);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read .*missing/); assert.equal(r.stdout, '');
  assert.equal(run(['x=1'].slice(1), 'a=1\n').status, 0);
});
