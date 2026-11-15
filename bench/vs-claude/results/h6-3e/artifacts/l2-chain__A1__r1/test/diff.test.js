import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/index.js';

test('con trỏ JSON', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.throws(() => unescapePointer('a~'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => unescapePointer('~2'), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['', 'a/b', 1]), '//a~1b/1');
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

test('diff mảng: add tăng, remove giảm; khác loại; gốc', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: 1, b: [1] }, { a: 1, b: [1] }), []);
  assert.deepEqual(diff(1, 1), []);
});

test('diff sao chép sâu', () => {
  const b = { k: { z: 1 } };
  const ops = diff({}, b);
  ops[0].value.z = 2;
  ops[0].value.k = 0;
  assert.deepEqual(b, { k: { z: 1 } });
});

test('applyDiff bất biến và lỗi', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1, z: [1] };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null, z: [1, 2, 3, 4] };
  const orig = JSON.stringify(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.equal(JSON.stringify(a), orig);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.equal(applyDiff(1, [{ op: 'replace', path: '', value: 5 }]), 5);
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), { code: 'DIFF_APPLY_FAILED' });
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({}, { op: 'remove', path: '/a' });
  bad({}, { op: 'replace', path: '/a', value: 1 });
  bad([1], { op: 'add', path: '/3', value: 1 });
  bad([1], { op: 'remove', path: '/1' });
  bad({}, { op: 'add', path: '/a/b', value: 1 });
});

test('định dạng', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: [1, 2] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1,2]');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
