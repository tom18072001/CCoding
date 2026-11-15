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

function tmp(name, content) { const p = path.join(dir, name); fs.writeFileSync(p, content); return p; }
function run(args, input) { return spawnSync('node', [BIN, ...args], { input: input === undefined ? '' : input, encoding: 'utf8' }); }

const DATA = [
  '{"@timestamp":"2024-01-01T00:00:00Z","level":"info","status":200,"msg":"ok"}',
  'level=error status=500 msg="boom here" ts=2024-01-01T00:01:00Z',
  'garbage line',
  '',
  '{"level":"info","status":404}',
].join('\n') + '\n';

test('stdin, không có @t, bỏ qua dòng lỗi', () => {
  const r = run([], DATA);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.stdout.split('\n'), [
    '{"@timestamp":"2024-01-01T00:00:00Z","level":"info","status":200,"msg":"ok"}',
    '{"level":"error","status":500,"msg":"boom here","ts":"2024-01-01T00:01:00Z"}',
    '{"level":"info","status":404}',
    '',
  ]);
});

test("'-' là stdin, tùy chọn trước/sau tệp", () => {
  const f = tmp('a.log', 'level=a\n');
  const r = run(['-', f, '-q', 'level:a'], 'level=a\n');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{"level":"a"}\n{"level":"a"}\n');
  const r2 = run([f, '--query', 'level:b']);
  assert.strictEqual(r2.status, 0);
  assert.strictEqual(r2.stdout, '');
});

test('nhiều tệp theo thứ tự; dòng cuối không có \\n vẫn tính', () => {
  const a = tmp('1.log', 'n=1\nn=2');
  const b = tmp('2.log', 'n=3\n');
  const r = run([a, b]);
  assert.strictEqual(r.stdout, '{"n":1}\n{"n":2}\n{"n":3}\n');
});

test('stats: dòng rỗng giữa tệp được tính, \\n cuối không tạo dòng thêm', () => {
  const r = run(['--stats', '-q', 'status>=400'], DATA);
  assert.strictEqual(r.stderr, 'lines=5 matched=2 malformed=2\n');
  assert.strictEqual(run(['--stats'], 'a=1\n').stderr, 'lines=1 matched=1 malformed=0\n');
  assert.strictEqual(run(['--stats'], 'a=1').stderr, 'lines=1 matched=1 malformed=0\n');
  assert.strictEqual(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
  assert.strictEqual(run(['--stats'], '\n').stderr, 'lines=1 matched=0 malformed=1\n');
});

test('agg json', () => {
  const r = run(['--agg', 'count by level'], DATA);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), { type: 'count_by', field: 'level', buckets: [{ key: 'info', count: 2 }, { key: 'error', count: 1 }] });
  assert.strictEqual(r.stdout.endsWith('\n'), true);
  assert.deepStrictEqual(JSON.parse(run(['--agg', 'count', '--format', 'json'], DATA).stdout), { type: 'count', value: 3 });
});

test('table: giá trị đơn và null', () => {
  assert.strictEqual(run(['--agg', 'sum status', '--format', 'table'], DATA).stdout, '1104\n');
  assert.strictEqual(run(['--agg', 'count', '--format', 'table'], DATA).stdout, '3\n');
  assert.strictEqual(run(['--agg', 'max nope', '--format', 'table'], DATA).stdout, 'null\n');
});

test('table: count_by căn cột', () => {
  const r = run(['--agg', 'count by level', '--format', 'table'], 'level=info\nlevel=info\nlevel=error\n');
  assert.strictEqual(r.stdout, 'key    count\ninfo   2\nerror  1\n');
  const r2 = run(['--agg', 'top 1 s', '--format', 'table'], 's=a\n');
  assert.strictEqual(r2.stdout, 'key  count\na    1\n');
});

test('table: histogram', () => {
  const r = run(['--agg', 'histogram 1m', '--format', 'table'], DATA);
  assert.strictEqual(r.stdout, 'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  1\n');
});

test('exit 2: lỗi cú pháp truy vấn, stdout trống, kể cả khi tệp không tồn tại', () => {
  const r = run(['-q', 'a AND', path.join(dir, 'missing')]);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 5/);
});

test('exit 2: spec agg sai, tùy chọn sai', () => {
  for (const args of [['--agg', 'bogus'], ['--agg', 'top 0 x'], ['--bogus'], ['-q'], ['--agg'], ['--format'],
    ['--format', 'xml', '--agg', 'count'], ['--format', 'table'], ['--format', 'table', '-q', 'a:1']]) {
    const r = run(args, 'a=1\n');
    assert.strictEqual(r.status, 2, args.join(' '));
    assert.strictEqual(r.stdout, '');
    assert.notStrictEqual(r.stderr, '');
  }
});

test('exit 1: không đọc được tệp, stdout trống dù tệp lỗi ở giữa', () => {
  const ok = tmp('ok.log', 'a=1\n');
  const bad = path.join(dir, 'nope.log');
  const r = run([ok, bad, ok]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.ok(r.stderr.includes(`cannot read ${bad}`));
  assert.strictEqual(run([dir]).status, 1);
});

test('exit 0 khi không khớp', () => {
  const r = run(['-q', 'zzz:1'], 'a=1\n');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
