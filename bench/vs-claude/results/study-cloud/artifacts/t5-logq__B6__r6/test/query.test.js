'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query.js');

const m = (q, r) => compile(q)(r);
function errPos(q, pos) {
  assert.throws(() => compile(q), (e) => {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.strictEqual(e.position, pos, `${q} -> ${e.position}`);
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
  assert.ok(!m('a:x', { a: null }));
  assert.ok(!m('a:x', {}));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('a:b?d', { a: 'bcd' }));
  assert.ok(!m('a:b?d', { a: 'bd' }));
  assert.ok(m('a:*', { a: '' }));
  assert.ok(m('a:x.y', { a: 'x.y' }));
  assert.ok(!m('a:x.y', { a: 'xzy' }));
  assert.ok(m('http.status:5*', { 'http.status': 503 }));
});

test('QUOTED sau field: không có wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"conn*"', { msg: 'connection' }));
  assert.ok(m('msg:"a*"', { msg: 'A*' }));
  assert.ok(m('msg:"say \\"hi\\""', { msg: 'say "hi"' }));
});

test('so sánh số', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(m('status>499', { status: '500' }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('s<=1.5', { s: 1.5 }));
  assert.ok(m('s<-1', { s: -2 }));
  assert.ok(!m('s>1', { s: 'abc' }));
  assert.ok(!m('s>1', { s: true }));
  assert.ok(!m('s>1', {}));
  assert.ok(!m('s>1', { s: null }));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
});

test('WORD / QUOTED tìm trong msg hoặc message', () => {
  assert.ok(m('timeout', { msg: 'Request TIMEOUT x' }));
  assert.ok(m('timeout', { message: 'timeout' }));
  assert.ok(!m('timeout', { msg: 'ok', message: 'timeout' }));
  assert.ok(!m('timeout', {}));
  assert.ok(m('"a b"', { msg: 'xa by' }));
  assert.ok(m('"(a)"', { msg: 'x(a)' }));
  assert.ok(!m('a*', { msg: 'abc' }));
  assert.ok(m('and', { msg: 'this and that' }));
});

test('ưu tiên NOT > AND > OR, AND ngầm, ngoặc', () => {
  const r = (a, b, c) => ({ msg: [a && 'a', b && 'b', c && 'c'].filter(Boolean).join(' ') });
  assert.ok(m('a OR b AND c', r(true, false, false)));
  assert.ok(!m('a OR b AND c', r(false, true, false)));
  assert.ok(!m('(a OR b) AND c', r(true, false, false)));
  assert.ok(m('(a OR b) c', r(true, false, true)));
  assert.ok(m('NOT a b', r(false, true, false)));
  assert.ok(!m('NOT a b', r(true, true, false)));
  assert.ok(m('NOT NOT a', r(true, false, false)));
  assert.ok(m('a b', r(true, true, false)));
  assert.ok(!m('a b', r(true, false, false)));
  assert.ok(m('x:1 AND (y:2 OR z:3)', { x: 1, z: 3 }));
});

test('từ khóa chỉ khi viết HOA và là token riêng', () => {
  assert.ok(m('a or b', { msg: 'a or b' }));
  assert.ok(!m('a or b', { msg: 'a b' }));
  assert.ok(m('ANDROID', { msg: 'android' }));
  assert.ok(m('NOTE', { msg: 'note' }));
});

test('lỗi: ngoặc', () => {
  errPos('(a', 2);
  errPos('(a OR b', 7);
  errPos('(', 1);
  errPos('a)', 1);
  errPos('(a))', 3);
  errPos('()', 1);
  errPos('a ( )', 4);
});

test('lỗi: thiếu toán hạng', () => {
  errPos('a AND', 5);
  errPos('a OR', 4);
  errPos('NOT', 3);
  errPos('a OR NOT', 8);
  errPos('(a AND)', 6);
});

test('lỗi: AND/OR sai chỗ', () => {
  errPos('AND a', 0);
  errPos('OR a', 0);
  errPos('(AND a)', 1);
  errPos('(  OR a)', 3);
  errPos('a AND OR b', 6);
  errPos('a OR AND b', 5);
  errPos('NOT AND a', 4);
  errPos('a AND AND b', 6);
});

test('lỗi: so sánh', () => {
  errPos('status>=abc', 8);
  errPos('status>=', 8);
  errPos('status>abc', 7);
  errPos('x:1 AND s<', 10);
  errPos('s<=1.', 3);
});

test('lỗi: field: không giá trị', () => {
  errPos('status:', 7);
  errPos('a:1 b:', 6);
  errPos('(a:)', 3);
  errPos('_exists_:', 9);
});

test('lỗi: ngoặc kép không đóng', () => {
  errPos('"abc', 0);
  errPos('a "abc', 2);
  errPos('msg:"abc', 4);
  errPos('x:1 AND msg:"a\\"', 12);
});
