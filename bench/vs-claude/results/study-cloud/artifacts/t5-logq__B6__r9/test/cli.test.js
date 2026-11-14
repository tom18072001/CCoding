'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const mk = (n, c) => { const p = path.join(dir, n); fs.writeFileSync(p, c); return p; };
const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

const A = mk('a.log', 'level=error status=500 msg=boom\r\n\nlevel=info status=200\nbad line\n{"level":"error","status":404}');
const B = mk('b.log', 'level=error status=503\n');

test('filters, strips @t, handles CRLF/blank/no trailing newline', () => {
  const r = run(['--query', 'level:error', A, '--stats']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"level":"error","status":500,"msg":"boom"}\n{"level":"error","status":404}\n');
  assert.strictEqual(r.stderr.trim(), 'lines=5 matched=2 malformed=2');
});

test('no virtual line after final newline; stdin and -', () => {
  const r = run(['--stats'], 'a=1\nb=2\n');
  assert.strictEqual(r.stderr.trim(), 'lines=2 matched=2 malformed=0');
  const r2 = run(['-', B, '--stats'], 'a=1\n');
  assert.strictEqual(r2.stdout.split('\n').length, 3);
  assert.match(r2.stderr, /lines=2 matched=2/);
});

test('aggregations json and table', () => {
  assert.strictEqual(run(['--agg', 'count', A]).stdout, '{"type":"count","value":3}\n');
  assert.strictEqual(run(['--agg', 'count', '--format', 'table', A]).stdout, '3\n');
  assert.strictEqual(run(['--agg', 'max status', '--query', 'nomatch', '--format', 'table', A]).stdout, 'null\n');
  const t = run(['--agg', 'count by level', '--format', 'table', A, B]);
  assert.strictEqual(t.stdout, 'key    count\nerror  3\ninfo   1\n');
});

test('exit codes and empty stdout on error', () => {
  const miss = path.join(dir, 'nope.log');
  let r = run([A, miss]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /cannot read .*nope\.log/);
  r = run(['--query', '(a', A]);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 2/);
  assert.strictEqual(run(['--agg', 'bogus', A]).status, 2);
  assert.strictEqual(run(['--bad', A]).status, 2);
  assert.strictEqual(run(['--format', 'xml', A]).status, 2);
  assert.strictEqual(run([A, '--query']).status, 2);
  assert.strictEqual(run(['--format', 'table', A]).status, 2);
  assert.strictEqual(run(['--query', 'zzz', A]).status, 0);
});
