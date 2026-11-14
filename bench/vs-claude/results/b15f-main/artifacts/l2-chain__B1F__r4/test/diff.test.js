import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const bad = (fn, code) => assert.throws(fn, (e) => e instanceof Error && e.code === code);

test('ví dụ diff mục 9', () => {
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

test('diff: bằng nhau → [], khác loại, gốc, null/mảng/đối tượng', () => {
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {}).length, 1);
  assert.equal(diff(null, 0).length, 1);
  assert.equal(diff('1', 1).length, 1);
  assert.equal(diff({ a: null }, { a: [] })[0].op, 'replace');
});

test('diff: thứ tự khóa sort() mặc định và mảng thừa', () => {
  const ops = diff({ b: 1, B: 1, a: 1 }, { b: 2, B: 2, a: 2 });
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/a', '/b']);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
});

test('diff: value/oldValue là bản sao sâu', () => {
  const a = { x: { k: [1] } };
  const b = { y: { k: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.k.push(9);
  ops[1].value.k.push(9);
  assert.deepEqual(a, { x: { k: [1] } });
  assert.deepEqual(b, { y: { k: [2] } });
});

test('bất biến applyDiff(a, diff(a,b)) = b', () => {
  const cases = [
    [{}, {}], [1, { a: 1 }], [{ a: [1, 2, 3, 4] }, { a: [1, 9] }],
    [{ a: [1] }, { a: [1, { z: null }, [2]] }], [[], [1, 2]], [[1, 2], []],
    [{ 'a/b': 1, 'c~d': { '': 2 } }, { 'a/b': 2, 'c~d': { '': 3, e: [] }, f: null }],
    [null, [null]], [{ a: { b: { c: 1 } } }, { a: 5 }],
  ];
  for (const [a, b] of cases) {
    const a0 = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), a0);
  }
});

test('escape / unescape / parse / format pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0//c'), ['a/b', '0', '', 'c']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
  assert.deepEqual(parsePointer(formatPointer(['~', '/', '~0'])), ['~', '/', '~0']);
});

test('escape sai → DIFF_BAD_POINTER', () => {
  bad(() => unescapePointer('a~'), 'DIFF_BAD_POINTER');
  bad(() => unescapePointer('~2'), 'DIFF_BAD_POINTER');
  bad(() => unescapePointer('~x'), 'DIFF_BAD_POINTER');
  bad(() => parsePointer('a/b'), 'DIFF_BAD_POINTER');
  bad(() => parsePointer('/a~'), 'DIFF_BAD_POINTER');
  bad(() => parsePointer('/a/~9'), 'DIFF_BAD_POINTER');
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  bad(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff({}, [{ op: 'remove', path: '/a', oldValue: 1 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff({}, [{ op: 'replace', path: '/a', oldValue: 1, value: 2 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff([1], [{ op: 'add', path: '/3', value: 2 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff([1], [{ op: 'remove', path: '/1', oldValue: 2 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff([1], [{ op: 'replace', path: '/x', oldValue: 1, value: 2 }]), 'DIFF_APPLY_FAILED');
  bad(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 2 }]), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 7 }]), 7);
});

test('sửa kết quả không làm đổi đầu vào', () => {
  const doc = { a: [1, { b: 2 }] };
  const ops = [{ op: 'add', path: '/c', value: { d: [1] } }];
  const out = applyDiff(doc, ops);
  out.a[1].b = 99;
  out.c.d.push(2);
  assert.deepEqual(doc, { a: [1, { b: 2 }] });
  assert.deepEqual(ops[0].value, { d: [1] });
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, b: 2, c: [1] }, { a: 'x', c: [1], d: { e: null } });
  assert.equal(formatText(ops), '~ /a: 1 -> "x"\n- /b = 2\n+ /d = {"e":null}');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([{ op: 'add', path: '', value: 1 }]), '+ (root) = 1');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
