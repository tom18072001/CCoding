'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const bin = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f = path.join(dir, 'a.log');
fs.writeFileSync(f, 'level=error status=503 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\ngarbage\n{"level":"error","status":500}\n');
const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8' });

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('cli: lọc, không in @t, --stats', () => {
  const r = run([f, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":503,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('cli: stdin và agg table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', '-'], 'level=error\nlevel=info\nlevel=error\n');
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'avg x', '--format', 'table'], 'a=1\n').stdout, 'null\n');
  assert.equal(run(['--agg', 'count'], 'a=1\n').stdout, '{"type":"count","value":1}\n');
});

test('cli: mã thoát', () => {
  let r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 2/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f]).status, 2);
  assert.equal(run(['--bogus', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  r = run([path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read .*missing\.log/); assert.equal(r.stdout, '');
  assert.equal(run(['--query', 'zzz', f]).status, 0);
});
