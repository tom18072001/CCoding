import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('escape/unescape', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  for (const bad of ['~', 'a~', '~2', '~x']) {
    assert.throws(() => unescapePointer(bad), code('DIFF_BAD_POINTER'));
  }
});

test('parsePointer/formatPointer', () => {
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/~0/0'), ['a/b', '~', '0']);
  assert.throws(() => parsePointer('a'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', '~', 0, '']), '/a~1b/~0/0/');
});

test('đối tượng, mảng, null đối chiếu lẫn nhau', () => {
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diff([], []), []);
  assert.deepEqual(diff(null, null), []);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: [] }), [{ op: 'replace', path: '/a', oldValue: null, value: [] }]);
  assert.deepEqual(diff(1, '1'), [{ op: 'replace', path: '', oldValue: 1, value: '1' }]);
  assert.deepEqual(diff([1], [1, 2, 3]), [
    { op: 'add', path: '/1', value: 2 },
    { op: 'add', path: '/2', value: 3 },
  ]);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff({ b: 1, a: 1 }, { a: 2, b: 2 }).map((o) => o.path), ['/a', '/b']);
});

test('applyDiff: bất biến', () => {
  const pairs = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2, 3, 4], [9]],
    [[], [1, [2], { z: 1 }]],
    [1, { a: 1 }],
    [{ a: [{ k: 1 }, null] }, { a: [{ k: 2, m: [] }], q: 'x' }],
    [null, null],
  ];
  for (const [a, b] of pairs) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: lỗi và gốc', () => {
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 5 }]), 5);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  const f = (doc, op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  f({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  f({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  f({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  f([1], { op: 'add', path: '/3', value: 2 });
  f([1], { op: 'remove', path: '/1', oldValue: 2 });
  f([1], { op: 'replace', path: '/5', oldValue: 1, value: 2 });
  f({}, { op: 'add', path: '/a/b', value: 1 });
});

test('không chia sẻ tham chiếu', () => {
  const a = { o: { x: [1] } };
  const b = { n: { y: [2] } };
  const ops = diff(a, b);
  ops[0].value.y.push(9);
  ops[1].oldValue.x.push(9);
  assert.deepEqual(a, { o: { x: [1] } });
  assert.deepEqual(b, { n: { y: [2] } });
  const doc = { k: 1 };
  const val = { deep: [1] };
  const out = applyDiff(doc, [{ op: 'add', path: '/v', value: val }]);
  out.v.deep.push(2);
  assert.deepEqual(val, { deep: [1] });
  assert.deepEqual(doc, { k: 1 });
});

test('định dạng', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, r: [1] }, { a: 2, n: 'x' });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /n = "x"\n- /r = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff(1, 2)), JSON.stringify(diff(1, 2), null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
