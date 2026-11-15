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
fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error svc=web\n\nbad line\n{"level":"info","svc":"api-long"}\nlevel=error svc=web');

test('records output without @t', () => {
  const r = run(['--query', 'level:error', f]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","svc":"web"}\n{"level":"error","svc":"web"}\n');
});
test('stats, options after file, stdin', () => {
  const r = run([f, '--stats', '--agg', 'count'], undefined);
  assert.equal(r.stdout, '{"type":"count","value":3}\n');
  assert.equal(r.stderr, 'lines=5 matched=3 malformed=2\n');
  const s = run(['--agg', 'count', '-'], 'a=1\n');
  assert.equal(s.stdout, '{"type":"count","value":1}\n');
});
test('table', () => {
  assert.equal(run(['--agg', 'count by svc', '--format', 'table', f]).stdout, 'key       count\nweb       2\napi-long  1\n');
  assert.equal(run(['--agg', 'max nope', '--format', 'table', f]).stdout, 'null\n');
});
test('exit codes', () => {
  let r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.match(r.stderr, /syntax error at position 2/); assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f]).status, 2);
  assert.equal(run(['--bogus', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  r = run([f, '/nonexistent/x']);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read \/nonexistent\/x/); assert.equal(r.stdout, '');
});
