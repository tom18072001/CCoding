import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const r = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(check(r.program), [], 'chương trình thử phải hợp lệ');
  return evaluate(r.program);
};
const keys = (o) => Object.keys(o);

test('evaluate: tệp rỗng cho đối tượng rỗng · evaluate: các kiểu giá trị vô hướng', () => {
  {
    assert.deepEqual(ev(''), {});
    assert.deepEqual(ev('# chú thích'), {});
  }
  {
    const r = ev('s = "chữ"\nn = -12.5\ne = 1e3\nt = true\nf = false\nz = null\ne1 = ""');
    assert.deepEqual(r, { s: 'chữ', n: -12.5, e: 1000, t: true, f: false, z: null, e1: '' });
  }
});

test('evaluate: -0 cho ra 0 (không phải -0) · evaluate: khối lồng nhau, khối rỗng, mảng lồng', () => {
  {
    assert.ok(Object.is(ev('a = -0').a, 0));
    assert.equal(ev('a = -0\nb = "${a}"').b, 0);
    assert.equal(ev('a = -0\nb = "x${a}"').b, 'x0');
  }
  {
    assert.deepEqual(ev('a { b { c = 1 } d {} }\nl = [1, [2, [3]], []]'), { a: { b: { c: 1 }, d: {} }, l: [1, [2, [3]], []] });
  }
});

test('evaluate: thứ tự khóa là thứ tự xuất hiện lần đầu; ghi đè không đổi vị trí', () => {
  const r = ev({ main: 'z = 1\ninclude "b"\ny = 2\na = 9', b: 'a = 0\nz = 5\nm = 0' });
  assert.deepEqual(keys(r), ['z', 'a', 'm', 'y']);
  assert.deepEqual(r, { z: 5, a: 9, m: 0, y: 2 });
});

test('evaluate: khóa bị thay bằng giá trị khác loại vẫn đứng chỗ cũ', () => {
  const r = ev({ main: 'include "b"\nx = 1\nq { n = 1 }', b: 'x { k = 1 }\nq = 2\nw = 3' });
  assert.deepEqual(keys(r), ['x', 'q', 'w']);
  assert.deepEqual(r, { x: 1, q: { n: 1 }, w: 3 });
});

test('evaluate: Block trộn sâu vào đối tượng đã có (qua include)', () => {
  const r = ev({ main: 'include "b"\ns { y = 2 t { n = 2 } }', b: 's { x = 1 t { m = 1 n = 0 } }' });
  assert.deepEqual(r, { s: { x: 1, t: { m: 1, n: 2 }, y: 2 } });
  assert.deepEqual(keys(r.s), ['x', 't', 'y']);
  assert.deepEqual(keys(r.s.t), ['m', 'n']);
});

test('evaluate: Assign ghi đè khối; Block thay vô hướng · evaluate: mảng không bao giờ được trộn, mảng sau thay hẳn mảng trước', () => {
  {
    assert.deepEqual(ev({ main: 'include "b"\ns = 5', b: 's { x = 1 }' }), { s: 5 });
    assert.deepEqual(ev({ main: 'include "b"\ns { y = 1 }', b: 's = 5' }), { s: { y: 1 } });
    assert.deepEqual(ev({ main: 'include "b"\ns { y = 1 }', b: 's = [1]' }), { s: { y: 1 } });
  }
  {
    assert.deepEqual(ev({ main: 'include "b"\nl = [3]', b: 'l = [1, 2]' }), { l: [3] });
    assert.deepEqual(ev({ main: 'include "b"\ns { l = [] }', b: 's { l = [1, 2] k = 1 }' }), { s: { l: [], k: 1 } });
  }
});

test('evaluate: include chèn tại đúng vị trí — khóa sau include ghi đè, khóa trước bị ghi đè', () => {
  const files = { main: 'a = "trước"\ninclude "i"\nb = "sau"', i: 'a = "i"\nb = "i"\nc = "i"' };
  assert.deepEqual(ev(files), { a: 'i', b: 'sau', c: 'i' });
});

test('evaluate: include sau ghi đè include trước; include lồng nhiều tầng', () => {
  const files = { main: 'include "a"\ninclude "b"', a: 'x = "a"\ny = "a"\ninclude "c"', b: 'x = "b"', c: 'x = "c"\nz = "c"' };
  assert.deepEqual(ev(files), { x: 'b', y: 'a', z: 'c' });
  assert.deepEqual(keys(ev(files)), ['x', 'y', 'z']);
});

test('evaluate: include trong khối đổ vào đúng khối đó', () => {
  const files = { main: 'a { include "i" own = 1 }\nb { include "i" }', i: 'k = 1\nown = 0' };
  assert.deepEqual(ev(files), { a: { k: 1, own: 1 }, b: { k: 1, own: 0 } });
});

