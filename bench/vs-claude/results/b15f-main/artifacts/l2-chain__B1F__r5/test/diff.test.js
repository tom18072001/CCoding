import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/0'), ['a', 'x/y', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'x/y', 0]), '/a/x~1y/0');
});

test('pointer lỗi: ~, ~2, a', () => {
  for (const f of [() => unescapePointer('~'), () => unescapePointer('~2'), () => parsePointer('/a~'), () => parsePointer('a'), () => parsePointer('/~2')]) {
    assert.throws(f, (e) => e instanceof Error && e.code === 'DIFF_BAD_POINTER');
  }
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
});

test('diff: thứ tự khóa trong op', () => {
  const [r, a, m] = [
    diff(1, 2)[0],
    diff({}, { k: 1 })[0],
    diff({ k: 1 }, {})[0],
  ];
  assert.deepEqual(Object.keys(r), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(a), ['op', 'path', 'value']);
  assert.deepEqual(Object.keys(m), ['op', 'path', 'oldValue']);
});

test('diff: gốc, loại, null, mảng', () => {
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: 0 }).map((o) => o.op), ['replace']);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: bản sao sâu', () => {
  const b = { k: { z: [1] } };
  const ops = diff({}, b);
  ops[0].value.z = 9;
  ops[0].value.k = 1;
  assert.deepEqual(b, { k: { z: [1] } });
  const a = { k: [1] };
  const o2 = diff(a, {});
  o2[0].oldValue.push(2);
  assert.deepEqual(a, { k: [1] });
});

test('applyDiff: không đổi doc, lỗi, gốc', () => {
  const doc = { a: [1, 2], o: {} };
  const snap = JSON.stringify(doc);
  const r = applyDiff(doc, [
    { op: 'add', path: '/a/1', value: 9 },
    { op: 'add', path: '/o/x~1y', value: 1 },
    { op: 'remove', path: '/a/0', oldValue: 1 },
  ]);
  assert.deepEqual(r, { a: [9, 2], o: { 'x/y': 1 } });
  assert.equal(JSON.stringify(doc), snap);
  assert.equal(applyDiff(doc, [{ op: 'replace', path: '', oldValue: doc, value: 5 }]), 5);
  const bad = [
    [{ op: 'add', path: '/o', value: 1 }, { op: 'add', path: '/o', value: 1 }],
    [{ op: 'remove', path: '/zz' }],
    [{ op: 'replace', path: '/a/5', value: 1 }],
    [{ op: 'add', path: '/a/5', value: 1 }],
    [{ op: 'add', path: '/q/w', value: 1 }],
  ];
  for (const ops of bad) {
    assert.throws(() => applyDiff(doc, ops), (e) => e.code === 'DIFF_APPLY_FAILED');
  }
});

test('bất biến round-trip trên các cặp cố định', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const gen = (d) => {
    const t = rnd(d > 2 ? 4 : 6);
    if (t === 0) return rnd(5);
    if (t === 1) return ['x', 'y/z', 'a~b'][rnd(3)];
    if (t === 2) return null;
    if (t === 3) return rnd(2) === 0;
    if (t === 4) return Array.from({ length: rnd(4) }, () => gen(d + 1));
    const o = {};
    for (let i = rnd(4); i > 0; i--) o[['a', 'b', 'c/d', 'e~', ''][rnd(5)]] = gen(d + 1);
    return o;
  };
  for (let i = 0; i < 200; i++) {
    const a = gen(0);
    const b = gen(0);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
  }
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1]');
  assert.equal(formatText(diff(1, 'x')), '~ (root): 1 -> "x"');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
