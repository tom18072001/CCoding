'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith('syntax error at position ' + e.position)); return e.position; } return null; };

test('rỗng khớp tất cả', () => { assert.equal(compile('  ')({}), true); });
test('field:value, wildcard, quoted', () => {
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('a:b?d')({ a: 'bxd' }), true);
  assert.equal(compile('a:b?d')({ a: 'bd' }), false);
  assert.equal(compile('a:x')({ a: null }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
});
test('so sánh và exists', () => {
  const q = compile('s>=500');
  assert.equal(q({ s: '500' }), true);
  assert.equal(q({ s: true }), false);
  assert.equal(q({}), false);
  assert.equal(compile('s<-1.5')({ s: -2 }), true);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
});
test('từ tìm kiếm', () => {
  assert.equal(compile('boom')({ msg: 'Big BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('"a (b"')({ msg: 'a (b' }), true);
  assert.equal(compile('and')({ msg: 'x and y' }), true);
});
test('ưu tiên toán tử', () => {
  const q = compile('a:1 OR b:1 c:1');
  assert.equal(q({ a: 1 }), true);
  assert.equal(q({ b: 1 }), false);
  assert.equal(q({ b: 1, c: 1 }), true);
  assert.equal(compile('NOT a:1 AND b:1')({ a: 1, b: 1 }), false);
  assert.equal(compile('NOT (a:1 OR b:1)')({ a: 2 }), true);
});
test('vị trí lỗi', () => {
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('s>=abc'), 3);
  assert.equal(pos('x s>='), 5);
  assert.equal(pos('f:'), 2);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('m:"bc'), 2);
  assert.equal(pos('a:1 (b'), 6);
  assert.equal(pos('a OR'), 4);
  assert.equal(pos('a:1'), null);
});
