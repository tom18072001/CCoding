import test from 'node:test';
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
  assert.deepEqual(parsePointer('/a/~1/b~0'), ['a', '/', 'b~']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 0, '']), '/x~1y/0/');
});

test('pointer sai', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/~2'), code('DIFF_BAD_POINTER'));
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
});

test('diff: mảng thừa, loại khác, gốc', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: 1 }, { a: '1' }).length, 1);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff({ b: 1, a: 1 }, { c: 1 }).map((o) => o.path), ['/a', '/b', '/c']);
});

test('diff: bản sao sâu', () => {
  const a = { k: { x: [1] } };
  const b = { n: { y: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.x.push(9);
  ops[1].value.y.push(9);
  assert.deepEqual(a, { k: { x: [1] } });
  assert.deepEqual(b, { n: { y: [2] } });
});

test('applyDiff: bất biến và không đổi đầu vào', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2], [1, 2, 3, 4]],
    [[1, 2, 3, 4], [9]],
    [1, { a: 1 }],
    [{ a: [{ b: 1 }] }, { a: [{ b: 2 }, [3]] }],
  ];
  for (const [a, b] of cases) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('applyDiff: lỗi', () => {
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'remove', path: '/b', oldValue: 1 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'replace', path: '/b', oldValue: 1, value: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'remove', path: '/1', oldValue: 1 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/3', value: 1 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 1 }]), f);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'add', path: '', value: 5 }]), 5);
});

test('formatText/formatJson/summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, c: 1 }, { a: 2, b: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = [1]\n- /c = 1');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