test('evaluate: tệp được include hai lần (hình thoi) được xử lý mỗi lần include · evaluate: tên tệp include có thể có đường dẫn và ký tự lạ · evaluate: include rỗng không thêm gì', () => {
  {
    const files = { main: 'include "b"\ninclude "c"', b: 'include "d"\nx = 2', c: 'include "d"', d: 'x = 1' };
    assert.deepEqual(ev(files), { x: 1 });
    assert.deepEqual(ev({ main: 'include "b"\ninclude "c"', b: 'include "d"\nx = 2', c: 'y = 1', d: 'x = 1' }), { x: 2, y: 1 });
  }
  {
    assert.deepEqual(ev({ main: 'include "conf/base.cfg"\ninclude "đ.cfg"', 'conf/base.cfg': 'a = 1', 'đ.cfg': 'b = 2' }), { a: 1, b: 2 });
  }
  {
    assert.deepEqual(ev({ main: 'a = 1\ninclude "e"', e: '' }), { a: 1 });
  }
});

test('evaluate: nội suy trong chuỗi — kiểu chuỗi, số, bool, null', () => {
  const r = ev('s = "x"\nn = 1.50\nbig = 1e21\nneg = -2\nt = true\nf = false\nz = null\nm = "[${s}|${n}|${big}|${neg}|${t}|${f}|${z}]"');
  assert.equal(r.m, '[x|1.5|1e+21|-2|true|false|null]');
});

test('evaluate: số thập phân nhỏ và dài được định dạng như JSON.stringify', () => {
  const r = ev('a = 0.000001\nb = 1e-7\nc = 123456789012345680000\nd = 0.1\nm = "${a}/${b}/${c}/${d}"');
  assert.equal(r.m, '0.000001/1e-7/123456789012345680000/0.1');
});

test('evaluate: chuỗi thuần tham chiếu giữ nguyên kiểu gốc', () => {
  const r = ev('n = 5\nb = true\nz = null\ns = "ok"\nl = [1, "a"]\no { k = 1 }\nrn = "${n}"\nrb = "${b}"\nrz = "${z}"\nrs = "${s}"\nrl = "${l}"\nro = "${o}"');
  assert.deepEqual([r.rn, r.rb, r.rz, r.rs], [5, true, null, 'ok']);
  assert.deepEqual(r.rl, [1, 'a']);
  assert.deepEqual(r.ro, { k: 1 });
});

test('evaluate: chuỗi có Text hoặc nhiều Ref thì luôn là chuỗi', () => {
  const r = ev('n = 5\nm = 6\na = " ${n}"\nb = "${n}${m}"\nc = "${n}${n}"');
  assert.deepEqual([r.a, r.b, r.c], [' 5', '56', '55']);
});

test('evaluate: giá trị thuần tham chiếu không chia sẻ tham chiếu với đích', () => {
  const r = ev('l = [1, [2]]\no { k { z = 1 } }\na = "${l}"\nb = "${l}"\nc = "${o}"\nd = "${o}"');
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.l);
  assert.notEqual(r.a[1], r.l[1]);
  assert.notEqual(r.c, r.d);
  assert.notEqual(r.c.k, r.o.k);
  r.a[1].push(99);
  r.c.k.z = 2;
  assert.deepEqual(r.l, [1, [2]]);
  assert.deepEqual(r.b, [1, [2]]);
  assert.deepEqual(r.o, { k: { z: 1 } });
  assert.deepEqual(r.d, { k: { z: 1 } });
});

test('evaluate: nội suy lồng — chuỗi trỏ tới chuỗi có nội suy · evaluate: chuỗi thuần tham chiếu trỏ tới chuỗi thuần tham chiếu tới số', () => {
  {
    const r = ev('a = "A"\nb = "${a}B"\nc = "${b}C"\nd = "${c}D"\ne = "${d}"');
    assert.deepEqual([r.b, r.c, r.d, r.e], ['AB', 'ABC', 'ABCD', 'ABCD']);
  }
  {
    const r = ev('a = "${b}"\nb = "${c}"\nc = 42');
    assert.deepEqual(r, { a: 42, b: 42, c: 42 });
  }
});

test('evaluate: đối tượng được tham chiếu mà bên trong có nội suy cũng được đánh giá', () => {
  const r = ev('x = 5\no { n = "${x}" m = "v${x}" }\np = "${o}"');
  assert.deepEqual(r.p, { n: 5, m: 'v5' });
});

test('evaluate: nội suy trong phần tử mảng', () => {
  const r = ev('a = 1\nl = ["${a}", "x${a}", ["${a}"]]\nm = "${l.0}-${l.1}"');
  assert.deepEqual(r.l, [1, 'x1', [1]]);
  assert.equal(r.m, '1-x1');
});

test('evaluate: chỉ số mảng, đường dẫn qua khối và mảng lồng', () => {
  const r = ev('l = [10, [20, 30], []]\nc { d { e = "deep" } }\na = "${l.0}"\nb = "${l.1.1}"\nd = "${c.d.e}"\nf = "${l.1}"');
  assert.deepEqual([r.a, r.b, r.d], [10, 30, 'deep']);
  assert.deepEqual(r.f, [20, 30]);
});

