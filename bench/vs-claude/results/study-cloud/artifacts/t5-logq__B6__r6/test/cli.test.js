'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const mk = (n, c) => { const p = path.join(dir, n); fs.writeFileSync(p, c); return p; };
const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

const DATA = '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n' +
  'level=info status=200 ts=2024-01-01T00:02:00Z\n\nnot a log line\r\n' +
  '{"level":"error","status":503}';
const f = mk('a.log', DATA);

test('filter prints JSON without @t, in order', () => {
  const r = run(['--query', 'level:error', f]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":503}\n');
});

test('options after file; stdin; dash', () => {
  const a = run([f, '--agg', 'count']);
  assert.strictEqual(a.stdout, '{"type":"count","value":3}\n');
  assert.strictEqual(run(['--agg', 'count'], DATA).stdout, a.stdout);
  assert.strictEqual(run(['-', '--agg', 'count'], DATA).stdout, a.stdout);
});

test('stats counts lines incl. empty, trailing newline handled', () => {
  assert.match(run(['--stats', f]).stderr, /lines=5 matched=3 malformed=2\n/);
  assert.match(run(['--stats'], 'a=1\n').stderr, /lines=1 matched=1 malformed=0/);
  assert.match(run(['--stats'], 'a=1').stderr, /lines=1 /);
  assert.match(run(['--stats'], '').stderr, /lines=0 /);
});

test('table output', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.strictEqual(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.strictEqual(run(['--agg', 'max status', '--format', 'table', f]).stdout, '503\n');
  assert.strictEqual(run(['--agg', 'max nope', '--format', 'table', f]).stdout, 'null\n');
});

test('exit codes', () => {
  let r = run(['--query', '(a', f]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(run(['--agg', 'bogus', f]).status, 2);
  assert.strictEqual(run(['--bogus', f]).status, 2);
  assert.strictEqual(run([f, '--query']).status, 2);
  assert.strictEqual(run(['--format', 'xml', f]).status, 2);
  assert.strictEqual(run(['--format', 'table', f]).status, 2);
  r = run([path.join(dir, 'missing.log')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(run(['--query', 'zzz', f]).status, 0);
});
