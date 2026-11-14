'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query.js');

const m = (q, r) => compile(q)(r);
function pos(q, expected) {
  assert.throws(() => compile(q), (e) => {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.strictEqual(e.position, expected, `query ${JSON.stringify(q)} got ${e.position}`);
    assert.ok(e.message.startsWith(`syntax error at position ${expected}`));
    return true;
  });
}

test('truy vấn rỗng khớp tất cả', () => {
  assert.ok(m('', { a: 1 }));
  assert.ok(m('   ', {}));
});

test('field:value, wildcard, không phân biệt hoa thường', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(!m('status:500', { status: 5000 }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('lvl:ER?OR', { lvl: 'error' }));
  assert.ok(!m('lvl:err', { lvl: 'error' }));
  assert.ok(!m('x:*', { x: null }));
  assert.ok(m('x:*', { x: '' }));
  assert.ok(m('v:a.b', { v: 'A.B' }));
  assert.ok(!m('v:a.b', { v: 'axb' }));
});

test('quoted: khớp chính xác, không wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"conn*"', { msg: 'connection' }));
  assert.ok(m('msg:"a*"', { msg: 'A*' }));
  assert.ok(m('msg:"say \\"hi\\""', { msg: 'say "hi"' }));
});

test('so sánh số', () => {
  assert.ok(m('s>=500', { s: 500 }));
  assert.ok(!m('s>500', { s: 500 }));
  assert.ok(m('s<=5.5', { s: '5.5' }));
  assert.ok(m('s<-1', { s: -2 }));
  assert.ok(!m('s>=1', { s: true }));
  assert.ok(!m('s>=1', { s: 'abc' }));
  assert.ok(!m('s>=1', {}));
});

test('_exists_ và WORD/QUOTED', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
  assert.ok(m('TIMEOUT', { msg: 'a timeout b' }));
  assert.ok(m('timeout', { message: 'Timeout' }));
  assert.ok(!m('timeout', { msg: 'x', message: 'timeout' }));
  assert.ok(!m('timeout', {}));
  assert.ok(m('"a (b"', { msg: 'x a (b y' }));
});

test('ưu tiên NOT > AND > OR, AND ngầm, từ khóa HOA', () => {
  const r = { a: '1', b: '2', c: '3' };
  assert.ok(m('a:9 OR a:1 b:2', r));
  assert.ok(!m('a:9 OR a:1 b:9', r));
  assert.ok(m('NOT a:9 AND b:2', r));
  assert.ok(!m('NOT (a:9 OR b:2)', r));
  assert.ok(m('NOT NOT a:1', r));
  assert.ok(m('(a:9 OR a:1) AND c:3', r));
  assert.ok(m('and', { msg: 'this and that' }));
  assert.ok(m('or and', { msg: 'or and' }));
  assert.ok(m('(a:1)(b:2)', r));
});

test('lỗi: ngoặc', () => {
  pos('(a:1', 4);
  pos('((a:1)', 6);
  pos('a:1)', 3);
  pos('a:1 ) b', 4);
  pos('()', 1);
  pos('a ()', 3);
  pos('(', 1);
});

test('lỗi: thiếu toán hạng', () => {
  pos('a AND', 5);
  pos('a OR', 4);
  pos('NOT', 3);
  pos('a NOT ', 6);
  pos('(a AND', 6);
});

test('lỗi: AND/OR đặt sai chỗ', () => {
  pos('AND a', 0);
  pos('OR a', 0);
  pos('(AND a)', 1);
  pos('a AND OR b', 6);
  pos('a OR AND b', 5);
  pos('NOT AND a', 4);
  pos('a AND AND b', 6);
});

test('lỗi: so sánh sai', () => {
  pos('status>=abc', 8);
  pos('status>=', 8);
  pos('status>5x', 7);
  pos('a b status<', 11);
  pos('x.y>abc', 4);
});

test('lỗi: field rỗng', () => {
  pos('status:', 7);
  pos('a status: b', 9);
  pos('(status:)', 8);
  pos('_exists_:', 9);
});

test('lỗi: ngoặc kép không đóng', () => {
  pos('"abc', 0);
  pos('a "abc', 2);
  pos('msg:"abc', 4);
  pos('msg:"a\\"', 4);
});
