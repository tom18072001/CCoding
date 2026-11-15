import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code);

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~b/c'), 'a~0b~1c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 0]), '/x~1y/0');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  throwsCode(() => unescapePointer('a~'), 'DIFF_BAD_POINTER');
  throwsCode(() => unescapePointer('~x'), 'DIFF_BAD_POINTER');
  throwsCode(() => parsePointer('a/b'), 'DIFF_BAD_POINTER');
  throwsCode(() => parsePointer('/a~2'), 'DIFF_BAD_POINTER');
});

test('diff: khóa chứa / và thứ tự khóa của op', () => {
  const ops = diff({ 'x/y': 1, k: 1, z: 1 }, { 'x/y': 2, k: 1, n: 5 });
  assert.deepEqual(ops, [
    { op: 'add', path: '/n', value: 5 },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
    { op: 'remove', path: '/z', oldValue: 1 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'oldValue']);
});

test('diff: sắp khóa theo UTF-16', () => {
  const ops = diff({}, { b: 1, B: 1, a: 1 });
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: mảng co và giãn', () => {
  assert.deepEqual(diff([1], [1, 2, 3]), [
    { op: 'add', path: '/1', value: 2 },
    { op: 'add', path: '/2', value: 3 },
  ]);
  assert.deepEqual(diff({ a: [1, 2, 3, 4] }, { a: [1, 9] }), [
    { op: 'replace', path: '/a/1', oldValue: 2, value: 9 },
    { op: 'remove', path: '/a/3', oldValue: 4 },
    { op: 'remove', path: '/a/2', oldValue: 3 },
  ]);
});

test('diff: đổi loại và gốc', () => {
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: 0 }), [{ op: 'replace', path: '/a', oldValue: null, value: 0 }]);
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
});

test('diff: bản sao sâu', () => {
  const a = { o: { k: [1] } };
  const b = { n: { k: [2] } };
  const ops = diff(a, b);
  ops[0].value.k.push(9);
  ops[1].oldValue.k.push(9);
  assert.deepEqual(b, { n: { k: [2] } });
  assert.deepEqual(a, { o: { k: [1] } });
});

test('applyDiff: bất biến và không đổi đầu vào', () => {
  const cases = [
    [{ a: 1, b: [1, 2, 3], c: { d: 1 } }, { a: 2, b: [1], c: { e: [] } }],
    [{}, { x: [1, { y: null }] }],
    [[1, 2], [1, 2, 3, 4]],
    [[1, 2, 3, 4], [1]],
    [1, { a: 1 }],
    [{ a: { b: 1 } }, { a: [1] }],
  ];
  for (const [a, b] of cases) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const f = (doc, op) => () => applyDiff(doc, [op]);
  throwsCode(f({ a: 1 }, { op: 'add', path: '/a', value: 2 }), 'DIFF_APPLY_FAILED');
  throwsCode(f({}, { op: 'remove', path: '/a', oldValue: 1 }), 'DIFF_APPLY_FAILED');
  throwsCode(f({}, { op: 'replace', path: '/a', oldValue: 1, value: 2 }), 'DIFF_APPLY_FAILED');
  throwsCode(f([1], { op: 'add', path: '/3', value: 2 }), 'DIFF_APPLY_FAILED');
  throwsCode(f([1], { op: 'remove', path: '/1', oldValue: 2 }), 'DIFF_APPLY_FAILED');
  throwsCode(f([1], { op: 'replace', path: '/1', oldValue: 1, value: 2 }), 'DIFF_APPLY_FAILED');
  throwsCode(f({}, { op: 'add', path: '/a/b', value: 1 }), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.equal(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 5 }]), 5);
});

test('format và summarize', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: 3 });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = 3');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
