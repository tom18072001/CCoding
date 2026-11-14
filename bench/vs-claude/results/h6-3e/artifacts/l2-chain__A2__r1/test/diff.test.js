import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer, diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

test('JSON pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  for (const s of ['~', 'a~', '~2']) assert.throws(() => unescapePointer(s), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0]), '/a~1b/0');
});

test('diff theo đặc tả', () => {
  assert.deepEqual(diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }), [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff([], [1, 2]).map((o) => o.path), ['/0', '/1']);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(Object.keys(diff({ a: 1 }, { a: 2 })[0]), ['op', 'path', 'oldValue', 'value']);
  const src = { a: [1] };
  const ops = diff({}, src);
  ops[0].value[0] = 9;
  assert.equal(src.a[0], 1);
});

test('applyDiff bất biến', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2, 3, 4], [1, 9]], [[], [1, [2], { k: 1 }]], [1, { a: 1 }], [{ a: 1, b: 2 }, {}],
  ];
  for (const [a, b] of cases) assert.deepEqual(applyDiff(a, diff(a, b)), b);
  const doc = { a: [1] };
  applyDiff(doc, [{ op: 'add', path: '/a/1', value: 2 }]);
  assert.deepEqual(doc, { a: [1] });
  for (const op of [
    { op: 'add', path: '/a', value: 1 }, { op: 'remove', path: '/z' }, { op: 'replace', path: '/z', value: 1 },
    { op: 'add', path: '/l/5', value: 1 }, { op: 'remove', path: '/l/2' },
  ]) assert.throws(() => applyDiff({ a: 1, l: [1] }, [op]), { code: 'DIFF_APPLY_FAILED' });
});

test('định dạng', () => {
  const ops = diff({ a: 1, b: 1 }, { a: 2, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 1\n+ /c = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});
