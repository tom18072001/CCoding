import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e instanceof Error && e.code === c;

test('ví dụ mục 9', () => {
  assert.deepEqual(
    diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }),
    [
      { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
      { op: 'remove', path: '/a/b/2', oldValue: 3 },
      { op: 'add', path: '/c', value: null },
      { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
    ],
  );
});

test('escape/unescape/pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/~0/0'), ['a/b', '~', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
  for (const bad of ['a', '/a~', '/a~2', '/~x']) {
    assert.throws(() => parsePointer(bad), code('DIFF_BAD_POINTER'));
  }
  assert.throws(() => unescapePointer('x~'), code('DIFF_BAD_POINTER'));
});

test('bất biến applyDiff(a, diff(a,b)) = b', () => {
  const pairs = [
    [{ a: [1, 2, 3, 4] }, { a: [1] }],
    [{ a: [1] }, { a: [1, 2, [3], { x: 1 }] }],
    [{ a: null }, { a: [] }],
    [{ a: [] }, { a: {} }],
    [{ a: {} }, { a: null }],
    [{ 'k~/': { 'x/~': 1 } }, { 'k~/': { 'x/~': 2, '': 3 } }],
    [1, 2], [1, { a: 1 }], [[1], { a: 1 }], [null, [1]], [{ a: 1 }, 'x'],
    [{ a: [{ b: [1, 2] }, 5] }, { a: [{ b: [2], c: 1 }] }],
    [{}, {}],
  ];
  for (const [a, b] of pairs) {
    const a0 = JSON.parse(JSON.stringify(a));
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.deepEqual(a, a0);
  }
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diff(null, null), []);
  assert.deepEqual(diff(1, 'x'), [{ op: 'replace', path: '', oldValue: 1, value: 'x' }]);
});

test('thứ tự khóa và sắp xếp', () => {
  const ops = diff({ b: 1, c: 1, a: 1 }, { b: 2, d: 1, a: 1, B: 0 });
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/b', '/c', '/d']);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'oldValue']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
});

test('bản sao sâu và doc không đổi', () => {
  const b = { a: { x: [1] } };
  const ops = diff({}, b);
  b.a.x.push(2);
  assert.deepEqual(ops[0].value, { x: [1] });
  const doc = { a: [1] };
  const out = applyDiff(doc, [{ op: 'add', path: '/b', value: ops[0].value }]);
  out.b.x.push(9);
  assert.deepEqual(doc, { a: [1] });
  assert.deepEqual(ops[0].value, { x: [1] });
});

test('lỗi apply', () => {
  const bad = [
    [{ a: 1 }, { op: 'add', path: '/a', value: 2 }],
    [{ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 }],
    [{ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 }],
    [{ a: [1] }, { op: 'add', path: '/a/3', value: 2 }],
    [{ a: [1] }, { op: 'remove', path: '/a/1', oldValue: 2 }],
    [{ a: [1] }, { op: 'replace', path: '/a/1', oldValue: 1, value: 2 }],
    [{ a: 1 }, { op: 'add', path: '/x/y', value: 2 }],
    [{ a: 1 }, { op: 'add', path: '/a/y', value: 2 }],
    [{ a: [1] }, { op: 'add', path: '/a/-', value: 2 }],
  ];
  for (const [d, o] of bad) assert.throws(() => applyDiff(d, [o]), code('DIFF_APPLY_FAILED'));
  assert.throws(() => applyDiff({}, [{ op: 'add', path: 'a', value: 1 }]), code('DIFF_BAD_POINTER'));
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: [1] }]), [1]);
  assert.deepEqual(applyDiff({ a: [1] }, [{ op: 'add', path: '/a/1', value: 2 }]), { a: [1, 2] });
});

test('định dạng', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff(1, 2).concat(diff({ a: 1 }, { b: [1, 2] }));
  assert.equal(formatText(ops), '~ (root): 1 -> 2\n- /a = 1\n+ /b = [1,2]');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
