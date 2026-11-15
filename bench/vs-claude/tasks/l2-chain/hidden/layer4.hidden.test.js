import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return 'KHÔNG_NÉM';
};

test('escapePointer: ~ trước rồi /  · escapePointer: nhận số', () => {
  {
    assert.equal(escapePointer('abc'), 'abc');
    assert.equal(escapePointer('a/b'), 'a~1b');
    assert.equal(escapePointer('a~b'), 'a~0b');
    assert.equal(escapePointer('~/'), '~0~1');
    assert.equal(escapePointer('~1'), '~01');
    assert.equal(escapePointer('//'), '~1~1');
    assert.equal(escapePointer(''), '');
  }
  {
    assert.equal(escapePointer(12), '12');
    assert.equal(escapePointer(0), '0');
  }
});

test('unescapePointer: ~1 trước rồi ~0 · unescapePointer: escape sai ném DIFF_BAD_POINTER', () => {
  {
    assert.equal(unescapePointer('a~1b'), 'a/b');
    assert.equal(unescapePointer('a~0b'), 'a~b');
    assert.equal(unescapePointer('~01'), '~1');
    assert.equal(unescapePointer('~0~1'), '~/');
    assert.equal(unescapePointer(''), '');
    assert.equal(unescapePointer('~00'), '~0');
  }
  {
    for (const s of ['~', 'a~', '~2', '~a', 'x~~', '~0~', '~ 0']) assert.equal(code(() => unescapePointer(s)), 'DIFF_BAD_POINTER', s);
  }
});

test('escape/unescape là nghịch đảo của nhau', () => {
  for (const s of ['', 'a', '~', '/', '~/~', '~0', '~1', '/~0/~1~', 'a b/c~d']) assert.equal(unescapePointer(escapePointer(s)), s);
});

test('parsePointer: rỗng, gốc, nhiều đoạn, escape · parsePointer: lỗi', () => {
  {
    assert.deepEqual(parsePointer(''), []);
    assert.deepEqual(parsePointer('/'), ['']);
    assert.deepEqual(parsePointer('/a/b/0'), ['a', 'b', '0']);
    assert.deepEqual(parsePointer('/a~1b/~0'), ['a/b', '~']);
    assert.deepEqual(parsePointer('//'), ['', '']);
    assert.deepEqual(parsePointer('/a//b'), ['a', '', 'b']);
  }
  {
    for (const p of ['a', 'a/b', ' /a', '/a~', '/a/~2', '#/a']) assert.equal(code(() => parsePointer(p)), 'DIFF_BAD_POINTER', p);
  }
});

test('formatPointer: nối các đoạn có escape; số được chấp nhận; đảo ngược parsePointer', () => {
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'b/c', '~']), '/a/b~1c/~0');
  assert.equal(formatPointer(['a', 0, 12]), '/a/0/12');
  assert.equal(formatPointer(['']), '/');
  for (const p of ['', '/', '/a/b', '/a~1b/~0/', '//x']) assert.equal(formatPointer(parsePointer(p)), p);
});

test('diff: hai giá trị bằng nhau cho mảng rỗng', () => {
  assert.deepEqual(diff({}, {}), []);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff('a', 'a'), []);
  assert.deepEqual(diff(null, null), []);
  assert.deepEqual(diff([1, { a: [null] }], [1, { a: [null] }]), []);
  assert.deepEqual(diff({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
});

test('diff: gốc vô hướng khác nhau → replace tại path rỗng', () => {
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepEqual(diff('a', 'b'), [{ op: 'replace', path: '', oldValue: 'a', value: 'b' }]);
  assert.deepEqual(diff(true, false), [{ op: 'replace', path: '', oldValue: true, value: false }]);
});

test('diff: khác loại → replace nguyên giá trị (null, mảng, đối tượng, vô hướng là loại riêng)', () => {
  assert.deepEqual(diff({ a: 1 }, { a: '1' }), [{ op: 'replace', path: '/a', oldValue: 1, value: '1' }]);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: {} }, { a: null }), [{ op: 'replace', path: '/a', oldValue: {}, value: null }]);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff({ a: {} }, { a: [] }), [{ op: 'replace', path: '/a', oldValue: {}, value: [] }]);
  assert.deepEqual(diff({ a: [1] }, { a: null }), [{ op: 'replace', path: '/a', oldValue: [1], value: null }]);
  assert.deepEqual(diff([], null), [{ op: 'replace', path: '', oldValue: [], value: null }]);
  assert.deepEqual(diff({ a: 0 }, { a: false }), [{ op: 'replace', path: '/a', oldValue: 0, value: false }]);
});

