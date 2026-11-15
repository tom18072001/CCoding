'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query');

const m = (q, r) => compile(q)(r);
const errPos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error, q);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`), e.message);
    return e.position;
  }
  assert.fail('expected error for ' + q);
};

test('empty query matches all', () => {
  assert.ok(m('', {}));
  assert.ok(m('   ', { a: 1 }));
});

test('field:value semantics', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(!m('status:500', {}));
  assert.ok(!m('status:null', { status: null }));
  assert.ok(m('level:ERROR', { level: 'error' }));
  assert.ok(!m('level:err', { level: 'error' }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('path:/api/us?rs', { path: '/api/users' }));
  assert.ok(!m('path:/api/us?rs', { path: '/api/usrs' }));
  assert.ok(m('a:x.y', { a: 'x.y' }));
  assert.ok(!m('a:x.y', { a: 'xzy' }));
  assert.ok(m('a:*', { a: '' }));
  assert.ok(m('http.status:5*', { 'http.status': 503 }));
});

test('quoted values are exact, no wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"connection"', { msg: 'connection reset' }));
  assert.ok(!m('a:"x*"', { a: 'xyz' }));
  assert.ok(m('a:"x*"', { a: 'x*' }));
  assert.ok(m('a:"say \\"hi\\" \\\\"', { a: 'say "hi" \\' }));
});

test('comparisons', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(m('status>=500', { status: '501' }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('s<=-1.5', { s: -2 }));
  assert.ok(m('s<3', { s: 2 }));
  assert.ok(!m('s<3', { s: 'abc' }));
  assert.ok(!m('s<3', { s: true }));
  assert.ok(!m('s<3', {}));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
});

test('free text uses msg then message', () => {
  assert.ok(m('timeout', { msg: 'Request TimeOut!' }));
  assert.ok(m('"time out"', { msg: 'a time out b' }));
  assert.ok(m('timeout', { message: 'timeout' }));
  assert.ok(!m('timeout', { msg: 'x', message: 'timeout' }));
  assert.ok(!m('timeout', {}));
  assert.ok(!m('t*t', { msg: 'test' }));
  assert.ok(m('and', { msg: 'this and that' }));
  assert.ok(m('"a (b)"', { msg: 'x a (b) y' }));
});

test('precedence NOT > AND > OR', () => {
  const T = { a: 1, b: 1, c: 1 };
  assert.ok(m('a:1 OR b:2 AND c:2', T)); // a OR (b AND c)
  assert.ok(!m('(a:1 OR b:2) AND c:2', T));
  assert.ok(m('a:2 AND b:2 OR c:1', T)); // (a AND b) OR c
  assert.ok(!m('NOT a:1 OR b:2', T)); // (NOT a) OR b
  assert.ok(m('NOT a:2 AND b:1', T));
  assert.ok(m('NOT NOT a:1', T));
  assert.ok(!m('NOT (a:1 AND b:1)', T));
  assert.ok(m('a:1 b:1 c:1', T)); // AND ngầm
  assert.ok(!m('a:1 b:2 c:1', T));
  assert.ok(m('a:1 AND NOT b:2', T));
  assert.ok(m('a:1 NOT b:2', T));
});

test('lowercase keywords are words', () => {
  assert.ok(m('a and b', { msg: 'a and b' }));
  assert.ok(!m('a and b', { msg: 'a b' }));
  assert.ok(m('not', { msg: 'do not' }));
});

test('error positions: parentheses', () => {
  assert.strictEqual(errPos('(a'), 2);
  assert.strictEqual(errPos('(a AND (b)'), 10);
  assert.strictEqual(errPos('a)'), 1);
  assert.strictEqual(errPos('(a))'), 3);
  assert.strictEqual(errPos(')'), 0);
  assert.strictEqual(errPos('()'), 1);
  assert.strictEqual(errPos('a ()'), 3);
  assert.strictEqual(errPos('('), 1);
});

test('error positions: missing operand / misplaced keyword', () => {
  assert.strictEqual(errPos('a AND'), 5);
  assert.strictEqual(errPos('a OR '), 5);
  assert.strictEqual(errPos('NOT'), 3);
  assert.strictEqual(errPos('a AND NOT'), 9);
  assert.strictEqual(errPos('AND a'), 0);
  assert.strictEqual(errPos('  OR a'), 2);
  assert.strictEqual(errPos('(AND a)'), 1);
  assert.strictEqual(errPos('a AND OR b'), 6);
  assert.strictEqual(errPos('a OR AND b'), 5);
  assert.strictEqual(errPos('NOT AND a'), 4);
  assert.strictEqual(errPos('a OR OR b'), 5);
  assert.strictEqual(errPos('a AND )'), 6);
});

test('error positions: comparison, field:, quotes', () => {
  assert.strictEqual(errPos('status>=abc'), 8);
  assert.strictEqual(errPos('status>='), 8);
  assert.strictEqual(errPos('a:1 status>abc'), 11);
  assert.strictEqual(errPos('status<'), 7);
  assert.strictEqual(errPos('status>=5x'), 8);
  assert.strictEqual(errPos('field:'), 6);
  assert.strictEqual(errPos('a:1 field: b'), 10);
  assert.strictEqual(errPos('_exists_:'), 9);
  assert.strictEqual(errPos('"abc'), 0);
  assert.strictEqual(errPos('a "abc'), 2);
  assert.strictEqual(errPos('msg:"abc'), 4);
  assert.strictEqual(errPos('"a\\"'), 0);
});
