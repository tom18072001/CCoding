'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query');

function posOf(q) {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError, `not QuerySyntaxError for ${q}`);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e instanceof Error);
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`));
    return e.position;
  }
  assert.fail(`no error for ${JSON.stringify(q)}`);
}

test('vị trí lỗi: ngoặc', () => {
  assert.equal(posOf('(a'), 2);
  assert.equal(posOf('(a OR b'), 7);
  assert.equal(posOf('a)'), 1);
  assert.equal(posOf('a b )'), 4);
  assert.equal(posOf('()'), 1);
  assert.equal(posOf('x ( )'), 4);
});

test('vị trí lỗi: toán tử thiếu toán hạng', () => {
  assert.equal(posOf('a AND'), 5);
  assert.equal(posOf('a OR'), 4);
  assert.equal(posOf('NOT'), 3);
  assert.equal(posOf('AND a'), 0);
  assert.equal(posOf('OR a'), 0);
  assert.equal(posOf('(AND a)'), 1);
  assert.equal(posOf('a AND OR b'), 6);
  assert.equal(posOf('NOT AND a'), 4);
  assert.equal(posOf('a OR OR b'), 5);
});

test('vị trí lỗi: so sánh, field:, ngoặc kép', () => {
  assert.equal(posOf('status>=abc'), 8);
  assert.equal(posOf('status>='), 8);
  assert.equal(posOf('a status<x'), 9);
  assert.equal(posOf('status>5.'), 7);
  assert.equal(posOf('field:'), 6);
  assert.equal(posOf('a field: b'), 8);
  assert.equal(posOf('"abc'), 0);
  assert.equal(posOf('a msg:"abc'), 6);
  assert.equal(posOf('a "b\\"'), 2);
});

test('lỗi đứng trước được báo trước ngoặc kép không đóng', () => {
  assert.equal(posOf(') "abc'), 0);
});

test('truy vấn rỗng khớp tất cả', () => {
  assert.equal(compile('')({ a: 1 }), true);
  assert.equal(compile('   ')({}), true);
});

test('độ ưu tiên NOT > AND > OR và AND ngầm', () => {
  const r = { msg: 'hello world', level: 'info' };
  assert.equal(compile('level:error OR hello level:info')(r), true);
  assert.equal(compile('level:error AND hello OR world')(r), true);
  assert.equal(compile('NOT level:error hello')(r), true);
  assert.equal(compile('NOT (level:info)')(r), false);
  assert.equal(compile('and')({ msg: 'rand' }), true);
  assert.equal(compile('hello and')(r), false);
});

test('field:value, wildcard, không phân biệt hoa/thường', () => {
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('level:ERR*')({ level: 'error' }), true);
  assert.equal(compile('level:err')({ level: 'error' }), false);
  assert.equal(compile('level:e?ror')({ level: 'error' }), true);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('a:*')({ a: '' }), true);
  assert.equal(compile('a:*')({ a: null }), false);
  assert.equal(compile('a:*')({}), false);
  assert.equal(compile('msg:"a*b"')({ msg: 'axxb' }), false);
  assert.equal(compile('msg:"a*b"')({ msg: 'A*B' }), true);
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
});

test('so sánh số theo kiểu', () => {
  assert.equal(compile('s>=500')({ s: '500' }), true);
  assert.equal(compile('s>500')({ s: 500 }), false);
  assert.equal(compile('s<-1')({ s: -2 }), true);
  assert.equal(compile('s>=1')({ s: true }), false);
  assert.equal(compile('s>=1')({ s: 'abc' }), false);
  assert.equal(compile('s>=1')({}), false);
  assert.equal(compile('s<=1.5')({ s: '1.5' }), true);
});

test('_exists_ và WORD/QUOTED', () => {
  assert.equal(compile('_exists_:a')({ a: 0 }), true);
  assert.equal(compile('_exists_:a')({ a: null }), false);
  assert.equal(compile('_exists_:a')({}), false);
  assert.equal(compile('timeout')({ message: 'Timeout!' }), true);
  assert.equal(compile('timeout')({ msg: 'x', message: 'timeout' }), false);
  assert.equal(compile('timeout')({}), false);
  assert.equal(compile('"a (b) c"')({ msg: 'x a (b) c' }), true);
  assert.equal(compile('(a OR "b c") d')({ msg: 'b c d' }), true);
});
