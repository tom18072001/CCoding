import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return null;
};

test('JSON Pointer', () => {
  assert.equal(escapePointer('a~b/c'), 'a~0b~1c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(code(() => unescapePointer('a~')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => unescapePointer('~2')), 'DIFF_BAD_POINTER');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(code(() => parsePointer('a')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => parsePointer('/a~')), 'DIFF_BAD_POINTER');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff: ví dụ trong đặc tả', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
});

test('diff: mảng thêm/bớt, khác loại, gốc, bằng nhau', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff(1, '1').length, 1);
  assert.deepEqual(diff({ a: [1, { b: null }] }, { a: [1, { b: null }] }), []);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: bản sao sâu', () => {
  const b = { k: { z: [1] } };
  const ops = diff({}, b);
  ops[0].value.z = 1;
  b.k.z.push(2);
  assert.deepEqual(ops[0].value, { z: 1 });
});

test('applyDiff: bất biến và lỗi', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2, 3, 4, 5], [9]],
    [[], [1, [2], { a: 1 }]],
    [1, { a: 1 }],
    [{ a: { b: 1 } }, { a: [1] }],
  ];
  for (const [a, b] of cases) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
  assert.equal(code(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff({ a: 1 }, [{ op: 'remove', path: '/b', oldValue: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'replace', path: '/1', oldValue: 1, value: 2 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'add', path: '/2', value: 2 }])), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff({}, [{ op: 'add', path: '', value: 7 }]), 7);
});

test('formatText, formatJson, summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, r: 1 }, { a: 2, n: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /n = [1]\n- /r = 1');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff(1, 2)), JSON.stringify(diff(1, 2), null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});
