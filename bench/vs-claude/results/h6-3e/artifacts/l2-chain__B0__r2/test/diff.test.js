import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(code(() => unescapePointer('a~')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => unescapePointer('~2')), 'DIFF_BAD_POINTER');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(code(() => parsePointer('a')), 'DIFF_BAD_POINTER');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff ví dụ spec', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
});

test('diff: mảng, loại khác nhau, gốc', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.equal(diff({ a: null }, { a: 0 }).length, 1);
});

test('diff sao chép sâu', () => {
  const b = { k: { z: 1 } };
  const ops = diff({}, b);
  b.k.z = 7;
  assert.deepEqual(ops[0].value, { z: 1 });
});

test('applyDiff bất biến', () => {
  const cases = [
    [{ a: [1, 2, 3], b: 1 }, { a: [1, 9], c: { d: [] } }],
    [[1, 2], [1, 2, 3, 4]],
    [1, { a: 1 }],
    [{ 'x/y': 1, '': 2 }, { 'x/y': 3 }],
  ];
  for (const [a, b] of cases) {
    const copy = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), copy);
  }
});

test('applyDiff lỗi', () => {
  const f = (doc, op) => code(() => applyDiff(doc, [op]));
  assert.equal(f({ a: 1 }, { op: 'add', path: '/a', value: 1 }), 'DIFF_APPLY_FAILED');
  assert.equal(f({}, { op: 'remove', path: '/a', oldValue: 1 }), 'DIFF_APPLY_FAILED');
  assert.equal(f({}, { op: 'replace', path: '/a', oldValue: 1, value: 2 }), 'DIFF_APPLY_FAILED');
  assert.equal(f([1], { op: 'add', path: '/2', value: 1 }), 'DIFF_APPLY_FAILED');
  assert.equal(f([1], { op: 'remove', path: '/1', oldValue: 1 }), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.equal(applyDiff([1], [{ op: 'add', path: '', value: 5 }]), 5);
});

test('định dạng', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([{ op: 'remove', path: '/a', oldValue: [1, 'x'] }]), '- /a = [1,"x"]');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff({}, { a: 1 })), '[\n  {\n    "op": "add",\n    "path": "/a",\n    "value": 1\n  }\n]');
  assert.deepEqual(summarize(diff({ a: 1, b: 1 }, { a: 2, c: 1 })), { add: 1, remove: 1, replace: 1 });
});
