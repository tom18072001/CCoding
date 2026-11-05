'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query.js');

// [truy vấn, position kỳ vọng]
const errCases = [
  ['(a', 2],
  ['(a AND b', 8],
  ['a)', 1],
  ['a b )', 4],
  ['()', 1],
  ['a ()', 3],
  ['a AND', 5],
  ['a OR', 4],
  ['NOT', 3],
  ['a NOT', 5],
  ['AND a', 0],
  ['OR a', 0],
  ['( AND a)', 2],
  ['(OR a)', 1],
  ['a AND AND b', 6],
  ['a OR AND b', 5],
  ['NOT AND a', 4],
  ['NOT OR a', 4],
  ['a AND OR b', 6],
  ['status>=abc', 8],
  ['status>=', 8],
  ['a status>', 9],
  ['status<1x', 7],
  ['field:', 6],
  ['a AND field:', 12],
  ['"abc', 0],
  ['a "abc', 2],
  ['msg:"abc', 4],
  ['x:"a\\"', 2],
  ['(a "b', 3],
];

for (const [q, pos] of errCases) {
  test(`lỗi cú pháp: ${JSON.stringify(q)} → ${pos}`, () => {
    let err;
    try { compile(q); } catch (e) { err = e; }
    assert.ok(err, 'phải ném lỗi');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof QuerySyntaxError);
    assert.strictEqual(err.name, 'QuerySyntaxError');
    assert.strictEqual(err.position, pos);
    assert.ok(err.message.startsWith(`syntax error at position ${pos}`), err.message);
  });
}

const m = (q, rec) => compile(q)(rec);

test('truy vấn rỗng / khoảng trắng khớp tất cả', () => {
  assert.strictEqual(m('', {}), true);
  assert.strictEqual(m('  \t ', { a: 1 }), true);
});

test('ưu tiên NOT > AND > OR', () => {
  const r = { a: 'x' };
  assert.strictEqual(m('a:x OR a:y AND a:z', r), true); // x OR (y AND z)
  assert.strictEqual(m('(a:x OR a:y) AND a:z', r), false);
  assert.strictEqual(m('NOT a:x AND a:x', r), false);
  assert.strictEqual(m('NOT (a:x AND a:x)', r), false);
  assert.strictEqual(m('NOT NOT a:x', r), true);
  assert.strictEqual(m('NOT a:y OR a:x', r), true);
});

test('AND ngầm và and/or thường là từ tìm kiếm', () => {
  assert.strictEqual(m('a:1 b:2', { a: 1, b: 2 }), true);
  assert.strictEqual(m('a:1 b:2', { a: 1, b: 3 }), false);
  assert.strictEqual(m('a:1 AND b:2', { a: 1, b: 2 }), true);
  assert.strictEqual(m('rock and roll', { msg: 'rock and roll' }), true);
  assert.strictEqual(m('rock and roll', { msg: 'rock roll' }), false);
  assert.strictEqual(m('x or y', { msg: 'x or y' }), true);
  assert.strictEqual(m('x or y', { msg: 'x y' }), false);
});

test('field:value toàn bộ, không phân biệt hoa/thường', () => {
  assert.strictEqual(m('status:500', { status: 500 }), true);
  assert.strictEqual(m('status:500', { status: '500' }), true);
  assert.strictEqual(m('status:50', { status: 500 }), false);
  assert.strictEqual(m('lvl:ERROR', { lvl: 'error' }), true);
  assert.strictEqual(m('a:x', {}), false);
  assert.strictEqual(m('a:null', { a: null }), false);
  assert.strictEqual(m('a:true', { a: true }), true);
  assert.strictEqual(m('http.status:404', { 'http.status': 404 }), true);
});

test('wildcard * và ?', () => {
  assert.strictEqual(m('path:/api/*', { path: '/api/users' }), true);
  assert.strictEqual(m('path:/api/*', { path: '/api/' }), true);
  assert.strictEqual(m('path:/api/*', { path: '/x/api/u' }), false);
  assert.strictEqual(m('a:b?d', { a: 'bcd' }), true);
  assert.strictEqual(m('a:b?d', { a: 'bd' }), false);
  assert.strictEqual(m('a:b?d', { a: 'bccd' }), false);
  assert.strictEqual(m('a:*', { a: '' }), true);
  assert.strictEqual(m('a:*', {}), false);
});

