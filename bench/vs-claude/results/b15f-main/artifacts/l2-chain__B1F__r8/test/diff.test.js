import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('escape/unescape pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(12), '12');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('a~1b~0'), 'a/b~');
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
});

test('parse/format pointer', () => {
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
});

test('thứ tự khóa của thao tác', () => {
  const ops = diff({ r: 1, d: 2 }, { r: 2, n: 3 });
  const byOp = Object.fromEntries(ops.map((o) => [o.op, Object.keys(o)]));
  assert.deepEqual(byOp.add, ['op', 'path', 'value']);
  assert.deepEqual(byOp.remove, ['op', 'path', 'oldValue']);
  assert.deepEqual(byOp.replace, ['op', 'path', 'oldValue', 'value']);
});

test('diff mảng và khác loại', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({}, []), [{ op: 'replace', path: '', oldValue: {}, value: [] }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: 0 }).length, 1);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('bản sao sâu, không chia sẻ tham chiếu', () => {
  const a = { x: { y: [1] } };
  const b = { z: { w: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.y.push(9);
  ops[1].value.w.push(9);
  assert.deepEqual(a, { x: { y: [1] } });
  assert.deepEqual(b, { z: { w: [2] } });
  const doc = { k: [1] };
  const out = applyDiff(doc, [{ op: 'replace', path: '/k', oldValue: [1], value: b }]);
  out.k.z.w.push(1);
  assert.deepEqual(b, { z: { w: [2] } });
  assert.deepEqual(doc, { k: [1] });
});

test('bất biến applyDiff(a, diff(a, b)) = b', () => {
  const vals = [
    null, 1, 'x', true, [], {}, [1, 2, 3], [3, 2], { a: 1 }, { a: [1, { b: null }], c: 'z' },
    { a: { b: [1, 5] }, 'x/y': 2, c: null }, { 'a~b': [[1], [2, 3]] }, [{ a: 1 }, { b: 2 }],
    { '': 1, '/': 2 },
  ];
  for (const a of vals) {
    for (const b of vals) {
      const snap = JSON.stringify(a);
      assert.deepEqual(applyDiff(a, diff(a, b)), b);
      assert.equal(JSON.stringify(a), snap);
    }
  }
});

test('applyDiff: lỗi và gốc', () => {
  const f = code('DIFF_APPLY_FAILED');
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'remove', path: '/b' }]), f);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'replace', path: '/b', value: 1 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'add', path: '/3', value: 1 }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'remove', path: '/1' }]), f);
  assert.throws(() => applyDiff([1], [{ op: 'replace', path: '/1', value: 1 }]), f);
  assert.throws(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 1 }]), f);
  assert.throws(() => applyDiff(1, [{ op: 'add', path: '/a', value: 1 }]), f);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', value: [5] }]), [5]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'add', path: '', value: 7 }]), 7);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: 'a', value: 7 }]), code('DIFF_BAD_POINTER'));
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: 1, c: 1 }, { a: 2, b: [1], c: undefined === 0 ? 0 : 1 });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = [1]');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText(diff({ a: 'x' }, {})), '- /a = "x"');
  assert.ok(!formatText(ops).endsWith('\n'));
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(diff({ a: 1, r: 1 }, { a: 2, n: 1 })), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
