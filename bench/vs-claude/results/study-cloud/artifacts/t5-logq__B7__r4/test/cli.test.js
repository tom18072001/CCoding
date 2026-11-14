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
fs.writeFileSync(f1, [
  'ts=2024-01-01T00:00:00Z level=error status=500 msg="boom"',
  '',
  'garbage line',
  '{"ts":"2024-01-01T00:02:00Z","level":"info","status":200}',
  'level=error status=503',
].join('\n') + '\n');

const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });

test('in bản ghi khớp, không có @t', () => {
  const r = run(['--query', 'level:error', f1, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n{"level":"error","status":503}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('stdin và -', () => {
  const r = run(['--agg', 'count'], 'a=1\nb=2');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['-', '--agg', 'count'], 'a=1\n').stdout, '{"type":"count","value":1}\n');
});

test('table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'sum status', '--format', 'table', f1]).stdout, '1203\n');
  assert.equal(run(['--agg', 'max nope', '--format', 'table', f1]).stdout, 'null\n');
});

test('histogram qua CLI', () => {
  const r = run(['--agg', 'histogram 1m', f1]);
  assert.equal(JSON.parse(r.stdout).buckets.length, 3);
});

test('mã thoát lỗi', () => {
  let r = run(['--query', '(a', f1]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f1]).status, 2);
  assert.equal(run(['--bogus', f1]).status, 2);
  assert.equal(run(['--format', 'table', f1]).status, 2);
  assert.equal(run(['--format', 'xml', f1]).status, 2);
  assert.equal(run([f1, '--query']).status, 2);
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--query', 'zzz:1', f1]).status, 0);
});
