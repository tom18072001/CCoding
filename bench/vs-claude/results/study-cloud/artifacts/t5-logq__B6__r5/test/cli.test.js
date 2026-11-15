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
  return spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });
}

const DATA = [
  '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z","msg":"boom"}',
  'level=info status=200 ts=2024-01-01T00:01:00Z msg=ok',
  '',
  'garbage line',
  'level=error status=503 ts=2024-01-01T00:03:00Z',
].join('\n');

test('không agg: in record không có @t, đúng thứ tự', () => {
  const f = tmp('a.log', DATA + '\n');
  const r = run(['--query', 'level:error', f]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout,
    '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z","msg":"boom"}\n' +
    '{"level":"error","status":503,"ts":"2024-01-01T00:03:00Z"}\n');
});

test('stdin, --stats, dòng cuối không có \\n', () => {
  const r = run(['--stats'], DATA);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stderr, 'lines=5 matched=3 malformed=2\n');
  assert.strictEqual(r.stdout.split('\n').length, 4);
});

test('có \\n cuối không đếm thêm dòng', () => {
  const r = run(['--stats', '-'], 'a=1\n\n');
  assert.strictEqual(r.stderr, 'lines=2 matched=1 malformed=1\n');
});

test('tùy chọn đứng sau tệp, nhiều tệp', () => {
  const f1 = tmp('b1.log', 'a=1\n');
  const f2 = tmp('b2.log', 'a=2\n');
  const r = run([f1, f2, '--agg', 'sum a', '--stats']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"type":"sum","field":"a","value":3}\n');
  assert.strictEqual(r.stderr, 'lines=2 matched=2 malformed=0\n');
});

test('agg json và table', () => {
  const f = tmp('c.log', DATA);
  let r = run(['--agg', 'count by level', f]);
  assert.strictEqual(r.stdout,
    '{"type":"count_by","field":"level","buckets":[{"key":"error","count":2},{"key":"info","count":1}]}\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.strictEqual(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'count', '--format', 'table', f]);
  assert.strictEqual(r.stdout, '3\n');
  r = run(['--agg', 'max nope', '--format', 'table', f]);
  assert.strictEqual(r.stdout, 'null\n');
});

test('không khớp vẫn exit 0', () => {
  const r = run(['--query', 'level:zzz'], DATA);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('exit 2: query sai, agg sai, tùy chọn sai', () => {
  const f = tmp('d.log', DATA);
  let r = run(['--query', '(a', f]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.strictEqual(r.stdout, '');
  r = run(['--agg', 'bogus', f]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /invalid aggregation/);
  assert.strictEqual(r.stdout, '');
  for (const args of [['--nope'], ['--query'], [f, '--agg'], ['--format', 'xml', '--agg', 'count'], ['--format', 'table', f]]) {
    r = run(args, '');
    assert.strictEqual(r.status, 2, args.join(' '));
    assert.strictEqual(r.stdout, '');
  }
});

test('exit 1: tệp không đọc được, stdout rỗng', () => {
  const f = tmp('e.log', 'a=1\n');
  const missing = path.join(dir, 'missing.log');
  const r = run([f, missing]);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.includes('cannot read ' + missing));
  assert.strictEqual(r.stdout, '');
});