test('evaluate: tham chiếu tới khóa khai báo muộn hơn và tham chiếu thấy giá trị cuối cùng', () => {
  const r = ev({ main: 'url = "http://${host}:${port}"\ninclude "b"\nhost = "main-host"', b: 'host = "b-host"\nport = 80' });
  assert.equal(r.url, 'http://main-host:80');
  assert.equal(ev('x = "${y}"\ny = 1\ny = 2'.replace('y = 2', '')).x, 1);
});

test('evaluate: tham chiếu trong tệp include thấy khóa của tệp chứa nó · evaluate: tham chiếu tới khóa nằm trong khối được trộn từ nhiều nơi', () => {
  {
    const r = ev({ main: 'include "b"\nhost = "H"', b: 'url = "http://${host}"\nhost = "other"' });
    assert.equal(r.url, 'http://H');
  }
  {
    const r = ev({ main: 'include "b"\ns { y = 2 }\nsum = "${s.x}+${s.y}"', b: 's { x = 1 }' });
    assert.equal(r.sum, '1+2');
  }
});

test('evaluate: khóa có dấu gạch ngang và gạch dưới trong đường dẫn', () => {
  const r = ev('my-key = 1\nblk-1 { in_ner = "z" }\na = "${my-key}${blk-1.in_ner}"');
  assert.equal(r.a, '1z');
});

test('evaluate: hằng không vào kết quả; dùng trong chuỗi, khối, mảng', () => {
  const r = ev('const region = "hn"\nconst port = 8080\nconst lst = [1, ["x"]]\nname = "app-${@region}"\np = "${@port}"\nblk { q = "${@port}!" }\nl = ["${@region}"]\nli = "${@lst.1.0}"\nlj = "${@lst.0}"');
  assert.deepEqual(r, { name: 'app-hn', p: 8080, blk: { q: '8080!' }, l: ['hn'], li: 'x', lj: 1 });
});

test('evaluate: hằng tham chiếu hằng khác (kể cả khai báo sau) · evaluate: hằng theo từng tệp — cùng tên khác giá trị, mỗi chuỗi dùng hằng của tệp chứa nó', () => {
  {
    const r = ev('const a = "${@b}-A"\nconst b = "B"\nx = "${@a}"');
    assert.equal(r.x, 'B-A');
  }
  {
    const files = { main: 'const c = "M"\nm = "${@c}"\ninclude "b"', b: 'const c = "B"\nb = "${@c}"' };
    assert.deepEqual(ev(files), { m: 'M', b: 'B' });
  }
});

test('evaluate: hằng thuần tham chiếu mảng cho bản sao độc lập', () => {
  const r = ev('const l = [1, 2]\na = "${@l}"\nb = "${@l}"');
  assert.deepEqual(r, { a: [1, 2], b: [1, 2] });
  assert.notEqual(r.a, r.b);
});

test('evaluate: escape trong chuỗi; \\${ không phải nội suy', () => {
  const r = ev('a = "d1\\nd2\\t\\u00e9\\\\"\nb = "\\${a}"\nc = "$ $x"\nd = "\\${a}${a}"');
  assert.equal(r.a, 'd1\nd2\té\\');
  assert.equal(r.b, '${a}');
  assert.equal(r.c, '$ $x');
  assert.equal(r.d, '${a}d1\nd2\té\\');
});

test('evaluate: kết quả là JSON thuần — đối tượng thường, không undefined, khóa lạ như constructor và __proto__', () => {
  const r = ev('constructor = 1\ntoString = "t"\n__proto__ = 7\nblk { hasOwnProperty = null }\nref = "${toString}"');
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.ok(Object.hasOwn(r, 'constructor'));
  assert.ok(Object.hasOwn(r, '__proto__'));
  assert.equal(r.ref, 't');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  assert.deepEqual(Object.keys(r), ['constructor', 'toString', '__proto__', 'blk', 'ref']);
});

test('evaluate: ví dụ trong SPEC (include và ghi đè) · evaluate: ví dụ trong SPEC (const, nội suy, mảng)', () => {
  {
    const files = { main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' };
    const r = ev(files);
    assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
    assert.deepEqual(keys(r), ['server', 'mode']);
  }
  {
    const r = ev('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }');
    assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  }
});

test('evaluate: không làm thay đổi program đầu vào và cho kết quả như nhau khi gọi lại', () => {
  const p = parseProject({ main: 'const c = 1\ninclude "b"\nx = "${@c}${y}"\nl = [1]\nz = "${l}"', b: 'y = 2' }, 'main').program;
  const before = structuredClone(p);
  const r1 = evaluate(p);
  const r2 = evaluate(p);
  assert.deepEqual(p, before);
  assert.deepEqual(r1, r2);
  assert.deepEqual(keys(r1), keys(r2));
});

test('evaluate: chuỗi tham chiếu dài 300 bước và 2000 khóa chạy được', () => {
  const lines = [];
  for (let i = 0; i < 300; i++) lines.push(`k${i} = "\${k${i + 1}}"`);
  lines.push('k300 = 7');
  for (let i = 0; i < 2000; i++) lines.push(`w${i} = ${i}`);
  const r = ev(lines.join('\n'));
  assert.equal(r.k0, 7);
  assert.equal(keys(r).length, 2301);
});
