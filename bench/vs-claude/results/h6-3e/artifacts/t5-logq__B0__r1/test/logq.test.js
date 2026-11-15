'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const P = (l) => parseLine(l);

test('parse: JSON làm phẳng, mảng giữ, lỗi', () => {
  assert.deepEqual(P('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"b":2}]}').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.deepEqual(P('{bad'), { ok: false });
  assert.deepEqual(P('   '), { ok: false });
  assert.deepEqual(P('{"a":1}\r').record, { a: 1 });
});

test('parse: logfmt', () => {
  assert.deepEqual(P('a=1 b=x\tc= d="42" e=true f=null g=-1.5 a=2').record,
    { a: 2, b: 'x', c: '', d: '42', e: true, f: null, g: -1.5 });
  assert.equal(P('m="a \\"b\\" \\\\ \\n \\q"').record.m, 'a "b" \\ \n \\q');
  for (const bad of ['word', 'a=1 word', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(P(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(P('ts=2024-01-01T00:00:01Z').record['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in P('ts=2024-01-01').record, false);
  assert.equal('@t' in P('ts=bad time=2024-01-01T00:00:01Z').record, false);
  assert.ok('@t' in P('{"@timestamp":"2024-01-01T00:00:01Z","ts":"x"}').record);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', { a: 1 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/API/users' }), true);
  assert.equal(m('c:a?c', { c: 'abc' }), true);
  assert.equal(m('c:"a*"', { c: 'abc' }), false);
  assert.equal(m('c:"a*"', { c: 'a*' }), true);
  assert.equal(m('s>=5', { s: '5' }), true);
  assert.equal(m('s>5', { s: true }), false);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { message: 'Big BOOM' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('and', { msg: 'sand' }), true);
  assert.equal(m('a:1 OR b:1 AND c:1', { a: 1 }), true);
  assert.equal(m('NOT (a:1 OR b:1)', { c: 1 }), true);
  assert.equal(m('msg:"conn reset" x:1', { msg: 'Conn Reset', x: 1 }), true);
  assert.equal(m('"a (b)"', { msg: 'xa (b)' }), true);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => {
    try { compile(q); } catch (e) {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.ok(e.message.startsWith('syntax error at position ' + e.position));
      return e.position;
    }
    return null;
  };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
});

test('agg', () => {
  const recs = [{ s: 'b', n: 1 }, { s: 'a', n: '2' }, { s: 'b', n: 3 }, { s: 1 }, { s: null }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(recs, 'count by s').buckets, [{ key: 'b', count: 2 }, { key: 1, count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(recs, 'top 1 s').buckets, [{ key: 'b', count: 2 }]);
  assert.equal(aggregate(recs, 'avg n').value, 2);
  assert.equal(aggregate(recs, 'sum zz').value, null);
  const r = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ n }));
  assert.equal(aggregate(r, 'p90 n').value, 9);
  assert.equal(aggregate(r, 'p50 n').type, 'p50');
  const h = aggregate([{ '@t': 0 }, { '@t': 3 * 60000 + 5 }, { x: 1 }], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [1, 0, 0, 1]);
  assert.equal(h.buckets[1].key, '1970-01-01T00:01:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 5m').buckets, []);
  for (const bad of ['', 'foo', 'top 0 a', 'histogram 0m', 'histogram 1x', 'count by', 'p80 a']) {
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/, bad);
  }
});

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\nlevel=info status=200 ts=2024-01-01T00:02:00Z\n');
  let r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  r = run(['--agg', 'histogram 1m', f]);
  assert.equal(JSON.parse(r.stdout).buckets.length, 3);
  r = run(['--agg', 'count', '--format', 'table'], 'a=1\na=2\n');
  assert.equal(r.stdout, '2\n');
  r = run(['--agg', 'max zz', '--format', 'table', '-'], 'a=1\n');
  assert.equal(r.stdout, 'null\n');
  for (const args of [['--query', '(a', f], ['--agg', 'nope', f], ['--bogus'], ['--format', 'table', f], ['--format', 'xml'], ['--query']]) {
    r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', '(a', f]).stderr, /syntax error at position 2/);
  r = run([path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(r.stdout, '');
  fs.rmSync(dir, { recursive: true, force: true });
});
