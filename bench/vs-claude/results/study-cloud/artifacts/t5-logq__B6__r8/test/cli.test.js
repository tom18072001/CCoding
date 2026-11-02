'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, [
  '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}',
  '',
  'level=info status=200 msg="ok fine"',
  'garbage line',
  '{"ts":"2024-01-01T00:02:00Z","level":"error","status":503}\r',
].join('\n')); // không có \n cuối
const run = (args, input) => spawnSync('node', [BIN, ...args], { input: input || '', encoding: 'utf8' });

test('lọc, bỏ @t, option sau tệp, stats', () => {
  const r = run([f1, '--query', 'level:error', '--stats']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout,
    '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n' +
    '{"ts":"2024-01-01T00:02:00Z","level":"error","status":503}\n');
  assert.strictEqual(r.stderr.trim(), 'lines=5 matched=2 malformed=2');
});

test('stdin và -', () => {
  const r = run(['--agg', 'count', '-'], 'a=1\nb=2\n');
  assert.strictEqual(r.stdout, '{"type":"count","value":2}\n');
  assert.strictEqual(run(['--agg', 'count']).stdout, '{"type":"count","value":0}\n');
});

test('nhiều tệp + bảng count_by', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1, f1]);
  assert.strictEqual(r.stdout, 'key    count\nerror  4\ninfo   2\n');
});

test('bảng vô hướng và null', () => {
  assert.strictEqual(run(['--agg', 'sum status', '--format', 'table', f1]).stdout, '1203\n');
  assert.strictEqual(run(['--agg', 'max nope', '--format', 'table', f1]).stdout, 'null\n');
});

test('lỗi truy vấn / agg / tùy chọn → 2, stdout rỗng', () => {
  let r = run(['--query', '(a', f1]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.strictEqual(r.stdout, '');
  r = run(['--agg', 'bogus', f1]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /invalid aggregation/);
  for (const a of [['--nope'], ['--query'], ['--format', 'xml'], ['--format', 'table', f1]]) {
    const x = run(a);
    assert.strictEqual(x.status, 2, a.join(' '));
    assert.strictEqual(x.stdout, '');
  }
});

test('tệp không đọc được → 1', () => {
  const missing = path.join(dir, 'missing.log');
  const r = run([f1, missing]);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.includes(`cannot read ${missing}`));
  assert.strictEqual(r.stdout, '');
});
