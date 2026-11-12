import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~01'), 'a~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/~0/0'), ['a/b', '~', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', '~', 0]), '/a~1b/~0/0');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
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

test('diff: mảng co/giãn, thứ tự add tăng, remove giảm', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
});

test('diff: đổi loại, null, mảng vs đối tượng, gốc vô hướng', () => {
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: 0 }), [{ op: 'replace', path: '/a', oldValue: null, value: 0 }]);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
});

test('diff: sắp khóa theo sort() mặc định', () => {
  const ops = diff({}, { b: 1, a: 1, B: 1, '': 1 });
  assert.deepEqual(ops.map((o) => o.path), ['/', '/B', '/a', '/b']);
});

test('diff: thứ tự khóa của thao tác', () => {
  const ops = diff({ a: 1, r: 1 }, { a: 2, n: 1 });
  const byOp = Object.fromEntries(ops.map((o) => [o.op, Object.keys(o)]));
  assert.deepEqual(byOp.add, ['op', 'path', 'value']);
  assert.deepEqual(byOp.remove, ['op', 'path', 'oldValue']);
  assert.deepEqual(byOp.replace, ['op', 'path', 'oldValue', 'value']);
});

test('diff: không biến đổi đầu vào, value là bản sao sâu', () => {
  const a = { x: { y: [1] } };
  const b = { z: { w: [2] } };
  const sa = structuredClone(a), sb = structuredClone(b);
  const ops = diff(a, b);
  assert.deepEqual(a, sa);
  assert.deepEqual(b, sb);
  ops.find((o) => o.op === 'add').value.w.push(9);
  ops.find((o) => o.op === 'remove').oldValue.y.push(9);
  assert.deepEqual(a, sa);
  assert.deepEqual(b, sb);
});

test('applyDiff: bất biến applyDiff(a, diff(a,b)) ≡ b', () => {
  const cap = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [{ 'a~b': 1, 'c/d': { 'e~/': [1, 2] } }, { 'a~b': [1], 'c/d': { 'e~/': [1, 2, 3, 4] } }],
    [[1, 2, 3, 4, 5], [9]],
    [[], [1, [2, { a: 1 }]]],
    [{ a: [] }, { a: {} }],
    [{ a: null }, { a: [null] }],
    [1, 'x'], ['x', { a: 1 }], [null, [1]], [{ a: 1 }, 5], [[1, 2], [1, 2]],
    [{ '': 1, '/': 2 }, { '': 2, '~': 3 }],
    [{ a: [{ b: 1 }, { c: 2 }] }, { a: [{ b: 2 }, { c: 2, d: 3 }, { e: 1 }] }],
  ];
  for (const [a, b] of cap) {
    const sa = structuredClone(a);
    const r = applyDiff(a, diff(a, b));
    assert.deepEqual(r, b);
    assert.deepEqual(a, sa);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  bad({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  bad([1], { op: 'add', path: '/3', value: 2 });
  bad([1], { op: 'remove', path: '/1', oldValue: 1 });
  bad([1], { op: 'replace', path: '/x', oldValue: 1, value: 2 });
  bad({}, { op: 'add', path: '/a/b', value: 1 });
  bad(1, { op: 'add', path: '/a', value: 1 });
  bad({}, { op: 'add', path: 'a', value: 1 });
});

test('applyDiff: path "" thay gốc, add chèn vào mảng', () => {
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: [1] }]), [1]);
  assert.deepEqual(applyDiff(1, [{ op: 'add', path: '', value: 2 }]), 2);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, r: [1] }, { a: 2, n: 'x' });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /n = "x"\n- /r = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.ok(!formatText(ops).endsWith('\n'));
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