test('ký tự regex trong value trần được escape', () => {
  assert.strictEqual(m('a:1.5', { a: '1x5' }), false);
  assert.strictEqual(m('a:1.5', { a: 1.5 }), true);
  assert.strictEqual(m('a:a+b', { a: 'a+b' }), true);
  assert.strictEqual(m('a:a+b', { a: 'aab' }), false);
  assert.strictEqual(m('a:[x]', { a: '[x]' }), true);
  assert.strictEqual(m('a:[x]', { a: 'x' }), false);
  assert.strictEqual(m('a:$1^', { a: '$1^' }), true);
  assert.strictEqual(m('a:x|y', { a: 'x' }), false);
  assert.strictEqual(m('a:x|y', { a: 'x|y' }), true);
  assert.strictEqual(m('a:\\d', { a: '\\d' }), true);
  assert.strictEqual(m('a:\\d', { a: '5' }), false);
});

test('value trong ngoặc kép: chính xác, không wildcard, có khoảng trắng/ngoặc', () => {
  assert.strictEqual(m('msg:"a*"', { msg: 'a*' }), true);
  assert.strictEqual(m('msg:"a*"', { msg: 'abc' }), false);
  assert.strictEqual(m('msg:"a?"', { msg: 'ab' }), false);
  assert.strictEqual(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.strictEqual(m('msg:"connection reset"', { msg: 'connection reset by' }), false);
  assert.strictEqual(m('msg:"a (b) c"', { msg: 'a (b) c' }), true);
  assert.strictEqual(m('msg:"say \\"hi\\""', { msg: 'say "hi"' }), true);
  assert.strictEqual(m('msg:"a\\\\b"', { msg: 'a\\b' }), true);
});

test('so sánh số', () => {
  assert.strictEqual(m('status>=500', { status: 500 }), true);
  assert.strictEqual(m('status>500', { status: 500 }), false);
  assert.strictEqual(m('status<=500', { status: 500 }), true);
  assert.strictEqual(m('status<500', { status: 499.5 }), true);
  assert.strictEqual(m('status>=500', { status: '503' }), true);
  assert.strictEqual(m('status>-1', { status: '-0.5' }), true);
  assert.strictEqual(m('status>=500', { status: 'abc' }), false);
  assert.strictEqual(m('status>=500', { status: '' }), false);
  assert.strictEqual(m('status>=0', { status: true }), false);
  assert.strictEqual(m('status<=1', { status: true }), false);
  assert.strictEqual(m('status>=0', { status: null }), false);
  assert.strictEqual(m('status>=0', {}), false);
  assert.strictEqual(m('status>=1.5', { status: 2 }), true);
});

test('_exists_', () => {
  assert.strictEqual(m('_exists_:a', { a: 0 }), true);
  assert.strictEqual(m('_exists_:a', { a: '' }), true);
  assert.strictEqual(m('_exists_:a', { a: null }), false);
  assert.strictEqual(m('_exists_:a', {}), false);
  assert.strictEqual(m('NOT _exists_:a.b', { 'a.b': 1 }), false);
});

test('WORD/QUOTED tìm trong msg, dự phòng message', () => {
  assert.strictEqual(m('timeout', { msg: 'Request TimeOut!' }), true);
  assert.strictEqual(m('timeout', { message: 'timeout' }), true);
  assert.strictEqual(m('timeout', { msg: 'ok', message: 'timeout' }), false);
  assert.strictEqual(m('timeout', { msg: null, message: 'timeout' }), true);
  assert.strictEqual(m('timeout', { other: 'timeout' }), false);
  assert.strictEqual(m('"a b"', { msg: 'x a b y' }), true);
  assert.strictEqual(m('"a*"', { msg: 'abc' }), false);
  assert.strictEqual(m('"(x)"', { msg: 'f(x)' }), true);
  assert.strictEqual(m('(timeout)', { msg: 'timeout' }), true);
});
