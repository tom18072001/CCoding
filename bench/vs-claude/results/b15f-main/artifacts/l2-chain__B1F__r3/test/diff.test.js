import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const badPtr = (fn) => assert.throws(fn, (e) => e.code === 'DIFF_BAD_POINTER');

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(ops.map((o) => Object.keys(o)), [
    ['op', 'path', 'oldValue', 'value'], ['op', 'path', 'oldValue'],
    ['op', 'path', 'value'], ['op', 'path', 'oldValue', 'value'],
  ]);
});

test('diff: mảng co/giãn đúng thứ tự chỉ số', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
});

test('diff: null là loại riêng, mảng ≠ đối tượng, gốc', () => {
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff({ b: 1, a: 1 }, { a: 1, b: 1 }), []);
});

test('diff: sắp khóa theo sort() mặc định', () => {
  const ops = diff({}, { b: 1, B: 2, a: 3, '': 4 });
  assert.deepEqual(ops.map((o) => o.path), ['/', '/B', '/a', '/b']);
});

test('diff: value/oldValue là bản sao sâu', () => {
  const a = { x: { k: [1] } };
  const b = { y: { k: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.k.push(9);
  ops[1].value.k.push(9);
  assert.deepEqual(a, { x: { k: [1] } });
  assert.deepEqual(b, { y: { k: [2] } });
});

test('applyDiff(a, diff(a,b)) bằng sâu b', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2], [1, 2, 3, 4, 5]],
    [[1, 2, 3, 4, 5], [1]],
    [[{ a: 1 }, { b: [1] }], [{ a: 2 }, { b: [1, 2] }, 7]],
    [{ a: 1 }, [1]],
    [{ a: [] }, { a: {} }],
    [1, 'x'],
    [null, { a: null }],
    [{ 'a~b': 1, '': 2 }, { 'a~b': 3, '/': 4 }],
    [{}, {}],
    [{ a: [[1, 2], [3]] }, { a: [[1], [3, 4], []] }],
  ];
  for (const [a, b] of cases) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED và path rỗng', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), (e) => e.code === 'DIFF_APPLY_FAILED');
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b' });
  bad({ a: 1 }, { op: 'replace', path: '/b', value: 1 });
  bad([1], { op: 'add', path: '/3', value: 1 });
  bad([1], { op: 'remove', path: '/1' });
  bad([1], { op: 'replace', path: '/1', value: 0 });
  bad({}, { op: 'add', path: '/x/y', value: 0 });
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: [5] }]), [5]);
  assert.deepEqual(applyDiff(1, [{ op: 'add', path: '', value: 2 }]), 2);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
});

test('con trỏ JSON: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~0~1b'), 'a~/b');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/b~1c/0'), ['a', 'b/c', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', '~', 0]), '/a~1b/~0/0');
});

test('con trỏ JSON: lỗi DIFF_BAD_POINTER', () => {
  badPtr(() => unescapePointer('a~'));
  badPtr(() => unescapePointer('~2'));
  badPtr(() => unescapePointer('~x'));
  badPtr(() => parsePointer('a/b'));
  badPtr(() => parsePointer('/a~'));
  badPtr(() => parsePointer('/a/~9'));
});

test('định dạng và summarize', () => {
  const ops = diff({ a: 1, b: 1 }, { a: 2, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 1\n+ /c = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
