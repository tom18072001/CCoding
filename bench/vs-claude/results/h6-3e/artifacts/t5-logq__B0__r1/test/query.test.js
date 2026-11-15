'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query'));

const m = (q, r) => compile(q)(r);

test('truy vấn rỗng khớp tất cả', () => {
  assert.strictEqual(m('', {}), true);
  assert.strictEqual(m('   ', { a: 1 }), true);
});

test('ưu tiên NOT > AND > OR, AND ngầm', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.strictEqual(m('a:9 AND b:2 OR c:3', r), true);
  assert.strictEqual(m('a:9 AND (b:2 OR c:3)', r), false);
  assert.strictEqual(m('a:1 b:2 c:3', r), true);
  assert.strictEqual(m('a:1 b:9 c:3', r), false);
  assert.strictEqual(m('NOT a:9 AND b:2', r), true);
  assert.strictEqual(m('NOT a:1 OR b:2', r), true);
  assert.strictEqual(m('NOT NOT a:1', r), true);
  assert.strictEqual(m('a:1 OR b:9 b:9', r), true);
});

test('and/or thường là từ tìm kiếm', () => {
  assert.strictEqual(m('and', { msg: 'rock and roll' }), true);
  assert.strictEqual(m('a or b', { msg: 'a or b' }), true);
  assert.strictEqual(m('a or b', { msg: 'a b' }), false);
});

test('field:value không phân biệt hoa/thường, toàn chuỗi, wildcard, null', () => {
  assert.strictEqual(m('level:ERROR', { level: 'error' }), true);
  assert.strictEqual(m('level:err', { level: 'error' }), false);
  assert.strictEqual(m('status:500', { status: 500 }), true);
  assert.strictEqual(m('status:500', { status: '500' }), true);
  assert.strictEqual(m('path:/api/*', { path: '/api/users' }), true);
  assert.strictEqual(m('path:*', { path: '' }), true);
  assert.strictEqual(m('c:a?c', { c: 'abc' }), true);
  assert.strictEqual(m('c:a?c', { c: 'ac' }), false);
  assert.strictEqual(m('c:a.c', { c: 'abc' }), false);
  assert.strictEqual(m('c:*', { c: null }), false);
  assert.strictEqual(m('c:*', {}), false);
  assert.strictEqual(m('ok:true', { ok: true }), true);
});

test('QUOTED chính xác, không wildcard', () => {
  assert.strictEqual(m('msg:"a*"', { msg: 'a*' }), true);
  assert.strictEqual(m('msg:"a*"', { msg: 'abc' }), false);
  assert.strictEqual(m('msg:"Connection Reset"', { msg: 'connection reset' }), true);
  assert.strictEqual(m('msg:"connection"', { msg: 'connection reset' }), false);
  assert.strictEqual(m('msg:"a\\"b"', { msg: 'a"b' }), true);
});

test('so sánh số', () => {
  assert.strictEqual(m('s>=500', { s: 500 }), true);
  assert.strictEqual(m('s>500', { s: 500 }), false);
  assert.strictEqual(m('s<=500', { s: '500' }), true);
  assert.strictEqual(m('s<500', { s: '499.5' }), true);
  assert.strictEqual(m('s>-1', { s: -0.5 }), true);
  assert.strictEqual(m('s>=1', { s: 'abc' }), false);
  assert.strictEqual(m('s>=1', { s: true }), false);
  assert.strictEqual(m('s>=1', { s: null }), false);
  assert.strictEqual(m('s>=1', {}), false);
});

test('_exists_ và tìm trong msg/message', () => {
  assert.strictEqual(m('_exists_:a', { a: 0 }), true);
  assert.strictEqual(m('_exists_:a', { a: null }), false);
  assert.strictEqual(m('_exists_:a', {}), false);
  assert.strictEqual(m('TIMEOUT', { msg: 'a timeout' }), true);
  assert.strictEqual(m('timeout', { message: 'a Timeout' }), true);
  assert.strictEqual(m('timeout', { msg: 'x', message: 'timeout' }), false);
  assert.strictEqual(m('timeout', {}), false);
  assert.strictEqual(m('"a (b) AND c"', { msg: 'x a (b) AND c y' }), true);
});

const errCases = [
  ['(a', 2], ['(a AND b', 8], ['a)', 1], ['  a )', 4], ['()', 1], ['( )', 2],
  ['a AND', 5], ['a AND  ', 7], ['NOT', 3], ['a OR NOT', 8],
  ['AND a', 0], ['  OR a', 2], ['(AND a)', 1], ['( OR a)', 2],
  ['a AND AND b', 6], ['a OR AND b', 5], ['NOT OR a', 4], ['NOT AND a', 4],
  ['status>=abc', 8], ['status>=', 8], ['  x status>', 11], ['a:1 s<=x', 7],
  ['msg:', 4], ['  msg:', 6], ['a msg: b', 6],
  ['"abc', 0], ['a "abc', 2], ['msg:"abc', 4], ['(a AND "x', 7],
  [') "x', 0], ['"x ) )', 0], ['a AND AND "x', 6], ['(a ) )', 5], ['() AND', 1],
  ['status>=abc msg:', 8], ['msg: status>=x', 4],
];
for (const [q, pos] of errCases) {
  test('lỗi cú pháp ' + JSON.stringify(q) + ' @' + pos, () => {
    assert.throws(() => compile(q), (e) => {
      assert.ok(e instanceof QuerySyntaxError);
      assert.ok(e instanceof Error);
      assert.strictEqual(e.name, 'QuerySyntaxError');
      assert.strictEqual(e.position, pos);
      assert.ok(e.message.startsWith('syntax error at position ' + pos));
      return true;
    });
  });
}
