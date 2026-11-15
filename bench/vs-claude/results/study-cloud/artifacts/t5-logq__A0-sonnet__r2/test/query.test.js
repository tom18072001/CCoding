'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

test('semantics', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('a:b?d')({ a: 'bcd' }), true);
  assert.equal(compile('a:b')({ a: null }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('status>=500')({ status: '503' }), true);
  assert.equal(compile('status>=500')({ status: true }), false);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ message: 'A BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('"a (b)"')({ msg: 'xA (B)' }), true);
});
test('precedence and keywords', () => {
  const r = { a: 1, b: 2, msg: 'and or' };
  assert.equal(compile('a:9 OR a:1 AND b:2')(r), true);
  assert.equal(compile('a:1 b:3')(r), false);
  assert.equal(compile('NOT a:9 AND b:2')(r), true);
  assert.equal(compile('(a:9 OR a:1) AND NOT (b:3)')(r), true);
  assert.equal(compile('and or')(r), true);
});
const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith(`syntax error at position ${e.position}`)); return e.position; } return null; };
test('error positions', () => {
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
  assert.equal(pos('x status>='), 10);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x msg:"abc'), 6);
  assert.equal(pos('"abc'), 0);
});
