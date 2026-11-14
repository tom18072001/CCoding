'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, 'ts=2024-01-01T10:00:00Z level=error status=500 msg="boom x"\r\n\r\nlevel=info status=200\r\ngarbage line\r\n');
fs.writeFileSync(f2, '{"level":"error","status":404}');
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });

test('in bản ghi không có @t, tuỳ chọn trước/sau tệp, nhiều tệp', () => {
  const a = run(['--query', 'level:error', f1, f2]);
  assert.strictEqual(a.status, 0);
  assert.strictEqual(a.stdout, '{"ts":"2024-01-01T10:00:00Z","level":"error","status":500,"msg":"boom x"}\n{"level":"error","status":404}\n');
  const b = run([f1, f2, '--query', 'level:error']);
  assert.strictEqual(b.stdout, a.stdout);
});

test('stdin và "-"', () => {
  assert.strictEqual(run(['--agg', 'count'], 'a=1\nb=2\n').stdout, '{"type":"count","value":2}\n');
  assert.strictEqual(run(['--agg', 'count', '-'], 'a=1').stdout, '{"type":"count","value":1}\n');
  assert.strictEqual(run(['--agg', 'count', '-', f2], 'a=1\n').stdout, '{"type":"count","value":2}\n');
});

test('--stats tính cả dòng rỗng, ra stderr', () => {
  const r = run(['--stats', f1]);
  assert.strictEqual(r.stderr, 'lines=4 matched=2 malformed=2\n');
});

test('table', () => {
  const r = run(['--agg', 'count by status', '--format', 'table', f1, f2]);
  assert.strictEqual(r.stdout, 'key  count\n200  1\n404  1\n500  1\n');
  const l = run(['--agg', 'count by k', '--format', 'table'], 'k=averyverylongkey\nk=a\nk=a\n');
  assert.strictEqual(l.stdout, 'key               count\na                 2\naveryverylongkey  1\n');
  assert.strictEqual(run(['--agg', 'sum zz', '--format', 'table'], 'a=1\n').stdout, 'null\n');
  assert.strictEqual(run(['--agg', 'sum a', '--format', 'table'], 'a=1\na=2\n').stdout, '3\n');
  const h = run(['--agg', 'histogram 1h', '--format', 'table', f1]);
  assert.strictEqual(h.stdout, 'key                       count\n2024-01-01T10:00:00.000Z  1\n');
});

test('mã thoát 2, stdout trống', () => {
  const cases = [
    ['--bogus'], ['-x'], ['--query'], ['--agg'], ['--format'], ['--format', 'xml', f1],
    ['--format', 'table', f1], ['--query', '(a', f1], ['--agg', 'nope', f1],
  ];
  for (const c of cases) {
    const r = run(c, '');
    assert.strictEqual(r.status, 2, c.join(' '));
    assert.strictEqual(r.stdout, '', c.join(' '));
  }
  assert.match(run(['--query', 'a AND )'], '').stderr, /syntax error at position 6/);
});

test('mã thoát 1 khi không đọc được tệp, stdout trống', () => {
  const missing = path.join(dir, 'nope.log');
  const r = run([f1, missing]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + missing));
});

test('không khớp gì vẫn mã 0', () => {
  const r = run(['--query', 'zzz:1', f1]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
