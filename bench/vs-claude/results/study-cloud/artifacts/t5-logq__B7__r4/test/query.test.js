'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src/query');

const pos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error, q);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position), q);
    return e.position;
  }
  return 'no error';
};

test('truy vấn rỗng khớp tất cả', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('   ')({ a: 1 }), true);
});

test('field:value', () => {
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('level:error')({ level: 'ERROR' }), true);
  assert.equal(compile('level:err')({ level: 'error' }), false);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('a:b?d')({ a: 'bcd' }), true);
  assert.equal(compile('a:b?d')({ a: 'bd' }), false);
  assert.equal(compile('a:*')({ a: '' }), true);
  assert.equal(compile('a:*')({ a: null }), false);
  assert.equal(compile('a:*')({}), false);
  assert.equal(compile('a:"x*"')({ a: 'xyz' }), false);
  assert.equal(compile('a:"x*"')({ a: 'X*' }), true);
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
  assert.equal(compile('a.b:1.5')({ 'a.b': 1.5 }), true);
  assert.equal(compile('a:x.y')({ a: 'xzy' }), false);
});

test('so sánh số', () => {
  const q = compile('s>=500');
  assert.equal(q({ s: 500 }), true);
  assert.equal(q({ s: '503' }), true);
  assert.equal(q({ s: 'abc' }), false);
  assert.equal(q({ s: true }), false);
  assert.equal(q({}), false);
  assert.equal(compile('s<-1.5')({ s: -2 }), true);
  assert.equal(compile('s>1')({ s: 1 }), false);
  assert.equal(compile('s<=1')({ s: 1 }), true);
});

test('_exists_', () => {
  const q = compile('_exists_:a');
  assert.equal(q({ a: 0 }), true);
  assert.equal(q({ a: null }), false);
  assert.equal(q({}), false);
});

test('WORD và QUOTED tìm trong msg/message', () => {
  assert.equal(compile('boom')({ msg: 'Big BOOM!' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"a (b"')({ msg: 'xa (by' }), true);
  assert.equal(compile('a*')({ msg: 'xa*' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
});

test('toán tử, ưu tiên, AND ngầm', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(compile('a:1 b:2')(r), true);
  assert.equal(compile('a:1 b:9')(r), false);
  assert.equal(compile('a:9 OR b:2 AND c:9')(r), false);
  assert.equal(compile('a:1 OR b:2 AND c:9')(r), true);
  assert.equal(compile('(a:9 OR b:2) AND c:3')(r), true);
  assert.equal(compile('NOT a:9 c:3')(r), true);
  assert.equal(compile('NOT NOT a:1')(r), true);
  assert.equal(compile('NOT (a:1 OR b:2)')(r), false);
  assert.equal(compile('a:1 AND NOT b:2')(r), false);
  assert.equal(compile('(a:1)(b:2)')(r), true);
});

test('vị trí lỗi cú pháp', () => {
  assert.equal(pos('(a:1'), 4);
  assert.equal(pos('a:1)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a:1 AND'), 7);
  assert.equal(pos('a:1 OR'), 6);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a:1'), 0);
  assert.equal(pos('OR a:1'), 0);
  assert.equal(pos('(AND a:1)'), 1);
  assert.equal(pos('a:1 AND OR b:2'), 8);
  assert.equal(pos('a:1 AND NOT OR b'), 12);
  assert.equal(pos('NOT AND a'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('x:1 status>='), 12);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x:1 msg:'), 8);
  assert.equal(pos('a:1 "abc'), 4);
  assert.equal(pos('msg:"abc'), 4);
  assert.equal(pos('a:1 AND ('), 9);
});

test('từ khóa chữ thường là từ tìm kiếm', () => {
  assert.equal(pos('a and b'), 'no error');
  assert.equal(compile('a or b')({ msg: 'a or b' }), true);
});

test('ca biên vị trí lỗi: thứ tự trái sang phải, khoảng trắng cuối, thoát', () => {
  assert.equal(pos('(a:1  '), 6);
  assert.equal(pos('a:1 ) "abc'), 4);
  assert.equal(pos('"abc a:1 )'), 0);
  assert.equal(pos('((a:1)'), 6);
  assert.equal(pos('a:1 OR'), 6);
  assert.equal(pos('status>=500 AND x>=y'), 19);
  assert.equal(pos('x:1 AND'.concat('  ')), 9);
  assert.equal(pos('a:"x\\"'), 2);
  assert.equal(pos('a:"x\\"y"'), 'no error');
  assert.equal(compile('a:"x\\"y"')({ a: 'x"y' }), true);
  assert.equal(compile('"a\\\\b"')({ msg: 'a\\b' }), true);
});

test('ưu tiên NOT > AND > OR và AND ngầm kết hợp OR', () => {
  const r = { a: 1, b: 2 };
  assert.equal(compile('NOT a:1 OR b:2')(r), true);
  assert.equal(compile('NOT a:1 AND b:2')(r), false);
  assert.equal(compile('a:9 b:9 OR a:1 b:2')(r), true);
  assert.equal(compile('a:1 OR a:9 b:9')(r), true);
});
