import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a/b~c'), 'a~1b~0c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/0'), ['a', 'x/y', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'x/y', 0]), '/a/x~1y/0');
});

test('pointer sai ném DIFF_BAD_POINTER', () => {
  for (const f of [() => unescapePointer('a~'), () => unescapePointer('~2'),
    () => parsePointer('a/b'), () => parsePointer('/a~'), () => parsePointer('/~2')]) {
    assert.throws(f, (e) => e.code === 'DIFF_BAD_POINTER');
  }
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(ops.map((o) => Object.keys(o)), [
    ['op', 'path', 'oldValue', 'value'],
    ['op', 'path', 'oldValue'],
    ['op', 'path', 'value'],
    ['op', 'path', 'oldValue', 'value'],
  ]);
});

test('diff: mảng thêm tăng dần, xóa giảm dần; gốc; loại riêng', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.equal(diff({ a: [1] }, { a: [1] }).length, 0);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {}).length, 1);
  assert.equal(diff(null, 0).length, 1);
});

test('diff: bản sao sâu', () => {
  const b = { k: { z: [1] } };
  const ops = diff({}, b);
  ops[0].value.z.push(9);
  assert.deepEqual(b, { k: { z: [1] } });
  const a = { k: [{ q: 1 }] };
  const ops2 = diff(a, {});
  ops2[0].oldValue[0].q = 5;
  assert.deepEqual(a, { k: [{ q: 1 }] });
});

test('applyDiff: không đổi doc, lỗi có mã', () => {
  const doc = { a: [1, 2], b: 1 };
  const snap = JSON.parse(JSON.stringify(doc));
  const out = applyDiff(doc, [{ op: 'add', path: '/a/2', value: 3 }, { op: 'remove', path: '/b', oldValue: 1 }]);
  assert.deepEqual(out, { a: [1, 2, 3] });
  assert.deepEqual(doc, snap);
  assert.deepEqual(applyDiff({}, [{ op: 'add', path: '', value: 5 }]), 5);
  const bad = [
    { op: 'add', path: '/b', value: 1 },
    { op: 'remove', path: '/zz', oldValue: 1 },
    { op: 'replace', path: '/a/5', oldValue: 1, value: 1 },
    { op: 'add', path: '/a/5', value: 1 },
  ];
  for (const o of bad) assert.throws(() => applyDiff(doc, [o]), (e) => e.code === 'DIFF_APPLY_FAILED');
});

test('bất biến applyDiff(a, diff(a,b)) = b', () => {
  const pairs = [
    [{ a: [1, 2, 3] }, { a: [1] }],
    [{ a: [1] }, { a: [1, 2, 3, 4] }],
    [{ a: 1 }, { a: [1] }],
    [{ a: null }, { a: {} }],
    [[], {}],
    [1, 'x'],
    [null, { a: 1 }],
    [{ 'x/y': 1, 'p~q': { '~1': [null, [1]] } }, { 'x/y': 2, 'p~q': { '~1': [[], {}], n: 1 }, '': 0 }],
    [{ a: [{ b: 1 }, { c: 2 }] }, { a: [{ b: 2 }] }],
  ];
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('định dạng', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText(diff({ a: 1, b: 2 }, { a: 2, c: [1, 2] })), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1,2]');
  assert.equal(formatJson([]), '[]');
  const ops = diff({ a: 1 }, { b: 1 });
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(diff({ a: 1, b: 1 }, { a: 2, c: 1 })), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
