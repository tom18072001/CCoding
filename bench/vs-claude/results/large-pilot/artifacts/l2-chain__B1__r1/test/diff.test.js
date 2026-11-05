import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

test('pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  for (const bad of ['~', 'a~2', '~x']) assert.throws(() => unescapePointer(bad), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0]), '/a~1b/0');
});

test('diff: ví dụ SPEC', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  assert.deepEqual(diff(a, b), [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(diff(1, 2)[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(diff(a, structuredClone(a)), []);
});

test('diff: mảng và khác loại', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  const v = { k: [1] };
  const ops = diff({}, v);
  v.k.push(2);
  assert.deepEqual(ops[0].value, [1]);
});

test('applyDiff: bất biến và lỗi', () => {
  const a = { a: [1, 2, 3], o: { p: 1 }, z: 0 };
  const b = { a: [1, 9], o: { q: 1 }, n: [null] };
  const snapshot = structuredClone(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.deepEqual(a, snapshot);
  assert.deepEqual(applyDiff(1, diff(1, 'x')), 'x');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 1 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff({}, [{ op: 'remove', path: '/a', oldValue: 1 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff([1], [{ op: 'replace', path: '/1', oldValue: 1, value: 2 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/3', value: 2 }]), { code: 'DIFF_APPLY_FAILED' });
});

test('format và summarize', () => {
  const ops = diff({ a: 1, b: 1 }, { a: 2, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 1\n+ /c = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});

test('diff: biên khóa có / và ~, null, mảng vs đối tượng, thứ tự khóa op', () => {
  const ops = diff({ 'a/b': 1, 'c~d': null, m: [], n: {} }, { 'a/b': 2, 'c~d': {}, m: {}, n: [] });
  assert.deepEqual(ops.map((o) => o.path), ['/a~1b', '/c~0d', '/m', '/n']);
  assert.ok(ops.every((o) => o.op === 'replace'));
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(diff({}, { a: 1 })[0]), ['op', 'path', 'value']);
  assert.deepEqual(Object.keys(diff({ a: 1 }, {})[0]), ['op', 'path', 'oldValue']);
  assert.deepEqual(diff(1, 'x'), [{ op: 'replace', path: '', oldValue: 1, value: 'x' }]);
  assert.deepEqual(diff([1, 2], [1, 2]), []);
});

test('diff: mảng thêm tăng dần, xóa giảm dần; sâu và độc lập đầu vào', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  const a = { x: { y: 1 } };
  const ops = diff({}, a);
  a.x.y = 9;
  assert.equal(ops[0].value.y, 1);
});

test('applyDiff: biên', () => {
  assert.deepEqual(applyDiff({ 'a/b': [1] }, [{ op: 'add', path: '/a~1b/1', value: 2 }]), { 'a/b': [1, 2] });
  assert.deepEqual(applyDiff(1, [{ op: 'replace', path: '', oldValue: 1, value: [2] }]), [2]);
  for (const op of [
    { op: 'add', path: '/a', value: 1 },
    { op: 'remove', path: '/z' },
    { op: 'replace', path: '/z', value: 1 },
  ]) {
    assert.throws(() => applyDiff({ a: 0 }, [op]), { code: 'DIFF_APPLY_FAILED' });
  }
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/3', value: 1 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff([1], [{ op: 'remove', path: '/1' }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff({}, [{ op: 'remove', path: '' }]), { code: 'DIFF_APPLY_FAILED' });
  const doc = { a: 1 };
  applyDiff(doc, [{ op: 'replace', path: '/a', value: 2 }]);
  assert.deepEqual(doc, { a: 1 });
});

test('pointer: biên', () => {
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~01'), ['a~1']);
  assert.equal(formatPointer([]), '');
  for (const p of ['a', '/a~', '/a~2']) assert.throws(() => parsePointer(p), { code: 'DIFF_BAD_POINTER' });
  assert.equal(escapePointer(3), '3');
});

test('formatText/formatJson biên', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
