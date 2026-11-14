import test from 'node:test';
import assert from 'node:assert/strict';
import { diff, applyDiff, formatText, formatJson, summarize, escapePointer, unescapePointer, parsePointer, formatPointer } from '../src/diff.js';

test('con trỏ JSON', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c~01'), 'a/b~c~1');
  for (const s of ['a~', '~2', '~x']) assert.throws(() => unescapePointer(s), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/~1/'), ['a', '/', '']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'x/y', 0, '']), '/a/x~1y/0/');
});

test('diff ví dụ trong đặc tả', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 }]);
  assert.deepEqual(ops.map((o) => Object.keys(o)), [['op', 'path', 'oldValue', 'value'], ['op', 'path', 'oldValue'], ['op', 'path', 'value'], ['op', 'path', 'oldValue', 'value']]);
  assert.deepEqual(applyDiff(a, ops), b);
});

test('diff: mảng, loại khác nhau, gốc, bản sao sâu', () => {
  assert.deepEqual(diff([1], [1, 2, 3]), [{ op: 'add', path: '/1', value: 2 }, { op: 'add', path: '/2', value: 3 }]);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {}).length, 1);
  assert.equal(diff({ a: null }, { a: 0 }).length, 1);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff({ B: 1, a: 1 }, {}).map((o) => o.path), ['/B', '/a']);
  const v = { k: [1] };
  const ops = diff({}, { z: v });
  v.k.push(2);
  assert.deepEqual(ops[0].value, { k: [1] });
});

test('applyDiff: lỗi và không đổi đầu vào', () => {
  const doc = { a: [1], o: {} };
  assert.equal(applyDiff(doc, [{ op: 'add', path: '/a/1', value: 2 }, { op: 'replace', path: '', oldValue: doc, value: 7 }]), 7);
  assert.deepEqual(doc, { a: [1], o: {} });
  const bad = (op) => assert.throws(() => applyDiff(doc, [op]), { code: 'DIFF_APPLY_FAILED' });
  bad({ op: 'add', path: '/o', value: 1 });
  bad({ op: 'remove', path: '/zz' });
  bad({ op: 'replace', path: '/a/5', value: 1 });
  bad({ op: 'add', path: '/a/3', value: 1 });
  bad({ op: 'remove', path: '/q/r' });
});

test('invariant applyDiff(a, diff(a,b)) = b', () => {
  const cases = [[{}, { a: 1 }], [[1, 2, 3], [3]], [{ a: [1, { b: 1 }] }, { a: [2, { c: 1 }, 5] }], [1, { a: 1 }], [{ a: 1 }, [1]]];
  for (const [a, b] of cases) assert.deepEqual(applyDiff(a, diff(a, b)), b);
});

test('định dạng', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 3, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 3\n- /b = 2\n+ /c = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff(1, 2)), JSON.stringify(diff(1, 2), null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
