'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query');

const m = (q, r) => compile(q)(r);
function errAt(q, pos) {
  assert.throws(() => compile(q), (e) => {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.strictEqual(e.position, pos, `query ${JSON.stringify(q)}`);
    assert.ok(e.message.startsWith(`syntax error at position ${pos}`));
    return true;
  });
}

test('truy vấn rỗng khớp tất cả', () => {
  assert.ok(m('', {}));
  assert.ok(m('   ', { a: 1 }));
});

test('field:value', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(m('level:ERROR', { level: 'error' }));
  assert.ok(!m('level:err', { level: 'error' }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('c:a?c', { c: 'abc' }));
  assert.ok(!m('c:a?c', { c: 'ac' }));
  assert.ok(m('c:*', { c: '' }));
  assert.ok(!m('c:*', { c: null }));
  assert.ok(!m('c:*', {}));
  assert.ok(m('a.b:x', { 'a.b': 'x' }));
  assert.ok(m('v:1.5', { v: 1.5 }));
  assert.ok(!m('v:1x5', { v: 1.5 }));
});

test('value trong ngoặc kép khớp chính xác, không wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"conn*"', { msg: 'connection' }));
  assert.ok(m('msg:"conn*"', { msg: 'conn*' }));
  assert.ok(m('msg:"a (b)"', { msg: 'a (b)' }));
});

test('so sánh số', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('status<=500', { status: '500' }));
  assert.ok(m('status<501', { status: 500 }));
  assert.ok(m('t>-1.5', { t: -1 }));
  assert.ok(!m('status>=1', { status: 'abc' }));
  assert.ok(!m('status>=1', { status: true }));
  assert.ok(!m('status>=1', {}));
  assert.ok(!m('status>=1', { status: null }));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
});

test('WORD/QUOTED tìm chuỗi con trong msg/message', () => {
  assert.ok(m('timeout', { msg: 'Upstream TimeOut!' }));
  assert.ok(m('timeout', { message: 'timeout' }));
  assert.ok(!m('timeout', { msg: 'ok', message: 'timeout' }));
  assert.ok(!m('timeout', { other: 'timeout' }));
  assert.ok(m('"a b"', { msg: 'xA bx' }));
  assert.ok(!m('a*', { msg: 'abc' }));
  assert.ok(m('and', { msg: 'this and that' }));
});

test('độ ưu tiên NOT > AND > OR', () => {
  const T = { a: 1, b: 1, c: 1 };
  assert.ok(m('a:1 OR b:2 AND c:2', { a: 1, b: 0, c: 0 })); // a OR (b AND c)
  assert.ok(!m('(a:1 OR b:2) AND c:2', { a: 1, b: 0, c: 0 }));
  assert.ok(m('b:2 AND c:2 OR a:1', { a: 1, b: 0, c: 0 }));
  assert.ok(m('NOT a:1 AND b:1', { a: 2, b: 1 })); // (NOT a) AND b
  assert.ok(!m('NOT a:1 AND b:1', { a: 1, b: 1 }));
  assert.ok(!m('NOT (a:1 AND b:1)', T));
  assert.ok(m('NOT (a:1 AND b:2)', T));
  assert.ok(m('NOT NOT a:1', T));
  assert.ok(m('a:1 b:1', T)); // AND ngầm
  assert.ok(!m('a:1 b:2', T));
  assert.ok(m('a:2 b:2 OR c:1', T));
  assert.ok(m('a:1 AND NOT b:2', T));
  assert.ok(m('(a:1)(b:1)', T));
});

test('từ khóa chỉ khi HOA', () => {
  assert.ok(!m('foo or bar', { msg: 'foo' })); // "or" là từ tìm kiếm, AND ngầm
  assert.ok(m('foo or bar', { msg: 'foo or bar' }));
  assert.ok(m('foo OR bar', { msg: 'foo' }));
});

test('lỗi: ngoặc', () => {
  errAt('(a:1', 4);
  errAt('((a:1)', 6);
  errAt('a:1)', 3);
  errAt('a:1 ) b:2', 4);
  errAt('()', 1);
  errAt('a:1 ()', 5);
  errAt('(', 1);
});

test('lỗi: thiếu toán hạng ở cuối', () => {
  errAt('a:1 AND', 7);
  errAt('a:1 OR', 6);
  errAt('NOT', 3);
  errAt('a:1 AND NOT', 11);
  errAt('(a:1 OR', 7);
});

test('lỗi: AND/OR sai chỗ', () => {
  errAt('AND a:1', 0);
  errAt('OR a:1', 0);
  errAt('  OR a', 2);
  errAt('(AND a:1)', 1);
  errAt('(a:1 OR OR b:1)', 8);
  errAt('a:1 AND OR b', 8);
  errAt('NOT AND a', 4);
  errAt('a:1 OR AND b', 7);
  errAt('NOT OR a', 4);
});

test('lỗi: so sánh', () => {
  errAt('status>=abc', 8);
  errAt('status>=', 8);
  errAt('x:1 status>abc', 11);
  errAt('status<', 7);
  errAt('status<=1.', 8);
});

test('lỗi: field: không có giá trị', () => {
  errAt('field:', 6);
  errAt('a:1 field: b:2', 10);
  errAt('(f:)', 3);
});

test('lỗi: ngoặc kép không đóng', () => {
  errAt('"abc', 0);
  errAt('a:1 "abc', 4);
  errAt('msg:"abc', 4);
  errAt('msg:"a\\"', 4);
});

test('thoát trong ngoặc kép', () => {
  assert.ok(m('"a\\"b"', { msg: 'xa"bx' }));
  assert.ok(m('"a\\\\b"', { msg: 'a\\b' }));
});
