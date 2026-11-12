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
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 0, '~']), '/x~1y/0/~0');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  for (const s of ['~', 'a~', '~x', '~2']) assert.throws(() => unescapePointer(s), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/~x'), code('DIFF_BAD_POINTER'));
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
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng add tăng dần, remove giảm dần; loại khác nhau', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.equal(diff({ a: [] }, { a: null })[0].path, '/a');
  assert.deepEqual(diff({ b: 1, a: 1 }, { a: 1, b: 1 }), []);
  assert.deepEqual(diff({ b: 1, a: 1 }, {}).map((o) => o.path), ['/a', '/b']);
});

test('diff: value là bản sao sâu', () => {
  const b = { n: { k: [1] } };
  const ops = diff({}, b);
  ops[0].value.k.push(2);
  assert.deepEqual(b, { n: { k: [1] } });
});

test('applyDiff: không đổi doc, lỗi, root', () => {
  const doc = { a: [1, 2], b: 1 };
  const out = applyDiff(doc, [
    { op: 'add', path: '/a/1', value: 9 },
    { op: 'remove', path: '/b', oldValue: 1 },
  ]);
  assert.deepEqual(out, { a: [1, 9, 2] });
  assert.deepEqual(doc, { a: [1, 2], b: 1 });
  assert.deepEqual(applyDiff(doc, [{ op: 'replace', path: '', value: 5 }]), 5);
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff(doc, [{ op: 'add', path: '/b', value: 1 }]), f);
  assert.throws(() => applyDiff(doc, [{ op: 'remove', path: '/z' }]), f);
  assert.throws(() => applyDiff(doc, [{ op: 'replace', path: '/z', value: 1 }]), f);
  assert.throws(() => applyDiff(doc, [{ op: 'add', path: '/a/3', value: 1 }]), f);
  assert.throws(() => applyDiff(doc, [{ op: 'remove', path: '/a/2' }]), f);
  assert.throws(() => applyDiff(doc, [{ op: 'add', path: '/q/r', value: 1 }]), f);
});

test('applyDiff(a, diff(a, b)) bằng sâu b', () => {
  const pairs = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [{ l: [{ a: 1 }, { b: [1, [2, 3]] }], '~': 1 }, { l: [{ a: 2, z: [] }, { b: [1, [2]] }, 7, 8], '~': {} }],
    [[1, 2, 3], { a: 1 }],
    [{ a: [[1], [2, 3]] }, { a: [[1, 2], []] }],
    [1, 1],
    [{ '': 1, '/': 2 }, { '': 2 }],
  ];
  for (const [a, b] of pairs) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  const ops = diff({ a: 1, c: [1] }, { a: 2, b: 3 });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = 3\n- /c = [1]');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