test('diff: add và remove đối tượng, giá trị null cũng là giá trị', () => {
  assert.deepEqual(diff({}, { a: null }), [{ op: 'add', path: '/a', value: null }]);
  assert.deepEqual(diff({ a: null }, {}), [{ op: 'remove', path: '/a', oldValue: null }]);
  assert.deepEqual(diff({ a: 1 }, { b: 2 }), [
    { op: 'remove', path: '/a', oldValue: 1 },
    { op: 'add', path: '/b', value: 2 },
  ]);
});

test('diff: thao tác có đúng các khóa theo đúng thứ tự khóa', () => {
  const ops = diff({ a: 1, b: 1, c: 1 }, { a: 2, c: 1, d: 1 });
  const byOp = Object.fromEntries(ops.map((o) => [o.op, Object.keys(o)]));
  assert.deepEqual(byOp.replace, ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(byOp.remove, ['op', 'path', 'oldValue']);
  assert.deepEqual(byOp.add, ['op', 'path', 'value']);
});

test('diff: khóa sắp tăng dần theo UTF-16, độc lập với thứ tự chèn', () => {
  const a = { b: 1, a: 1, B: 1, '10': 1, '2': 1, é: 1, z: 1 };
  const b = {};
  const ops = diff(a, b);
  assert.deepEqual(ops.map((o) => o.path), ['/10', '/2', '/B', '/a', '/b', '/z', '/é']);
  assert.deepEqual(diff({}, a).map((o) => o.path), ['/10', '/2', '/B', '/a', '/b', '/z', '/é']);
});

test('diff: đệ quy vào đối tượng lồng nhau, xuất theo thứ tự duyệt (không sắp lại toàn cục)', () => {
  const a = { z: { y: 1, b: 1 }, a: { n: { m: 1 } } };
  const b = { z: { y: 2, c: 1 }, a: { n: { m: 2, k: 0 } } };
  assert.deepEqual(diff(a, b), [
    { op: 'add', path: '/a/n/k', value: 0 },
    { op: 'replace', path: '/a/n/m', oldValue: 1, value: 2 },
    { op: 'remove', path: '/z/b', oldValue: 1 },
    { op: 'add', path: '/z/c', value: 1 },
    { op: 'replace', path: '/z/y', oldValue: 1, value: 2 },
  ]);
});

test('diff: path thoát ~ và /, khóa rỗng, khóa số', () => {
  assert.deepEqual(diff({ 'a/b': 1, 'c~d': 1, '': 1, '0': 1 }, { 'a/b': 2, 'c~d': 2, '': 2, '0': 2 }).map((o) => o.path), ['/', '/0', '/a~1b', '/c~0d']);
});

test('diff: mảng so theo chỉ số, thay phần tử khác nhau', () => {
  assert.deepEqual(diff([1, 2, 3], [1, 5, 3]), [{ op: 'replace', path: '/1', oldValue: 2, value: 5 }]);
  assert.deepEqual(diff({ a: [{ x: 1 }, { x: 2 }] }, { a: [{ x: 1 }, { x: 3 }] }), [{ op: 'replace', path: '/a/1/x', oldValue: 2, value: 3 }]);
});

test('diff: mảng dài hơn → add chỉ số tăng dần; ngắn hơn → remove chỉ số giảm dần', () => {
  assert.deepEqual(diff({ a: [1] }, { a: [1, 2, 3] }), [
    { op: 'add', path: '/a/1', value: 2 },
    { op: 'add', path: '/a/2', value: 3 },
  ]);
  assert.deepEqual(diff({ a: [1, 2, 3, 4] }, { a: [1] }), [
    { op: 'remove', path: '/a/3', oldValue: 4 },
    { op: 'remove', path: '/a/2', oldValue: 3 },
    { op: 'remove', path: '/a/1', oldValue: 2 },
  ]);
  assert.deepEqual(diff([], [7]), [{ op: 'add', path: '/0', value: 7 }]);
  assert.deepEqual(diff([7], []), [{ op: 'remove', path: '/0', oldValue: 7 }]);
});

test('diff: mảng — phần tử chung được so trước, rồi mới tới phần thêm/xóa', () => {
  assert.deepEqual(diff([1, 2, 3], [9]), [
    { op: 'replace', path: '/0', oldValue: 1, value: 9 },
    { op: 'remove', path: '/2', oldValue: 3 },
    { op: 'remove', path: '/1', oldValue: 2 },
  ]);
});

test('diff: mảng lồng mảng và phần tử là đối tượng được thêm nguyên khối', () => {
  assert.deepEqual(diff([[1, 2]], [[1, 3], { k: [1] }]), [
    { op: 'replace', path: '/0/1', oldValue: 2, value: 3 },
    { op: 'add', path: '/1', value: { k: [1] } },
  ]);
});

test('diff: value/oldValue là bản sao sâu · diff: không đổi đầu vào', () => {
  {
    const a = { gone: { deep: [1, { z: 2 }] }, same: 1 };
    const b = { added: { deep: [1, { z: 2 }] }, same: 1 };
    const ops = diff(a, b);
    const removed = ops.find((o) => o.op === 'remove');
    const added = ops.find((o) => o.op === 'add');
    assert.notEqual(removed.oldValue, a.gone);
    assert.notEqual(removed.oldValue.deep[1], a.gone.deep[1]);
    assert.notEqual(added.value, b.added);
    assert.notEqual(added.value.deep[1], b.added.deep[1]);
    added.value.deep[1].z = 99;
    removed.oldValue.deep.push(5);
    assert.equal(b.added.deep[1].z, 2);
    assert.equal(a.gone.deep.length, 2);
  }
  {
    const a = { k: [1, { m: 1 }], z: 1 };
    const b = { k: [2], y: { n: 1 } };
    const ca = structuredClone(a);
    const cb = structuredClone(b);
    diff(a, b);
    assert.deepEqual(a, ca);
    assert.deepEqual(b, cb);
  }
});

test('diff: ví dụ trong SPEC', () => {
  assert.deepEqual(diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }), [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
});

test('applyDiff: bất biến applyDiff(a, diff(a, b)) bằng sâu b', () => {
  const pairs = [
    [{ a: 1 }, { a: 2, b: [1, { c: null }] }],
    [{ a: [1, 2, 3, 4], b: { c: 1 } }, { a: [1], b: 5 }],
    [[1, 2], [1, 2, { x: [] }, 4]],
    [{ 'a/b': { '~': 1 } }, { 'a/b': { '~': 2, '/': 3 } }],
    [1, { a: 1 }],
    [{ a: 1 }, [1, 2]],
    [null, null],
    [{ k: [[1], [2, 3]] }, { k: [[1, 9], []] }],
  ];
  for (const [a, b] of pairs) assert.deepEqual(applyDiff(a, diff(a, b)), b, JSON.stringify([a, b]));
});

test('applyDiff: không đổi doc đầu vào; ops được sao sâu vào kết quả', () => {
  const doc = { a: [1, 2], b: { c: 1 } };
  const copy = structuredClone(doc);
  const ops = [{ op: 'add', path: '/n', value: { x: [1] } }, { op: 'replace', path: '/a/0', oldValue: 1, value: 9 }];
  const out = applyDiff(doc, ops);
  assert.deepEqual(doc, copy);
  assert.notEqual(out, doc);
  assert.notEqual(out.b, doc.b);
  out.n.x.push(2);
  assert.deepEqual(ops[0].value, { x: [1] });
  assert.deepEqual(out.a, [9, 2]);
});

test('applyDiff: add vào mảng chèn tại chỉ số; chỉ số bằng độ dài là nối đuôi', () => {
  assert.deepEqual(applyDiff({ a: [1, 3] }, [{ op: 'add', path: '/a/1', value: 2 }]), { a: [1, 2, 3] });
  assert.deepEqual(applyDiff({ a: [1] }, [{ op: 'add', path: '/a/1', value: 2 }]), { a: [1, 2] });
  assert.deepEqual(applyDiff({ a: [] }, [{ op: 'add', path: '/a/0', value: 0 }]), { a: [0] });
  assert.equal(code(() => applyDiff({ a: [1] }, [{ op: 'add', path: '/a/3', value: 2 }])), 'DIFF_APPLY_FAILED');
});

test('applyDiff: áp lần lượt các thao tác theo thứ tự', () => {
  const ops = [
    { op: 'remove', path: '/a/2' },
    { op: 'remove', path: '/a/0' },
    { op: 'add', path: '/a/0', value: 'x' },
    { op: 'replace', path: '/b', value: 1 },
  ];
  assert.deepEqual(applyDiff({ a: [1, 2, 3], b: 0 }, ops), { a: ['x', 2], b: 1 });
});

test('applyDiff: path rỗng thay cả gốc (replace và add)', () => {
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', value: [1] }]), [1]);
  assert.equal(applyDiff(1, [{ op: 'add', path: '', value: 'z' }]), 'z');
});

test('applyDiff: lỗi áp dụng → DIFF_APPLY_FAILED', () => {
  const bad = [
    [{ a: 1 }, { op: 'add', path: '/a', value: 2 }],
    [{ a: 1 }, { op: 'remove', path: '/b' }],
    [{ a: 1 }, { op: 'replace', path: '/b', value: 1 }],
    [{ a: [1] }, { op: 'remove', path: '/a/1' }],
    [{ a: [1] }, { op: 'replace', path: '/a/5', value: 1 }],
    [{ a: 1 }, { op: 'add', path: '/x/y', value: 1 }],
    [{ a: 1 }, { op: 'replace', path: '/a/b', value: 1 }],
    [{ a: null }, { op: 'add', path: '/a/b', value: 1 }],
  ];
  for (const [doc, op] of bad) assert.equal(code(() => applyDiff(doc, [op])), 'DIFF_APPLY_FAILED', JSON.stringify(op));
});

test('formatText: mỗi thao tác một dòng, không có \\n cuối', () => {
  const ops = [
    { op: 'replace', path: '/a/b', oldValue: 1, value: 'x y' },
    { op: 'remove', path: '/c', oldValue: [1, { z: null }] },
    { op: 'add', path: '/d~1e', value: { k: true } },
  ];
  assert.equal(formatText(ops), '~ /a/b: 1 -> "x y"\n- /c = [1,{"z":null}]\n+ /d~1e = {"k":true}');
});

test('formatText: path rỗng hiển thị (root); không thay đổi', () => {
  assert.equal(formatText([{ op: 'replace', path: '', oldValue: null, value: [] }]), '~ (root): null -> []');
  assert.equal(formatText([{ op: 'add', path: '', value: 1 }]), '+ (root) = 1');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff({ a: [1] }, { a: [1] })), 'Không có thay đổi');
});

