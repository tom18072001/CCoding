'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require(require('node:path').dirname(__dirname) + '/src');

const pos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position;
  }
  return null;
};

test('ngữ nghĩa field/wildcard/exists/cmp', () => {
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('c:a?c')({ c: 'abc' }), true);
  assert.equal(compile('c:a?c')({ c: 'abbc' }), false);
  assert.equal(compile('c:a')({ c: 'ab' }), false);
  assert.equal(compile('c:*')({ c: '' }), true);
  assert.equal(compile('c:*')({ c: null }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('s>=500')({ s: '500' }), true);
  assert.equal(compile('s>500')({ s: true }), false);
  assert.equal(compile('s<-1.5')({ s: -2 }), true);
  assert.equal(compile('@t>0')({ '@t': 5 }), true);
});

test('WORD/QUOTED tìm trong msg hoặc message', () => {
  assert.equal(compile('BoOm')({ msg: 'a boom' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"a (b"')({ msg: 'x a (b y' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
});

test('ưu tiên toán tử và AND ngầm', () => {
  const r = { a: 1, b: 1, c: 1 };
  assert.equal(compile('')(r), true);
  assert.equal(compile('  ')(r), true);
  assert.equal(compile('a:2 AND b:2 OR c:1')(r), true);
  assert.equal(compile('a:1 b:2 OR c:2')(r), false);
  assert.equal(compile('NOT a:2 b:1')(r), true);
  assert.equal(compile('NOT (a:1 b:1)')(r), false);
  assert.equal(compile('NOT NOT a:1')(r), true);
});

test('vị trí lỗi cú pháp', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['a OR ', 5], ['NOT', 3],
    ['AND a', 0], ['a OR OR b', 5], ['(AND a)', 1], ['NOT AND', 4], ['a AND AND b', 6],
    ['status>=abc', 8], ['status>=', 8], ['a>1x', 2], ['f:', 2], ['x f:', 4],
    ['"abc', 0], ['a "bc', 2], ['msg:"abc', 4], ['(a OR)', 5],
  ];
  for (const [q, p] of cases) assert.equal(pos(q), p, q);
  assert.equal(pos('a AND b'), null);
});

test('ký tự đặc biệt trong value không làm hỏng regex', () => {
  assert.equal(compile('a:x-y')({ a: 'X-Y' }), true);
  assert.equal(compile('a:"x-y"')({ a: 'x-y' }), true);
  assert.equal(compile('a:a/b')({ a: 'a/b' }), true);
  assert.equal(compile('a:a.c')({ a: 'abc' }), false);
  assert.equal(compile('a:"(x)"')({ a: '(x)' }), true);
  assert.equal(compile('a:"q\\"r"')({ a: 'q"r' }), true);
});

test('trường lồng nhau (đã làm phẳng) và từ khóa chữ thường', () => {
  assert.equal(compile('http.status>=500')({ 'http.status': 503 }), true);
  assert.equal(compile('http.req.m:get')({ 'http.req.m': 'GET' }), true);
  assert.equal(compile('and OR or')({ msg: 'and' }), true);
});

test('ca biên vị trí lỗi bổ sung', () => {
  const cases = [
    ['a b)', 3], ['((a)', 4], ['a AND b)', 7], ['_exists_:', 9], ['1a:x', 0],
    ['a AND (', 7], ['x AND OR', 6], ['  )', 2], ['a>=', 3], ['a>=-', 3],
    ['(a b', 4], ['NOT (', 5], ['a OR AND', 5],
  ];
  for (const [q, p] of cases) assert.equal(pos(q), p, q);
  assert.equal(pos('a>=-1.5'), null);
  assert.equal(pos('_exists_:a.b'), null);
});
