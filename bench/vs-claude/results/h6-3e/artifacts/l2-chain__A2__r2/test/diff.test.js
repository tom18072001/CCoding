import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('JSON Pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(code(() => unescapePointer('a~')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => unescapePointer('~2')), 'DIFF_BAD_POINTER');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/c~0'), ['a/b', 'c~']);
  assert.equal(code(() => parsePointer('a')), 'DIFF_BAD_POINTER');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0]), '/a~1b/0');
});

test('diff ví dụ trong đặc tả', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
});

test('diff mảng và loại', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: [1] }, { a: [1] }), []);
  const v = { k: [1] };
  const o = diff({}, { z: v });
  o[0].value.k.push(2);
  assert.deepEqual(v, { k: [1] });
});

test('applyDiff bất biến và lỗi', () => {
  const a = { a: [1, 2, 3], b: { c: 1 }, d: null };
  const b = { a: [1, 9], b: { e: 'x' }, f: [{}] };
  const copy = structuredClone(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.deepEqual(a, copy);
  assert.deepEqual(applyDiff(1, diff(1, [2])), [2]);
  assert.equal(code(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff({}, [{ op: 'remove', path: '/a', oldValue: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'replace', path: '/1', value: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'add', path: '/2', value: 1 }])), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
});

test('định dạng và tóm tắt', () => {
  const ops = diff({ a: 1, b: 1 }, { a: 2, c: 3 });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 1\n+ /c = 3');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});
