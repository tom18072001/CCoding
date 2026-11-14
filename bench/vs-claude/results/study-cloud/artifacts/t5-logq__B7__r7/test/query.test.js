'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const m = (q, r) => compile(q)(r);
const errPos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position), e.message);
    return e.position;
  }
  return assert.fail('no error for ' + q);
};

test('field:value', () => {
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('status:500', { status: 5000 }), false);
  assert.equal(m('level:ERR*', { level: 'error' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('a:b?d', { a: 'bcd' }), true);
  assert.equal(m('a:b?d', { a: 'abd' }), false);
  assert.equal(m('a:*', { a: '' }), true);
  assert.equal(m('a:*', { a: null }), false);
  assert.equal(m('a:*', {}), false);
  assert.equal(m('a:"x*y"', { a: 'X*Y' }), true);
  assert.equal(m('a:"x*y"', { a: 'xzy' }), false);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(m('a:x.y', { a: 'xzy' }), false);
});

test('so sánh số', () => {
  assert.equal(m('s>=500', { s: '500' }), true);
  assert.equal(m('s>500', { s: 500 }), false);
  assert.equal(m('s<-1.5', { s: -2 }), true);
  assert.equal(m('s<=3', { s: true }), false);
  assert.equal(m('s<=3', { s: 'abc' }), false);
  assert.equal(m('s<=3', {}), false);
  assert.equal(m('http.status>=400', { 'http.status': 404 }), true);
});

test('exists, WORD, QUOTED', () => {
  assert.equal(m('_exists_:a', { a: 0 }), true);
  assert.equal(m('_exists_:a', { a: null }), false);
  assert.equal(m('timeout', { msg: 'Request TIMEOUT!' }), true);
  assert.equal(m('timeout', { message: 'timeout' }), true);
  assert.equal(m('timeout', { msg: 'x', message: 'timeout' }), false);
  assert.equal(m('timeout', {}), false);
  assert.equal(m('"a (b)"', { msg: 'xa (b)y' }), true);
  assert.equal(m('a*', { msg: 'abc' }), false);
  assert.equal(m('and', { msg: 'this and that' }), true);
});

test('toán tử và ưu tiên', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(m('', r), true);
  assert.equal(m('   ', r), true);
  assert.equal(m('a:1 b:2', r), true);
  assert.equal(m('a:1 AND b:9', r), false);
  assert.equal(m('a:9 OR b:2 AND c:9', r), false);
  assert.equal(m('a:1 OR b:2 AND c:9', r), true);
  assert.equal(m('(a:9 OR b:2) AND c:3', r), true);
  assert.equal(m('NOT a:9', r), true);
  assert.equal(m('NOT NOT a:1', r), true);
  assert.equal(m('a:1 NOT b:2', r), false);
  assert.equal(m('(a:1)(b:2)', r), true);
  assert.equal(m('x or y', { msg: 'x or y' }), true);
});

test('vị trí lỗi', () => {
  assert.equal(errPos('(a'), 2);
  assert.equal(errPos('a)'), 1);
  assert.equal(errPos('(a))'), 3);
  assert.equal(errPos('()'), 1);
  assert.equal(errPos('a AND'), 5);
  assert.equal(errPos('a AND  '), 7);
  assert.equal(errPos('NOT'), 3);
  assert.equal(errPos('AND a'), 0);
  assert.equal(errPos('a OR OR b'), 5);
  assert.equal(errPos('(OR a)'), 1);
  assert.equal(errPos('a AND NOT OR'), 10);
  assert.equal(errPos('NOT AND'), 4);
  assert.equal(errPos('s>=abc'), 3);
  assert.equal(errPos('s>='), 3);
  assert.equal(errPos('x s>'), 4);
  assert.equal(errPos('s>5x'), 2);
  assert.equal(errPos('a:'), 2);
  assert.equal(errPos('x a: b'), 4);
  assert.equal(errPos('a "bc'), 2);
  assert.equal(errPos('m:"bc'), 2);
  assert.equal(errPos('"x\\"'), 0);
});

test('vị trí lỗi — biên bổ sung', () => {
  assert.equal(errPos('a AND )'), 6);
  assert.equal(errPos('NOT )'), 4);
  assert.equal(errPos('(a OR'), 5);
  assert.equal(errPos('(a b'), 4);
  assert.equal(errPos(':foo'), 0);
  assert.equal(errPos('x :foo'), 2);
  assert.equal(errPos('_exists_:'), 9);
  assert.equal(errPos('a ( OR'), 4);
  assert.equal(errPos('a "b" "c'), 6);
  assert.equal(errPos('s>=1 AND t>=x'), 12);
});

test('ngoặc kép chứa ngoặc/khoảng trắng; glob không là regex', () => {
  assert.equal(m('(a:1) AND "x (y"', { a: 1, msg: 'x (y' }), true);
  assert.equal(m('a:"p q"', { a: 'P Q' }), true);
});