test('formatText: ví dụ ghép từ diff, giá trị chuỗi có ký tự đặc biệt dùng JSON', () => {
  const t = formatText(diff({ s: 'a' }, { s: 'dòng "1"\nđ', t: 0.5 }));
  assert.equal(t, '~ /s: "a" -> "dòng \\"1\\"\\nđ"\n+ /t = 0.5');
  assert.equal(t.endsWith('\n'), false);
});

test('formatJson: thụt 2 khoảng trắng, rỗng là [] · summarize: đếm theo loại thao tác', () => {
  {
    assert.equal(formatJson([]), '[]');
    const ops = diff({ a: 1 }, { a: 2 });
    assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
    assert.equal(formatJson(ops), '[\n  {\n    "op": "replace",\n    "path": "/a",\n    "oldValue": 1,\n    "value": 2\n  }\n]');
    assert.deepEqual(JSON.parse(formatJson(diff({ a: [1] }, { b: null }))), diff({ a: [1] }, { b: null }));
  }
  {
    assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
    const ops = diff({ a: 1, b: 2, c: [1, 2, 3] }, { a: 2, d: 1, e: 1, c: [1] });
    assert.deepEqual(summarize(ops), { add: 2, remove: 3, replace: 1 });
    assert.deepEqual(Object.keys(summarize(ops)), ['add', 'remove', 'replace']);
  }
});

test('diff: kết quả ổn định khi gọi lại và với khóa chèn theo thứ tự khác', () => {
  const a = { q: 1, w: { e: 1, r: 2 }, t: [1] };
  const b = { t: [1, 2], w: { r: 3, e: 1 }, y: 1 };
  assert.deepEqual(diff(a, b), diff(a, b));
  const shuffled = { y: 1, t: [1, 2], w: { e: 1, r: 3 } };
  assert.deepEqual(diff(a, shuffled), diff(a, b));
});
