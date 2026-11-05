'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query');

const m = (q, r) => compile(q)(r);
const errPos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`), e.message);
    return e.position;
  }
  throw new Error('no error for ' + q);
};

test('empty matches all', () => {
  assert.strictEqual(m('', {}), true);
  assert.strictEqual(m('   ', { a: 1 }), true);
});

test('field:value, case-insens, whole, wildcard', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(!m('status:500', { status: 5000 }));
  assert.ok(m('level:ERROR', { level: 'error' }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('path:/api/*', { path: '/api/' }));
  assert.ok(m('a:b?d', { a: 'bcd' }));
  assert.ok(!m('a:b?d', { a: 'bd' }));
  assert.ok(!m('a:x', { a: null }));
  assert.ok(!m('a:x', {}));
  assert.ok(m('a:a.c', { a: 'a.c' }));
  assert.ok(!m('a:a.c', { a: 'abc' }));
});

test('quoted values exact, no wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"connection"', { msg: 'connection reset' }));
  assert.ok(m('msg:"a*"', { msg: 'a*' }));
  assert.ok(!m('msg:"a*"', { msg: 'abc' }));
  assert.ok(m('msg:"say \\"hi\\""', { msg: 'say "hi"' }));
});

test('comparisons', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(m('status>=500', { status: '503' }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('d<=1.5', { d: 1.5 }));
  assert.ok(m('d<-1', { d: -2 }));
  assert.ok(!m('d<5', { d: 'abc' }));
  assert.ok(!m('d<5', { d: true }));
  assert.ok(!m('d<5', {}));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
});

test('words and quoted search msg/message', () => {
  assert.ok(m('timeout', { msg: 'Request TimeOut!' }));
  assert.ok(m('timeout', { message: 'timeout' }));
  assert.ok(!m('timeout', { msg: 'ok', message: 'timeout' }));
  assert.ok(!m('timeout', {}));
  assert.ok(m('"a (b) c"', { msg: 'x a (b) c' }));
  assert.ok(m('and', { msg: 'this and that' }));
  assert.ok(m('a*', { msg: 'ba*' }));
  assert.ok(!m('a*', { msg: 'abc' }));
});

test('precedence NOT > AND > OR, implicit AND', () => {
  const t = { msg: 'x', a: 1 };
  assert.ok(m('a:2 OR a:1 AND msg:y OR msg:x', t));
  assert.ok(!m('a:2 OR a:1 AND msg:y', t));
  assert.ok(!m('(a:2 OR a:1) AND msg:y', t));
  assert.ok(m('NOT a:2 a:1', t));
  assert.ok(!m('NOT a:1 OR a:2', t));
  assert.ok(m('NOT NOT a:1', t));
  assert.ok(m('a:1 msg:x', t));
  assert.ok(!m('a:1 msg:y', t));
  assert.ok(m('a:2 OR a:1 msg:x', t));
  assert.ok(!m('NOT (a:1 AND msg:x)', t));
});

test('lowercase keywords are words', () => {
  assert.ok(m('foo or bar', { msg: 'foo or bar' }));
  assert.ok(!m('foo or bar', { msg: 'foo bar' }));
  assert.ok(m('not', { msg: 'not here' }));
});

test('parens are separate tokens', () => {
  assert.ok(m('(a:1)', { a: 1 }));
  assert.ok(m('NOT(a:2)', { a: 1 }));
  assert.ok(m('(a:1)AND(b:2)', { a: 1, b: 2 }));
});

test('error positions: parens', () => {
  assert.strictEqual(errPos('(a:1'), 4);
  assert.strictEqual(errPos('((a:1)'), 6);
  assert.strictEqual(errPos('a:1)'), 3);
  assert.strictEqual(errPos('(a:1))'), 5);
  assert.strictEqual(errPos('()'), 1);
  assert.strictEqual(errPos('a ()'), 3);
});

test('error positions: operators', () => {
  assert.strictEqual(errPos('a AND'), 5);
  assert.strictEqual(errPos('a OR'), 4);
  assert.strictEqual(errPos('NOT'), 3);
  assert.strictEqual(errPos('a AND NOT'), 9);
  assert.strictEqual(errPos('AND a'), 0);
  assert.strictEqual(errPos('  OR a'), 2);
  assert.strictEqual(errPos('(AND a)'), 1);
  assert.strictEqual(errPos('a AND OR b'), 6);
  assert.strictEqual(errPos('a OR AND b'), 5);
  assert.strictEqual(errPos('NOT AND a'), 4);
  assert.strictEqual(errPos('a AND AND'), 6);
});

test('error positions: comparison, colon, quote', () => {
  assert.strictEqual(errPos('status>=abc'), 8);
  assert.strictEqual(errPos('status>='), 8);
  assert.strictEqual(errPos('a:1 status>x'), 11);
  assert.strictEqual(errPos('x<'), 2);
  assert.strictEqual(errPos('status>=5x'), 8);
  assert.strictEqual(errPos('field:'), 6);
  assert.strictEqual(errPos('a:1 field: b'), 10);
  assert.strictEqual(errPos('(field:)'), 7);
  assert.strictEqual(errPos('"abc'), 0);
  assert.strictEqual(errPos('a:1 "abc'), 4);
  assert.strictEqual(errPos('msg:"abc'), 4);
  assert.strictEqual(errPos('a:1 msg:"x\\"'), 8);
});
