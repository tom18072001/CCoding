'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const m = (q, r) => compile(q)(r);
const errPos = (q) => {
  try {
    compile(q);
  } catch (e) {
    assert.ok(e instanceof QuerySyntaxError, 'not QuerySyntaxError for ' + q);
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position), e.message);
    return e.position;
  }
  assert.fail('expected error for ' + q);
};

test('empty query matches all', () => {
  assert.equal(m('', {}), true);
  assert.equal(m('  \t ', { a: 1 }), true);
});

test('field:value', () => {
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('status:500', { status: 5000 }), false);
  assert.equal(m('level:error', { level: 'ERROR' }), true);
  assert.equal(m('level:err', { level: 'error' }), false);
  assert.equal(m('level:error', {}), false);
  assert.equal(m('level:null', { level: null }), false);
  assert.equal(m('ok:true', { ok: true }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('path:/api/*', { path: '/API/' }), true);
  assert.equal(m('path:/api/*', { path: '/x/api/users' }), false);
  assert.equal(m('a:?b', { a: 'xb' }), true);
  assert.equal(m('a:?b', { a: 'b' }), false);
  assert.equal(m('a:*', { a: '' }), true);
  assert.equal(m('a:*', {}), false);
  assert.equal(m('a:a.c', { a: 'abc' }), false);
  assert.equal(m('http.status:200', { 'http.status': 200 }), true);
  assert.equal(m('constructor:*', {}), false);
});

test('quoted values', () => {
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(m('msg:"conn*"', { msg: 'connection' }), false);
  assert.equal(m('msg:"conn*"', { msg: 'conn*' }), true);
  assert.equal(m('msg:"a (b) c"', { msg: 'a (b) c' }), true);
  assert.equal(m('msg:"say \\"hi\\""', { msg: 'say "hi"' }), true);
  assert.equal(m('p:"a\\\\b"', { p: 'a\\b' }), true);
});

test('comparison', () => {
  assert.equal(m('status>=500', { status: 500 }), true);
  assert.equal(m('status>500', { status: 500 }), false);
  assert.equal(m('status<=500', { status: '500' }), true);
  assert.equal(m('status<500', { status: '499.5' }), true);
  assert.equal(m('x>-1', { x: -0.5 }), true);
  assert.equal(m('status>=500', { status: 'abc' }), false);
  assert.equal(m('status>=500', { status: true }), false);
  assert.equal(m('status>=500', {}), false);
  assert.equal(m('status>=500', { status: null }), false);
  assert.equal(m('@t>=10', { '@t': 11 }), true);
});

test('_exists_', () => {
  assert.equal(m('_exists_:user', { user: 'a' }), true);
  assert.equal(m('_exists_:user', { user: 0 }), true);
  assert.equal(m('_exists_:user', { user: null }), false);
  assert.equal(m('_exists_:user', {}), false);
});

test('free text', () => {
  assert.equal(m('boom', { msg: 'Big BOOM here' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { msg: 'nope', message: 'boom' }), false);
  assert.equal(m('boom', { other: 'boom' }), false);
  assert.equal(m('"big boom"', { msg: 'a Big Boom' }), true);
  assert.equal(m('b*m', { msg: 'b*m' }), true);
  assert.equal(m('b*m', { msg: 'boom' }), false);
  assert.equal(m('and', { msg: 'x and y' }), true);
  assert.equal(m('"AND"', { msg: 'x AND y' }), true);
  assert.equal(m('42', { msg: 42 }), true);
});

test('boolean operators and precedence', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(m('a:1 b:2', r), true);
  assert.equal(m('a:1 AND b:9', r), false);
  assert.equal(m('a:9 OR b:2', r), true);
  assert.equal(m('NOT a:9', r), true);
  assert.equal(m('NOT NOT a:1', r), true);
  assert.equal(m('a:1 OR b:9 c:9', r), true); // a OR (b AND c)
  assert.equal(m('a:9 AND b:2 OR c:3', r), true); // (a AND b) OR c
  assert.equal(m('NOT a:9 b:2', r), true);
  assert.equal(m('NOT a:1 b:2', r), false);
  assert.equal(m('(a:9 OR b:2) c:9', r), false);
  assert.equal(m('(a:9 OR b:2) AND c:3', r), true);
  assert.equal(m('NOT(a:1)', r), false);
  assert.equal(m('((a:1))', r), true);
  assert.equal(m('a:1 and b:2', { a: 1, b: 2, msg: 'x' }), false); // "and" is a text term
  assert.equal(m('a:1 and', { a: 1, msg: 'and' }), true);
});

test('syntax error positions', () => {
  assert.equal(errPos('(a:1'), 4);
  assert.equal(errPos('((a:1)'), 6);
  assert.equal(errPos('a:1)'), 3);
  assert.equal(errPos('a:1 b:2 ) c'), 8);
  assert.equal(errPos('()'), 1);
  assert.equal(errPos('a:1 ()'), 5);
  assert.equal(errPos('a:1 AND'), 7);
  assert.equal(errPos('a:1 OR'), 6);
  assert.equal(errPos('NOT'), 3);
  assert.equal(errPos('a:1 AND NOT'), 11);
  assert.equal(errPos('AND a:1'), 0);
  assert.equal(errPos('OR a:1'), 0);
  assert.equal(errPos('(AND a:1)'), 1);
  assert.equal(errPos('a:1 AND OR b:2'), 8);
  assert.equal(errPos('a:1 OR AND b:2'), 7);
  assert.equal(errPos('NOT AND x'), 4);
  assert.equal(errPos('x AND AND y'), 6);
  assert.equal(errPos('status>=abc'), 8);
  assert.equal(errPos('x:1 status>=abc'), 12);
  assert.equal(errPos('status>='), 8);
  assert.equal(errPos('status>'), 7);
  assert.equal(errPos('status>1.'), 7);
  assert.equal(errPos('a:'), 2);
  assert.equal(errPos('x:1 field:'), 10);
  assert.equal(errPos('(a:)'), 3);
  assert.equal(errPos('"abc'), 0);
  assert.equal(errPos('x "abc'), 2);
  assert.equal(errPos('msg:"abc'), 4);
  assert.equal(errPos('x:"a\\"'), 2);
});

test('QuerySyntaxError class', () => {
  const e = new QuerySyntaxError(3);
  assert.equal(e.name, 'QuerySyntaxError');
  assert.equal(e.position, 3);
  assert.ok(e instanceof Error);
});
