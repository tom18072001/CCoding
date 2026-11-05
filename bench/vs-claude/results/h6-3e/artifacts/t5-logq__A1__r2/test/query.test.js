'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const m = (q, r) => compile(q)(r);
const pos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position), e.message);
    return e.position;
  }
  assert.fail('no error for ' + q);
};

test('empty query', () => {
  assert.equal(m('', {}), true);
  assert.equal(m('  ', { a: 1 }), true);
});

test('field:value', () => {
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('status:500', { status: 5000 }), false);
  assert.equal(m('level:error', { level: 'ERROR' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('path:/api/*', { path: '/x/api/users' }), false);
  assert.equal(m('c:a?c', { c: 'abc' }), true);
  assert.equal(m('c:a?c', { c: 'ac' }), false);
  assert.equal(m('c:*', { c: '' }), true);
  assert.equal(m('c:*', {}), false);
  assert.equal(m('c:*', { c: null }), false);
  assert.equal(m('c:"a*"', { c: 'a*' }), true);
  assert.equal(m('c:"a*"', { c: 'abc' }), false);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(m('a.b:x.y', { 'a.b': 'x.y' }), true);
  assert.equal(m('a:x.y', { a: 'xzy' }), false);
  assert.equal(m('a:x', { a: true }), false);
  assert.equal(m('a:true', { a: true }), true);
});

test('comparison', () => {
  assert.equal(m('s>=500', { s: 500 }), true);
  assert.equal(m('s>500', { s: 500 }), false);
  assert.equal(m('s<=1.5', { s: '1.5' }), true);
  assert.equal(m('s<-1', { s: -2 }), true);
  assert.equal(m('s>=1', { s: 'abc' }), false);
  assert.equal(m('s>=1', { s: true }), false);
  assert.equal(m('s>=1', {}), false);
  assert.equal(m('s<1', { s: null }), false);
});

test('exists and words', () => {
  assert.equal(m('_exists_:a', { a: 0 }), true);
  assert.equal(m('_exists_:a', { a: null }), false);
  assert.equal(m('_exists_:a', {}), false);
  assert.equal(m('boom', { msg: 'big BOOM!' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('boom', { other: 'boom' }), false);
  assert.equal(m('"a b"', { msg: 'xa bx' }), true);
  assert.equal(m('"a*"', { msg: 'abc' }), false);
  assert.equal(m('and', { msg: 'this and that' }), true);
  assert.equal(m('"(x)"', { msg: 'a (x) b' }), true);
});

test('boolean logic and precedence', () => {
  const r = { a: 1, b: 2 };
  assert.equal(m('a:1 b:2', r), true);
  assert.equal(m('a:1 AND b:3', r), false);
  assert.equal(m('a:9 OR b:2', r), true);
  assert.equal(m('NOT a:9', r), true);
  assert.equal(m('NOT NOT a:1', r), true);
  assert.equal(m('a:1 OR a:9 AND b:9', r), true); // AND trước OR
  assert.equal(m('(a:1 OR a:9) AND b:9', r), false);
  assert.equal(m('NOT a:1 OR b:2', r), true);
  assert.equal(m('a:1 NOT b:3', r), true);
  assert.equal(m('((a:1))', r), true);
  assert.equal(m('(a:1)(b:2)', r), true);
});

test('syntax error positions', () => {
  assert.equal(pos('(a'), 2);
  assert.equal(pos('(a '), 3);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('(a))'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a OR'), 4);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('OR a'), 0);
  assert.equal(pos('(AND a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND a'), 4);
  assert.equal(pos('a OR OR b'), 5);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('x:1 status>='), 12);
  assert.equal(pos('status>x'), 7);
  assert.equal(pos('status:'), 7);
  assert.equal(pos('a:1 status: b'), 11);
  assert.equal(pos('a "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
  assert.equal(pos('a AND "x\\"'), 6);
});
