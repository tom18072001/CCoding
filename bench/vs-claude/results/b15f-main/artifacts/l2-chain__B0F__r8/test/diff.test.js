import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/0'), ['a', 'x/y', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'x/y', 0]), '/a/x~1y/0');
});

test('pointer: đầu vào sai ném DIFF_BAD_POINTER', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
});

test('diff: thứ tự khóa của op', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 9, c: 3 });
  assert.deepEqual(ops.map((o) => o.op), ['replace', 'remove', 'add']);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: bằng nhau → []; gốc replace; null/object/mảng là loại riêng', () => {
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepEqual(diff(null, { a: 1 }), [{ op: 'replace', path: '', oldValue: null, value: { a: 1 } }]);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
});

test('diff: mảng add tăng dần, remove giảm dần', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
});

test('diff: khóa chứa ~ và /, sắp theo UTF-16', () => {
  const ops = diff({}, { 'a~b': 1, 'c/d': 2, B: 3 });
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/a~0b', '/c~1d']);
});

test('diff: value là bản sao sâu', () => {
  const b = { a: { x: [1] } };
  const ops = diff({}, b);
  ops[0].value.x.push(2);
  assert.deepEqual(b, { a: { x: [1] } });
});

test('applyDiff: bất biến và không đổi doc', () => {
  const pairs = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [{ l: [{ a: 1 }, { b: 2 }] }, { l: [{ a: 2 }, { b: 2 }, [1], 'z'] }],
    [{ 'a~b': [1, 2, 3, 4] }, { 'a~b': [] }],
    [null, { a: 1 }], [[1], { a: 1 }], [{ a: 1 }, 5],
  ];
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'remove', path: '/b', oldValue: 1 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'replace', path: '/b', oldValue: 1, value: 2 }]), f);
  assert.throws(() => applyDiff({ a: [1] }, [{ op: 'add', path: '/a/3', value: 2 }]), f);
  assert.throws(() => applyDiff({ a: [1] }, [{ op: 'remove', path: '/a/1', oldValue: 2 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: '/x/y', value: 2 }]), f);
});

test('applyDiff: path rỗng thay cả gốc; add chèn mảng', () => {
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: [1] }]), [1]);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1]');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
