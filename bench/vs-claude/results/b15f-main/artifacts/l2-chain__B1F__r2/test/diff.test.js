import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape', () => {
  assert.equal(escapePointer('a/b~c'), 'a~1b~0c');
  assert.equal(escapePointer(3), '3');
  assert.equal(escapePointer('~1'), '~01');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
});

test('pointer: parse/format', () => {
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/0'), ['a', 'x/y', '0']);
  assert.throws(() => parsePointer('a'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['']), '/');
  assert.equal(formatPointer(['a', 'x/y', 0]), '/a/x~1y/0');
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

test('diff: thứ tự khóa của thao tác', () => {
  const ops = diff({ a: 1, b: 1 }, { a: 2, c: 1 });
  assert.deepEqual(ops.map((o) => Object.keys(o)), [
    ['op', 'path', 'oldValue', 'value'],
    ['op', 'path', 'oldValue'],
    ['op', 'path', 'value'],
  ]);
});

test('diff: sort khóa theo UTF-16, mảng add tăng / remove giảm', () => {
  assert.deepEqual(diff({}, { b: 1, B: 1, a: 1 }).map((o) => o.path), ['/B', '/a', '/b']);
  assert.deepEqual(diff([], [1, 2, 3]).map((o) => o.path), ['/0', '/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], []).map((o) => o.path), ['/2', '/1', '/0']);
});

test('diff: khác loại, null, gốc, bằng nhau', () => {
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: 0 }), [{ op: 'replace', path: '/a', oldValue: null, value: 0 }]);
  assert.deepEqual(diff(1, '1')[0].op, 'replace');
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 1), []);
});

test('diff: value là bản sao sâu', () => {
  const b = { x: { y: [1] } };
  const ops = diff({}, b);
  ops[0].value.y.push(2);
  assert.deepEqual(b, { x: { y: [1] } });
  const a = { x: { y: 1 } };
  const ops2 = diff(a, {});
  ops2[0].oldValue.y = 9;
  assert.equal(a.x.y, 1);
});

test('applyDiff: bất biến và không đổi doc', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1, k: [1] };
  const b = { a: { b: [1, 5, 7, 8] }, 'x/y': 2, c: null, k: [] };
  const snap = JSON.stringify(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.equal(JSON.stringify(a), snap);
  assert.deepEqual(applyDiff(1, diff(1, { z: 1 })), { z: 1 });
});

test('applyDiff: lỗi', () => {
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'remove', path: '/a', oldValue: 1 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'replace', path: '/a', oldValue: 1, value: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/2', value: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'remove', path: '/1', oldValue: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'replace', path: '/1', oldValue: 1, value: 2 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 1 }]), f);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/0', value: 0 }]), [0, 1]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 5 }]), 5);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: 'a', value: 1 }]), code('DIFF_BAD_POINTER'));
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  const ops = diff({ a: 1, r: [1] }, { a: 2, b: { c: 3 }, r: [] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = {"c":3}\n- /r/0 = 1');
  assert.ok(!formatText(ops).endsWith('\n'));
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
