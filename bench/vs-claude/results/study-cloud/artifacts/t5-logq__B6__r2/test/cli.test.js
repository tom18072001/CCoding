'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const bin = path.resolve(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-cli-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, [
  '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}',
  'level=info status=200 msg=ok',
  '',
  'garbage line',
  'level=error status=503 msg="db down"',
].join('\n') + '\n');
const run = (args, input) => spawnSync('node', [bin, ...args], { input: input || '', encoding: 'utf8' });

test('filter prints records without @t', () => {
  const r = run(['--query', 'level:error', f1]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout,
    '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n' +
    '{"level":"error","status":503,"msg":"db down"}\n');
});

test('options after file, stats on stderr', () => {
  const r = run([f1, '--stats', '--agg', 'count']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"type":"count","value":3}\n');
  assert.strictEqual(r.stderr, 'lines=5 matched=3 malformed=2\n');
});

test('stdin and -', () => {
  const r = run(['--agg', 'count'], 'a=1\nb=2');
  assert.strictEqual(r.stdout, '{"type":"count","value":2}\n');
  const r2 = run(['-', '--agg', 'count'], 'a=1\n');
  assert.strictEqual(r2.stdout, '{"type":"count","value":1}\n');
});

test('table output', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1]);
  assert.strictEqual(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.strictEqual(run(['--agg', 'max nope', '--format', 'table', f1]).stdout, 'null\n');
  assert.strictEqual(run(['--agg', 'count', '--format', 'table', f1]).stdout, '3\n');
});

test('usage errors exit 2 with empty stdout', () => {
  const cases = [['--bogus'], ['--query'], ['--format', 'xml'], ['--format', 'table'],
    ['--agg', 'nonsense'], ['--query', '(a']];
  for (const a of cases) {
    const r = run(a[0] === '--query' && a.length === 1 ? a : [...a, f1]);
    assert.strictEqual(r.status, 2, a.join(' '));
    assert.strictEqual(r.stdout, '');
  }
  assert.match(run(['--query', '(a', f1]).stderr, /syntax error at position 2/);
});

test('unreadable file exits 1', () => {
  const missing = path.join(dir, 'nope.log');
  const r = run(['--query', 'level:error', f1, missing]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
});
