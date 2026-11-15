'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f = path.join(dir, 'a.log');
fs.writeFileSync(f, 'a=1 msg=hi\r\n\nbad line\na=2 ts=2024-01-01T00:00:00Z\n');

test('--opt=value và -- bị coi là tùy chọn lạ (mã 2, stdout trống)', () => {
  for (const a of [['--query=a:1', f], ['--', f], ['--bogus']]) {
    const r = run(a);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(r.stdout, '');
  }
});
test('tùy chọn sau tệp, @t bị bỏ, stats', () => {
  const r = run([f, '--query', 'a:2', '--stats']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"a":2,"ts":"2024-01-01T00:00:00Z"}\n');
  assert.strictEqual(r.stderr, 'lines=4 matched=1 malformed=2\n');
});
test('stdin và -', () => {
  assert.strictEqual(run([], 'a=1\n').stdout, '{"a":1}\n');
  assert.strictEqual(run(['-'], 'a=1').stdout, '{"a":1}\n');
});
test('table không agg → 2; thiếu giá trị → 2; format sai → 2', () => {
  assert.strictEqual(run(['--format', 'table', f]).status, 2);
  assert.strictEqual(run(['--query']).status, 2);
  assert.strictEqual(run(['--format', 'xml', '--agg', 'count', f]).status, 2);
});
test('lỗi truy vấn / agg → 2, tệp không đọc được → 1', () => {
  const q = run(['--query', 'a:1 )', f]);
  assert.strictEqual(q.status, 2);
  assert.match(q.stderr, /syntax error at position 4/);
  assert.strictEqual(run(['--agg', 'nope', f]).status, 2);
  const m = run([path.join(dir, 'missing')]);
  assert.strictEqual(m.status, 1);
  assert.match(m.stderr, /cannot read /);
  assert.strictEqual(m.stdout, '');
});
test('table count_by căn cột, giá trị đơn', () => {
  const r = run(['--agg', 'count by a', '--format', 'table', f]);
  assert.strictEqual(r.stdout, 'key  count\n1    1\n2    1\n');
  assert.strictEqual(run(['--agg', 'sum a', '--format', 'table', f]).stdout, '3\n');
  assert.strictEqual(run(['--agg', 'max zz', '--format', 'table', f]).stdout, 'null\n');
});
test('json agg một dòng; không khớp vẫn mã 0', () => {
  assert.strictEqual(run(['--agg', 'count', f]).stdout, '{"type":"count","value":2}\n');
  const r = run(['--query', 'a:99', f]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
