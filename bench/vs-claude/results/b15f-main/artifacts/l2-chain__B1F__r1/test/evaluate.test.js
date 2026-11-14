import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { merge, resolveRef } from '../src/merge.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return evaluate(r.program);
}
const keys = (o) => Object.keys(o);

test('ví dụ mục 9 (đã bỏ dấu phẩy thừa)', () => {
  const out = ev({ main: `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }
` });
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè (mục 9), thứ tự khóa', () => {
  const out = ev({
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(keys(out), ['server', 'mode']);
});

test('khóa khai báo sau include ghi đè; include sau ghi đè include trước', () => {
  const out = ev({
    a: 'x = 1\ny = 1\n', b: 'x = 2\n',
    main: 'include "a"\ninclude "b"\ny = 3\n',
  });
  assert.deepEqual(out, { x: 2, y: 3 });
});

test('include trong khối đi vào khối hiện hành', () => {
  const out = ev({ inc: 'p = 1\n', main: 'blk { include "inc"\n q = 2 }\n' });
  assert.deepEqual(out, { blk: { p: 1, q: 2 } });
});

test('khóa khai báo muộn và bị include ghi đè: tham chiếu thấy giá trị cuối', () => {
  const out = ev({
    inc: 'late = "override"\n',
    main: 'a = "${late}"\ninclude "inc"\nlate = "final"\nb = "${late}"\n',
  });
  assert.equal(out.a, 'final');
  assert.equal(out.b, 'final');
});

test('const không vào kết quả; ${@lst.1} chỉ vào mảng hằng; hằng theo tệp', () => {
  const out = ev({
    inc: 'const c = "inc"\nv = "${@c}"\n',
    main: 'const lst = [10, 20]\nconst c = "main"\nx = "${@lst.1}"\ny = "${@c}"\ninclude "inc"\n',
  });
  assert.deepEqual(out, { x: 20, y: 'main', v: 'inc' });
});

test('null là đích tồn tại; nối thành "null"', () => {
  const out = ev({ main: 'a = null\nb = "${a}"\nc = "v=${a}"\n' });
  assert.deepEqual(out, { a: null, b: null, c: 'v=null' });
});

test('hai ${x} cho hai mảng khác nhau, không chia sẻ tham chiếu', () => {
  const out = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"\n' });
  assert.deepEqual(out.a, [1, [2]]);
  assert.notEqual(out.a, out.b);
  assert.notEqual(out.a, out.x);
  assert.notEqual(out.a[1], out.b[1]);
  out.a[1].push(9);
  assert.deepEqual(out.b, [1, [2]]);
});

test('thứ tự khóa: ghi đè giữ vị trí cũ, kể cả đổi loại', () => {
  const out = ev({ main: 'a = 1\nb = 2\nc = 3\na { z = 1 }\nb = [1]\n' });
  assert.deepEqual(keys(out), ['a', 'b', 'c']);
  assert.deepEqual(out.a, { z: 1 });
});

test('Block thay giá trị không phải đối tượng; Assign thay Block; mảng không trộn', () => {
  const out = ev({ main: 'a = 1\na { k = 1 }\nb { k = 1 }\nb = 5\nl = [1,2]\nl = [3]\n' });
  assert.deepEqual(out, { a: { k: 1 }, b: 5, l: [3] });
});

test('kiểu giữ nguyên với chuỗi thuần ref; nối số dùng JSON.stringify', () => {
  const out = ev({ main: 'n = 1.50\nbig = 1e21\ns = "${n}"\nt = "a${n}-${big}-${flag}"\nflag = true\ne = ""\n' });
  assert.equal(out.s, 1.5);
  assert.equal(out.t, 'a1.5-1e+21-true');
  assert.equal(out.e, '');
});

test('đánh giá đệ quy / lồng, ref tới đối tượng', () => {
  const out = ev({ main: 'a = "${b}"\nb = "${c}-x"\nc = "z"\nobj { k = "${c}" }\ncopy = "${obj}"\n' });
  assert.equal(out.a, 'z-x');
  assert.deepEqual(out.copy, { k: 'z' });
});

test('resolveRef: không đi xuyên chuỗi, chỉ số 01 không hợp lệ, khóa riêng', () => {
  const r = parseProject({ main: 's = "${t}"\nt = "q"\nl = [1,2]\nobj { a = 1 }\n' }, 'main');
  const ctx = merge(r.program);
  const R = (path, c = false) => resolveRef(ctx, { path, const: c }, 'main').found;
  assert.equal(R(['s', 'x']), false);
  assert.equal(R(['l', '01']), false);
  assert.equal(R(['l', '1']), true);
  assert.equal(R(['l', '2']), false);
  assert.equal(R(['obj', 'a', 'b']), false);
  assert.equal(R(['obj', 'toString']), false);
  assert.equal(R(['nope', 'x'], true), false);
});

test('chương trình chưa check không treo: vòng ném EVAL_CYCLE', () => {
  const r = parseProject({ main: 'a = "${b}"\nb = "${a}"\n' }, 'main');
  assert.throws(() => evaluate(r.program), { code: 'EVAL_CYCLE' });
  const r2 = parseProject({ main: 'x { y = "${x}" }\n' }, 'main');
  assert.throws(() => evaluate(r2.program), { code: 'EVAL_CYCLE' });
});

test('include vòng không treo khi chưa check', () => {
  const r = parseProject({ main: 'include "main"\na = 1\n' }, 'main');
  assert.deepEqual(evaluate(r.program), { a: 1 });
});
