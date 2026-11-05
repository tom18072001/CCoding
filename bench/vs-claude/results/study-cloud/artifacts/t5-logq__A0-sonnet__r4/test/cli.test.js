'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const bin = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f = path.join(dir, 'a.log');
fs.writeFileSync(f, 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\ngarbage\n{"level":"error","status":404}');
const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });

test('lọc và in bản ghi không có @t', () => {
  const r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});
test('stdin và agg table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table'], fs.readFileSync(f));
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'max status', '--format', 'table', '-'], fs.readFileSync(f)).stdout, '500\n');
  assert.equal(run(['--agg', 'count', f]).stdout, '{"type":"count","value":3}\n');
});
test('mã thoát', () => {
  let r = run(['--query', '(a', f]); assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 2/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bad', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--query']).status, 2);
  r = run([f, '/nonexistent/x']); assert.equal(r.status, 1); assert.match(r.stderr, /cannot read \/nonexistent\/x/); assert.equal(r.stdout, '');
});
