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
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, 'ts=2024-01-01T00:00:00Z level=error status=500 msg="boom"\n\nlevel=info status=200\r\ngarbage\n');
fs.writeFileSync(f2, '{"level":"error","http":{"status":503},"time":"2024-01-01T00:02:00Z"}');
const run = (args, input) => spawnSync('node', [bin, ...args], { input, encoding: 'utf8' });

test('in bản ghi, không có @t, nhiều tệp, tùy chọn sau tệp', () => {
  const r = run([f1, f2, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n{"level":"error","http.status":503,"time":"2024-01-01T00:02:00Z"}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('stdin và -', () => {
  const r = run(['--agg', 'count', '-'], 'a=1\nb=2\n');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['--agg', 'count'], '').stdout, '{"type":"count","value":0}\n');
});

test('table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1, f2]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'avg status', '--format', 'table', f1]).stdout, '350\n');
  assert.equal(run(['--agg', 'max zz', '--format', 'table', f1]).stdout, 'null\n');
  assert.equal(run(['--agg', 'histogram 1m', '--format', 'table', f1, f2]).stdout,
    'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  0\n2024-01-01T00:02:00.000Z  1\n');
});

test('mã thoát', () => {
  let r = run(['--query', 'a AND', f1]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 5/);
  for (const a of [['--agg', 'nope'], ['--bogus'], ['--format', 'table'], ['--format', 'xml', '--agg', 'count'], ['--query']]) {
    r = run([f1, ...a]);
    assert.equal(r.status, 2, a.join(' '));
    assert.equal(r.stdout, '');
  }
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(run(['--query', 'level:nomatch', f1]).status, 0);
});

test('--opt=value, --, top table, thiếu tệp thắng khi cú pháp đúng, stdout trống khi lỗi', () => {
  assert.equal(run(['--agg=count', '--query=level:error', f1]).stdout, '{"type":"count","value":1}\n');
  assert.equal(run(['--agg', 'top 1 level', '--format', 'table', f1, f2]).stdout, 'key    count\nerror  2\n');
  let r = run(['--query', 'a AND', path.join(dir, 'missing.log')]);
  assert.equal(r.status, 2);
  r = run(['--stats', path.join(dir, 'missing.log'), f1]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(run(['--query', 'level:nomatch', '--stats', f1]).stderr, 'lines=4 matched=0 malformed=2\n');
  assert.equal(run(['--query', 'level:nomatch', f1]).stdout, '');
});
