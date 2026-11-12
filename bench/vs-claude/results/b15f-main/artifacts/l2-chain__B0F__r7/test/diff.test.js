import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('diff: export đúng 9 hàm', async () => {
  const m = await import('../src/diff.js');
  assert.deepEqual(Object.keys(m).sort(), [
    'applyDiff', 'diff', 'escapePointer', 'formatJson', 'formatPointer',
    'formatText', 'parsePointer', 'summarize', 'unescapePointer',
  ]);
});

test('pointer: escape/unescape/format/parse', () => {
  assert.equal(escapePointer('x/y'), 'x~1y');
  assert.equal(escapePointer('a~b/c'), 'a~0b~1c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('a~1b~0'), 'a/b~');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 0, 'x/y']), '/a/0/x~1y');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/x~1y/'), ['a', 'x/y', '']);
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~2'), code('DIFF_BAD_POINTER'));
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

test('diff: thứ tự khóa trong từng op', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: 3 });
  assert.deepEqual(ops.map((o) => o.op), ['replace', 'remove', 'add']);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng add tăng dần, remove giảm dần; sort khóa theo UTF-16', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({}, { b: 1, B: 1, a: 1, 10: 1, 2: 1 }).map((o) => o.path), ['/10', '/2', '/B', '/a', '/b']);
});

test('diff: kiểu khác nhau, null, gốc', () => {
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: 0 }), [{ op: 'replace', path: '/a', oldValue: null, value: 0 }]);
  assert.deepEqual(diff({ a: [1] }, { a: [1] }), []);
});

test('diff: value là bản sao sâu', () => {
  const b = { n: { k: [1] } };
  const ops = diff({}, b);
  ops[0].value.k.push(2);
  assert.deepEqual(b, { n: { k: [1] } });
});

test('applyDiff: round-trip và không đổi doc', () => {
  const pairs = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [{ a: [1] }, { a: [1, 2, { z: 1 }] }],
    [{ a: 1 }, { a: [1] }],
    [{ a: { b: 1 } }, { a: null }],
    [[1, 2, 3, 4], [9]],
    [5, { q: 1 }],
    [{ a: 1 }, { a: 1 }],
  ];
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'remove', path: '/b', oldValue: 1 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'replace', path: '/b', oldValue: 1, value: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/3', value: 2 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'remove', path: '/1', oldValue: 2 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 1 }]), f);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.equal(applyDiff({ a: 1 }, [{ op: 'add', path: '', value: 7 }]), 7);
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, b: [1] }, { a: 2, c: 'x' });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = [1]\n+ /c = "x"');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
