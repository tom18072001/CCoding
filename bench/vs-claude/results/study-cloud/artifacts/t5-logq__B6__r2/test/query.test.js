'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src/query');

const pos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`));
    return e.position;
  }
  return 'no error';
};

test('truy vấn rỗng khớp tất cả', () => {
  assert.equal(compile('')({ a: 1 }), true);
  assert.equal(compile('   ')({}), true);
});

test('field:value, wildcard, không phân biệt hoa thường', () => {
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('status:500')({ status: 5000 }), false);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('lvl:e?r')({ lvl: 'ERR' }), true);
  assert.equal(compile('lvl:e?r')({ lvl: 'eRRx' }), false);
  assert.equal(compile('a:x')({ a: null }), false);
  assert.equal(compile('a:*')({ a: '' }), true);
  assert.equal(compile('a.b:1')({ 'a.b': 1 }), true);
  assert.equal(compile('msg:"a*b"')({ msg: 'axb' }), false);
  assert.equal(compile('msg:"a*b"')({ msg: 'A*B' }), true);
  assert.equal(compile('msg:"connection reset"')({ msg: 'connection reset' }), true);
});

test('so sánh số', () => {
  assert.equal(compile('s>=500')({ s: 500 }), true);
  assert.equal(compile('s>500')({ s: '500' }), false);
  assert.equal(compile('s<-1.5')({ s: -2 }), true);
  assert.equal(compile('s<=3')({ s: true }), false);
  assert.equal(compile('s<=3')({ s: 'abc' }), false);
  assert.equal(compile('s<=3')({}), false);
});

test('_exists_ và tìm trong msg/message', () => {
  assert.equal(compile('_exists_:a')({ a: 0 }), true);
  assert.equal(compile('_exists_:a')({ a: null }), false);
  assert.equal(compile('Boom')({ msg: 'big BOOM' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"a (b"')({ msg: 'xa (by' }), true);
});

test('ưu tiên toán tử và từ khóa', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(compile('a:9 AND b:2 OR c:3')(r), true);
  assert.equal(compile('a:9 AND (b:2 OR c:3)')(r), false);
  assert.equal(compile('NOT a:9 b:2')(r), true);
  assert.equal(compile('NOT NOT a:1')(r), true);
  assert.equal(compile('a:1 b:2 OR a:9')(r), true);
  assert.equal(compile('and')({ msg: 'and' }), true);
  assert.equal(compile('(a:1)b:2')(r), true);
});

test('vị trí lỗi', () => {
  assert.equal(pos('(a:1'), 4);
  assert.equal(pos('a:1)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a OR'), 4);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('OR a'), 0);
  assert.equal(pos('(AND a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('a NOT AND'), 6);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('x status>'), 9);
  assert.equal(pos('field:'), 6);
  assert.equal(pos('a field: b'), 8);
  assert.equal(pos('a "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
  assert.equal(pos('a OR ) '), 5);
});
