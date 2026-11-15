import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a/b~c'), 'a~1b~0c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('abc'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~x'), code('DIFF_BAD_POINTER'));
});

test('diff: ví dụ mục 9 và thứ tự khóa', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng thừa, loại, null, bằng nhau', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.equal(diff(1, '1').length, 1);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(null, null), []);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: bản sao sâu', () => {
  const a = { x: { y: 1 } };
  const b = { z: { w: [1] } };
  const ops = diff(a, b);
  ops[0].oldValue.y = 99;
  ops[1].value.w.push(2);
  assert.deepEqual(a, { x: { y: 1 } });
  assert.deepEqual(b, { z: { w: [1] } });
});

test('applyDiff: bất biến applyDiff(a, diff(a,b)) = b', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [{ l: [1] }, { l: [1, 2, { k: [3] }, 4] }],
    [{ l: [1, 2, 3, 4, 5] }, { l: [9] }],
    [{ a: 1 }, [1, 2]],
    [{ a: null }, { a: 'x' }],
    [{ a: { b: 1 } }, { a: [1] }],
    [5, { z: 1 }],
    [{ '': 1, '~': 2 }, { '': 3, '/': 4 }],
    [{ a: 1 }, { a: 1 }],
  ];
  for (const [a, b] of cases) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: không đổi doc, thay gốc, chèn mảng', () => {
  const doc = { l: [1, 3] };
  const r = applyDiff(doc, [{ op: 'add', path: '/l/1', value: 2 }, { op: 'add', path: '/l/3', value: 4 }]);
  assert.deepEqual(r, { l: [1, 2, 3, 4] });
  assert.deepEqual(doc, { l: [1, 3] });
  assert.equal(applyDiff(doc, [{ op: 'replace', path: '', value: 7 }]), 7);
  assert.equal(applyDiff(doc, [{ op: 'add', path: '', value: 8 }]), 8);
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  bad({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  bad({ l: [1] }, { op: 'add', path: '/l/5', value: 1 });
  bad({ l: [1] }, { op: 'remove', path: '/l/1', oldValue: 1 });
  bad({ l: [1] }, { op: 'replace', path: '/l/x', oldValue: 1, value: 1 });
  bad({ a: 1 }, { op: 'add', path: '/q/r', value: 1 });
  bad({ a: 1 }, { op: 'add', path: '/a/r', value: 1 });
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, c: [1] }, { a: 'x', b: { k: null }, c: [] });
  assert.equal(formatText(ops), '~ /a: 1 -> "x"\n+ /b = {"k":null}\n- /c/0 = 1');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.ok(!formatText(ops).endsWith('\n'));
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff(1, 2)), JSON.stringify(diff(1, 2), null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
