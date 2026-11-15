import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('a~1b~0'), 'a/b~');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/x~1y/0'), ['x/y', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 0, '~']), '/x~1y/0/~0');
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
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

test('diff: thứ tự khóa của từng thao tác', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: 3 });
  assert.deepEqual(ops.map((o) => Object.keys(o)), [
    ['op', 'path', 'oldValue', 'value'],
    ['op', 'path', 'oldValue'],
    ['op', 'path', 'value'],
  ]);
});

test('diff: loại riêng, gốc, mảng thêm/xóa', () => {
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ a: [] }, { a: [] }), []);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: [] }), [{ op: 'replace', path: '/a', oldValue: null, value: [] }]);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: giá trị là bản sao sâu', () => {
  const b = { x: { y: [1] } };
  const ops = diff({}, b);
  ops[0].value.y.push(2);
  assert.deepEqual(b, { x: { y: [1] } });
});

test('applyDiff: không đổi doc, lỗi đúng mã', () => {
  const doc = { a: [1, 2], o: { k: 1 } };
  const snap = JSON.stringify(doc);
  assert.deepEqual(
    applyDiff(doc, [{ op: 'add', path: '/a/2', value: 3 }, { op: 'add', path: '/a/0', value: 0 }]),
    { a: [0, 1, 2, 3], o: { k: 1 } },
  );
  assert.equal(JSON.stringify(doc), snap);
  assert.equal(applyDiff(doc, [{ op: 'replace', path: '', value: 5 }]), 5);
  assert.equal(applyDiff(doc, [{ op: 'add', path: '', value: 5 }]), 5);
  const bad = (op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  bad({ op: 'add', path: '/o/k', value: 1 });
  bad({ op: 'add', path: '/a/3', value: 1 });
  bad({ op: 'remove', path: '/o/z' });
  bad({ op: 'replace', path: '/o/z', value: 1 });
  bad({ op: 'remove', path: '/a/2' });
  bad({ op: 'replace', path: '/a/2', value: 1 });
  bad({ op: 'remove', path: '/nope/x' });
  assert.throws(() => applyDiff(doc, [{ op: 'add', path: 'a', value: 1 }]), code('DIFF_BAD_POINTER'));
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, b: [1] }, { a: 'x', c: { d: 1 } });
  assert.equal(formatText(ops), '~ /a: 1 -> "x"\n- /b = [1]\n+ /c = {"d":1}');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function gen(r, depth) {
  const t = Math.floor(r() * (depth > 2 ? 4 : 6));
  if (t === 0) return null;
  if (t === 1) return Math.floor(r() * 3);
  if (t === 2) return ['a', 'b', 'x/y', '~'][Math.floor(r() * 4)];
  if (t === 3) return r() < 0.5;
  if (t === 4) return Array.from({ length: Math.floor(r() * 4) }, () => gen(r, depth + 1));
  const o = {};
  for (let i = Math.floor(r() * 4); i > 0; i--) o[['a', 'b', 'c', 'x/y', '~'][Math.floor(r() * 5)]] = gen(r, depth + 1);
  return o;
}

test('bất biến: applyDiff(a, diff(a, b)) = b (seed cố định)', () => {
  const r = rng(12345);
  for (let i = 0; i < 300; i++) {
    const a = gen(r, 0);
    const b = gen(r, 0);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
  }
});
