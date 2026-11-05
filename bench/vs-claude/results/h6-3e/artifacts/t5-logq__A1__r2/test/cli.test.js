'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const f1 = path.join(dir, 'a.log');
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, 'ts=2024-01-01T00:00:00Z level=info status=200 path=/a\n\ngarbage\nlevel=error status=500 path=/b\r\n');
fs.writeFileSync(f2, '{"level":"error","http":{"status":503},"ts":"2024-01-01T00:02:00Z"}');

const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input: input || '', encoding: 'utf8' });

test('records output without @t', () => {
  const r = run([f1, f2, '--query', 'level:error']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"path":"/b"}\n{"level":"error","http.status":503,"ts":"2024-01-01T00:02:00Z"}\n');
});

test('stdin, "-", and stats', () => {
  const r = run(['--stats', '-'], 'a=1\n\nbad\na=2');
  assert.equal(r.stdout, '{"a":1}\n{"a":2}\n');
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n');
  assert.equal(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
});

test('aggregations json/table', () => {
  assert.equal(run([f1, f2, '--agg', 'count']).stdout, '{"type":"count","value":3}\n');
  assert.equal(run([f1, '--agg', 'avg status', '--format', 'table']).stdout, '350\n');
  assert.equal(run([f1, '--agg', 'max nope', '--format', 'table']).stdout, 'null\n');
  const t = run([f1, f2, '--agg', 'count by level', '--format', 'table']).stdout;
  assert.equal(t, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run([f1, f2, '--agg', 'histogram 1m', '--format', 'table']).stdout.split('\n').length, 5);
  assert.equal(run(['--agg', 'count by x', '--format', 'table'], 'x=1').stdout, 'key  count\n1    1\n');
});

test('exit codes', () => {
  let r = run(['--query', '(a'], 'a=1');
  assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 2/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus'], 'a=1').status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--format', 'table'], 'a=1').status, 2);
  assert.equal(run(['--format', 'xml', '--agg', 'count']).status, 2);
  assert.equal(run(['--query']).status, 2);
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(run(['--query', 'zzz:1', f1]).status, 0);
});
