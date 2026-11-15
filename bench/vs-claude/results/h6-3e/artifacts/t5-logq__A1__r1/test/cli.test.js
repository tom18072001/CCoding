'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' });
const file = (name, content) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

const LOG = [
  'ts=2024-01-01T00:00:10Z level=error status=500 msg="db down"',
  '{"@timestamp":"2024-01-01T00:02:10Z","level":"info","http":{"status":200},"msg":"ok"}',
  '',
  'garbage line here',
  'level=error status=503 path=/api/x',
  '',
].join('\n');

test('prints matching records without @t, in order', () => {
  const r = run(['--query', 'level:error'], LOG);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:10Z","level":"error","status":500,"msg":"db down"}\n{"level":"error","status":503,"path":"/api/x"}\n');
  assert.equal(r.stderr, '');
});

test('no query prints all, no match is exit 0 with empty stdout', () => {
  assert.equal(run([], LOG).stdout.split('\n').length, 4);
  const r = run(['--query', 'level:zzz'], LOG);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('--stats', () => {
  const r = run(['--query', 'level:error', '--stats'], LOG);
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  assert.equal(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
  assert.equal(run(['--stats'], 'a=1').stderr, 'lines=1 matched=1 malformed=0\n');
  assert.equal(run(['--stats'], 'a=1\r\n\r\nb=2\r\n').stderr, 'lines=3 matched=2 malformed=1\n');
});

test('files, stdin dash, options after files', () => {
  const a = file('a.log', 'n=1\nn=2\n');
  const b = file('b.log', 'n=3');
  let r = run([a, b, '--agg', 'sum n']);
  assert.equal(r.stdout, '{"type":"sum","field":"n","value":6}\n');
  r = run([a, '-', '--stats', '--agg', 'count'], 'n=9\n');
  assert.equal(r.stdout, '{"type":"count","value":3}\n');
  assert.equal(r.stderr, 'lines=3 matched=3 malformed=0\n');
});

test('agg json and table', () => {
  let r = run(['--agg', 'count by level'], LOG);
  assert.equal(r.stdout, '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1}]}\n');
  r = run(['--agg', 'count by level', '--format', 'table'], LOG);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'top 1 level', '--format', 'table'], LOG);
  assert.equal(r.stdout, 'key    count\nerror  2\n');
  r = run(['--agg', 'count', '--format', 'table'], LOG);
  assert.equal(r.stdout, '3\n');
  r = run(['--agg', 'avg nothing', '--format', 'table'], LOG);
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'avg nothing'], LOG);
  assert.equal(r.stdout, '{"type":"avg","field":"nothing","value":null}\n');
  r = run(['--agg', 'p50 status', '--format', 'table'], LOG);
  assert.equal(r.stdout, '500\n');
  r = run(['--agg', 'count by x', '--format', 'table'], LOG);
  assert.equal(r.stdout, 'key  count\n');
});

test('table with long and short keys', () => {
  const r = run(['--agg', 'count by k', '--format', 'table'], 'k=a\nk=b\nk=b\nk=10\n');
  assert.equal(r.stdout, 'key  count\nb    2\n10   1\na    1\n');
});

test('histogram table', () => {
  const r = run(['--agg', 'histogram 1m', '--format', 'table'], LOG);
  assert.equal(r.stdout, [
    'key                       count',
    '2024-01-01T00:00:00.000Z  1',
    '2024-01-01T00:01:00.000Z  0',
    '2024-01-01T00:02:00.000Z  1',
    '',
  ].join('\n'));
});

test('exit 2: query syntax error', () => {
  const r = run(['--query', '(a:1'], 'a=1\n');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 4/);
});

test('exit 2: bad spec and usage errors', () => {
  const cases = [
    ['--agg', 'bogus'],
    ['--format', 'table'],
    ['--format', 'xml', '--agg', 'count'],
    ['--bogus'],
    ['-x'],
    ['--query'],
    ['--agg'],
    ['--format'],
  ];
  for (const args of cases) {
    const r = run(args, 'a=1\n');
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.equal(r.stdout, '', JSON.stringify(args));
    assert.notEqual(r.stderr, '');
  }
  assert.match(run(['--agg', 'bogus']).stderr, /invalid aggregation/);
});

test('exit 1: unreadable file, nothing on stdout', () => {
  const good = file('good.log', 'a=1\n');
  const missing = path.join(dir, 'missing.log');
  const r = run([good, missing]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
  assert.equal(run([dir]).status, 1);
});

test('query is validated before files are read (exit 2 wins)', () => {
  assert.equal(run(['--query', ')', path.join(dir, 'nope')]).status, 2);
});

test('query with keywords and empty --query', () => {
  const r = run(['--query', 'NOT level:info AND status>=503'], LOG);
  assert.equal(r.stdout, '{"level":"error","status":503,"path":"/api/x"}\n');
  assert.equal(run(['--query', ''], 'a=1\n').stdout, '{"a":1}\n');
});
