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
  assert.equal(unescapePointer('a~0~1b'), 'a~/b');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/0'), ['a', 'x/y', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['']), '/');
  assert.equal(formatPointer(['a', 'x/y', 0]), '/a/x~1y/0');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
});

test('diff: ví dụ mục 9', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(applyDiff(a, ops), b);
});

test('diff: mảng dài ra / co lại', () => {
  assert.deepEqual(diff([1], [1, 2, 3]), [
    { op: 'add', path: '/1', value: 2 },
    { op: 'add', path: '/2', value: 3 },
  ]);
  assert.deepEqual(diff([1, 2, 3, 4], [1]), [
    { op: 'remove', path: '/3', oldValue: 4 },
    { op: 'remove', path: '/2', oldValue: 3 },
    { op: 'remove', path: '/1', oldValue: 2 },
  ]);
});

test('diff: đổi kiểu, gốc, null, bằng nhau', () => {
  assert.deepEqual(diff({ a: 1 }, [1]), [{ op: 'replace', path: '', oldValue: { a: 1 }, value: [1] }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 1), []);
});

test('diff: bản sao sâu', () => {
  const b = { k: { z: 1 } };
  const ops = diff({}, b);
  ops[0].value.z = 9;
  b.k.z = 7;
  assert.deepEqual(ops[0].value, { z: 9 });
  const a = { k: [1] };
  const r = diff(a, {});
  r[0].oldValue.push(2);
  assert.deepEqual(a, { k: [1] });
});

test('applyDiff: bất biến trên nhiều cặp, không đổi đầu vào', () => {
  const pairs = [
    [{ a: 1 }, { a: 1, b: [1, 2] }],
    [[1, 2, 3], [9]],
    [[], [{ x: 1 }, [2]]],
    [{ 'a/b': { '~': [1, null] } }, { 'a/b': { '~': [1, 2, 3] }, '': 5 }],
    [1, { a: 1 }],
    [{ a: { b: 1 } }, { a: [1] }],
    [{ a: [1, 2, 3, 4, 5] }, { a: [1, 2] }],
  ];
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const bad = [
    [{ a: 1 }, { op: 'add', path: '/a', value: 2 }],
    [{ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 }],
    [{ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 }],
    [{ a: [1] }, { op: 'add', path: '/a/3', value: 2 }],
    [{ a: [1] }, { op: 'remove', path: '/a/1', oldValue: 2 }],
    [{ a: [1] }, { op: 'replace', path: '/a/x', oldValue: 1, value: 2 }],
    [{ a: 1 }, { op: 'add', path: '/q/r', value: 2 }],
    [{ a: 1 }, { op: 'remove', path: '', oldValue: 1 }],
  ];
  for (const [d, op] of bad) assert.throws(() => applyDiff(d, [op]), code('DIFF_APPLY_FAILED'));
  assert.throws(() => applyDiff({}, [{ op: 'add', path: 'a', value: 1 }]), code('DIFF_BAD_POINTER'));
});

test('applyDiff: add chèn vào mảng, thay gốc', () => {
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.equal(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 5 }]), 5);
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, c: 'x' }, { a: [1], b: 2 });
  assert.equal(formatText(ops), '~ /a: 1 -> [1]\n+ /b = 2\n- /c = "x"');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});
