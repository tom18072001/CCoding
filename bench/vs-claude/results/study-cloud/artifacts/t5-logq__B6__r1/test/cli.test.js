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

function tmp(name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}
function run(args, input) {
  return spawnSync('node', [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' });
}

const DATA =
  'ts=2024-01-01T00:00:00Z level=error status=500 msg="boom"\n' +
  '\n' +
  'garbage line\n' +
  '{"ts":"2024-01-01T00:00:02Z","level":"info","status":200,"msg":"ok"}\n' +
  'level=error status=503 msg=down\n';

test('filter prints records without @t', () => {
  const f = tmp('a.log', DATA);
  const r = run(['--query', 'level:error', f, '--stats']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout,
    '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n' +
    '{"level":"error","status":503,"msg":"down"}\n');
  assert.strictEqual(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('options after file, stdin and "-"', () => {
  const f = tmp('b.log', 'a=1\n');
  assert.strictEqual(run([f, '--query', 'a:1']).stdout, '{"a":1}\n');
  assert.strictEqual(run(['--query', 'a:2'], 'a=2\n').stdout, '{"a":2}\n');
  const r = run(['-', f, '--agg', 'count'], 'a=2\n');
  assert.strictEqual(r.stdout, '{"type":"count","value":2}\n');
});

test('line counting: no trailing newline, empty input', () => {
  assert.strictEqual(run(['--stats'], 'a=1').stderr, 'lines=1 matched=1 malformed=0\n');
  assert.strictEqual(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
  assert.strictEqual(run(['--stats'], '\n\n').stderr, 'lines=2 matched=0 malformed=2\n');
});

test('agg json and table', () => {
  const f = tmp('c.log', 'level=error\nlevel=info\nlevel=error\nlevel=warning\nx=1\n');
  assert.strictEqual(run(['--agg', 'count by level', f]).stdout,
    '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1},{"key":"warning","count":1}]}\n');
  assert.strictEqual(run(['--agg', 'count by level', '--format', 'table', f]).stdout,
    'key      count\nerror    2\ninfo     1\nwarning  1\n');
  assert.strictEqual(run(['--agg', 'count', '--format', 'table', f]).stdout, '5\n');
  assert.strictEqual(run(['--agg', 'sum zz', '--format', 'table', f]).stdout, 'null\n');
});

test('table width with short keys', () => {
  const r = run(['--agg', 'count by a', '--format', 'table'], 'a=1\na=1\n');
  assert.strictEqual(r.stdout, 'key  count\n1    2\n');
});

test('exit codes and empty stdout on error', () => {
  let r = run(['--query', 'a AND'], 'a=1\n');
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 5/);
  r = run(['--agg', 'bogus'], 'a=1\n');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /invalid aggregation/);
  assert.strictEqual(r.stdout, '');
  for (const args of [['--nope'], ['--query'], ['--format', 'xml'], ['--format', 'table'], ['--agg']]) {
    r = run(args, 'a=1\n');
    assert.strictEqual(r.status, 2, args.join(' '));
    assert.strictEqual(r.stdout, '');
  }
  const good = tmp('d.log', 'a=1\n');
  const missing = path.join(dir, 'missing.log');
  r = run([good, missing]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
  r = run(['--query', 'a AND', missing]);
  assert.strictEqual(r.status, 2);
});

test('no match exits 0', () => {
  const r = run(['--query', 'zzz:1'], 'a=1\n');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
