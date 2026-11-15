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
const file = (name, content) => { const p = path.join(dir, name); fs.writeFileSync(p, content); return p; };
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' });

const LOG = [
  'ts=2024-01-01T00:00:00Z level=error status=500 path=/a',
  '{"@timestamp":"2024-01-01T00:02:00Z","level":"info","status":200}',
  '',
  'garbage line',
  'ts=2024-01-01T00:01:00Z level=error status=503 path=/b',
].join('\n') + '\n';

test('in bản ghi khớp, không có @t', () => {
  const f = file('a.log', LOG);
  const r = run(['--query', 'level:error', f]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout,
    '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"path":"/a"}\n' +
    '{"ts":"2024-01-01T00:01:00Z","level":"error","status":503,"path":"/b"}\n');
});

test('tùy chọn đứng sau tệp, nhiều tệp, stdin', () => {
  const f = file('b.log', LOG);
  assert.equal(run([f, f, '--agg', 'count']).stdout, '{"type":"count","value":6}\n');
  const s = run(['--agg', 'count', '-'], LOG);
  assert.equal(s.stdout, '{"type":"count","value":3}\n');
  assert.equal(run(['--agg', 'count'], LOG).stdout, s.stdout);
});

test('--stats', () => {
  const r = run(['--stats', '--query', 'status>=500', file('c.log', LOG)]);
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  assert.equal(run(['--stats'], 'a=1').stderr, 'lines=1 matched=1 malformed=0\n');
  assert.equal(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
});

test('table', () => {
  const f = file('d.log', LOG);
  assert.equal(run(['--agg', 'count', '--format', 'table', f]).stdout, '3\n');
  assert.equal(run(['--agg', 'max nope', '--format', 'table', f]).stdout, 'null\n');
  assert.equal(run(['--agg', 'count by level', '--format', 'table', f]).stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'count by status', '--format', 'table', f]).stdout, 'key  count\n200  1\n500  1\n503  1\n');
  assert.equal(run(['--agg', 'histogram 1m', '--format', 'table', f]).stdout,
    'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  1\n2024-01-01T00:02:00.000Z  1\n');
  assert.equal(run(['--agg', 'count by level', '--format', 'json', f]).stdout,
    '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1}]}\n');
});

test('không khớp gì vẫn mã 0', () => {
  const r = run(['--query', 'level:nothing', file('e.log', LOG)]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('mã thoát 2', () => {
  const f = file('f.log', LOG);
  for (const args of [['--query', 'a AND', f], ['--agg', 'bogus', f], ['--bogus', f], ['--format', 'table', f],
    ['--format', 'xml', '--agg', 'count', f], ['--query'], ['-x']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', 'a AND', f]).stderr, /syntax error at position 5/);
  assert.match(run(['--agg', 'bogus', f]).stderr, /invalid aggregation/);
});

test('mã thoát 1', () => {
  const missing = path.join(dir, 'missing.log');
  const r = run(['--agg', 'count', file('g.log', LOG), missing]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
});
