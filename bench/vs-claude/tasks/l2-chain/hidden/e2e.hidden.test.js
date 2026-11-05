import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, parseProject, check, evaluate, diff, applyDiff, formatText, formatJson, summarize, parsePointer } from '../src/index.js';

const BASE = [
  '# cấu hình nền',
  'const region = "hn"',
  'const ports = [80, 443]',
  'name = "app-${@region}"',
  'server {',
  '  host = "0.0.0.0"',
  '  port = "${@ports.0}"',
  '  url = "http://${server.host}:${server.port}"',
  '}',
  'tags = ["${@region}", "prod"]',
  'debug = false',
].join('\n');

test('index xuất lại đủ API công khai của bốn tầng', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: cấu hình đơn giản', () => {
  assert.deepEqual(compile({ main: 'x = 1' }, 'main'), { ok: true, config: { x: 1 } });
  assert.deepEqual(compile({ main: '' }, 'main'), { ok: true, config: {} });
});

test('compile: cấu hình nền đầy đủ cho kết quả đúng và đúng thứ tự khóa', () => {
  const r = compile({ main: BASE }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, {
    name: 'app-hn',
    server: { host: '0.0.0.0', port: 80, url: 'http://0.0.0.0:80' },
    tags: ['hn', 'prod'],
    debug: false,
  });
  assert.deepEqual(Object.keys(r.config), ['name', 'server', 'tags', 'debug']);
});

test('compile: lỗi tầng 1 → stage parse, errors có đúng một lỗi kèm file', () => {
  const r = compile({ main: 'a = 1\nb = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].code, r.errors[0].file, r.errors[0].line, r.errors[0].column], ['PARSE_UNEXPECTED_EOF', 'main', 2, 5]);
});

test('compile: lỗi lexer trong tệp include → stage parse với tên tệp include', () => {
  const r = compile({ main: 'include "sub"', sub: 'x = "chưa đóng' }, 'main');
  assert.deepEqual([r.ok, r.stage, r.errors[0].code, r.errors[0].file, r.errors[0].line, r.errors[0].column], [false, 'parse', 'LEX_UNTERMINATED_STRING', 'sub', 1, 5]);
});

test('compile: entry không có → stage parse, PARSE_ENTRY_NOT_FOUND', () => {
  const r = compile({ a: '' }, 'main');
  assert.deepEqual([r.ok, r.stage, r.errors[0].code], [false, 'parse', 'PARSE_ENTRY_NOT_FOUND']);
});

test('compile: lỗi tầng 2 → stage check, errors đúng bằng mảng check trả về', () => {
  const files = { main: 'a = 1\na = 2\ninclude "none"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors, check(parseProject(files, 'main').program));
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_DUPLICATE_KEY', 'SEM_INCLUDE_NOT_FOUND']);
});

test('compile: lỗi lược đồ → stage check; thỏa lược đồ → ok', () => {
  const schema = { type: 'object', closed: true, fields: { name: { type: 'string', required: true }, server: { type: 'object', fields: { port: { type: 'integer' } } } } };
  const bad = compile({ main: BASE }, 'main', schema);
  assert.equal(bad.stage, 'check');
  assert.deepEqual(bad.errors.map((e) => [e.code, e.line]), [['SEM_UNKNOWN_KEY', 10], ['SEM_UNKNOWN_KEY', 11]]);
  const good = compile({ main: 'name = "x"\nserver { port = 1 }' }, 'main', schema);
  assert.deepEqual(good, { ok: true, config: { name: 'x', server: { port: 1 } } });
});

test('compile: không có schema thì không chạy pha C', () => {
  assert.equal(compile({ main: 'a = 1' }, 'main').ok, true);
  assert.equal(compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'string' } } }).ok, false);
});

test('compile: ví dụ trong SPEC — lỗi dấu phẩy thừa rồi sửa', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi';
  const bad = compile({ main: src }, 'main');
  assert.deepEqual([bad.stage, bad.errors[0].code, bad.errors[0].line, bad.errors[0].column], ['parse', 'PARSE_UNEXPECTED_TOKEN', 5, 29]);
  const good = compile({ main: src.replace(' ,', '') }, 'main');
  assert.deepEqual(good.config, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('compile: nhiều tệp, ghi đè theo thứ tự include, hằng riêng từng tệp', () => {
  const files = {
    main: 'const t = "M"\ninclude "base"\ninclude "prod"\nowner = "${@t}"\nserver { port = 9000 }',
    base: 'const t = "B"\nserver { host = "h" port = 80 }\nenv = "dev"\nlabel = "${@t}-${env}"',
    prod: 'env = "prod"\nserver { tls = true }',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r.config, { server: { host: 'h', port: 9000, tls: true }, env: 'prod', label: 'B-prod', owner: 'M' });
  assert.deepEqual(Object.keys(r.config), ['server', 'env', 'label', 'owner']);
});

test('compile: vòng include → stage check, SEM_INCLUDE_CYCLE', () => {
  const r = compile({ main: 'include "a"', a: 'include "b"', b: 'include "a"' }, 'main');
  assert.deepEqual([r.stage, r.errors.map((e) => [e.code, e.file])], ['check', [['SEM_INCLUDE_CYCLE', 'b']]]);
});

test('compile: lỗi tầng sau không được báo khi tầng trước lỗi (parse trước check; pha A trước pha B)', () => {
  assert.equal(compile({ main: 'a = "${zz}"\nb = = 1' }, 'main').stage, 'parse');
  const r = compile({ main: 'a = "${zz}"\na = 1' }, 'main');
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_DUPLICATE_KEY']);
});

test('compile: chuỗi tham chiếu vòng và nội suy sai bị chặn trước khi đánh giá', () => {
  assert.deepEqual(compile({ main: 'a = "${b}"\nb = "${a}"' }, 'main').errors.map((e) => e.code), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
  assert.deepEqual(compile({ main: 'l = [1]\ns = "x${l}"' }, 'main').errors.map((e) => e.code), ['SEM_BAD_INTERPOLATION']);
});

test('compile: kết quả khớp với việc gọi riêng từng tầng', () => {
  const files = { main: BASE };
  const p = parseProject(files, 'main').program;
  assert.deepEqual(check(p), []);
  assert.deepEqual(compile(files, 'main').config, evaluate(p));
});

test('compile → diff: so hai môi trường và định dạng văn bản', () => {
  const files = {
    base: 'name = "svc"\nreplicas = 2\nlimits { cpu = 1 mem = "1g" }\nfeatures = ["a", "b"]',
    dev: 'include "base"\nreplicas = 1',
    prod: 'include "base"\nreplicas = 5\nlimits { cpu = 4 }\nfeatures = ["a", "b", "c"]\nregion = "hn"',
  };
  const dev = compile(files, 'dev').config;
  const prod = compile(files, 'prod').config;
  const ops = diff(dev, prod);
  assert.deepEqual(ops.map((o) => `${o.op} ${o.path}`), ['add /features/2', 'replace /limits/cpu', 'add /region', 'replace /replicas']);
  assert.equal(formatText(ops), '+ /features/2 = "c"\n~ /limits/cpu: 1 -> 4\n+ /region = "hn"\n~ /replicas: 1 -> 5');
  assert.deepEqual(summarize(ops), { add: 2, remove: 0, replace: 2 });
  assert.deepEqual(applyDiff(dev, ops), prod);
  assert.deepEqual(applyDiff(prod, diff(prod, dev)), dev);
});

test('compile → diff → formatJson cho kết quả JSON đọc lại được', () => {
  const a = compile({ main: 'x { y = [1, 2] }\nz = null' }, 'main').config;
  const b = compile({ main: 'x { y = [1] }\nw = true' }, 'main').config;
  const ops = diff(a, b);
  assert.deepEqual(JSON.parse(formatJson(ops)), ops);
  assert.deepEqual(ops, [
    { op: 'add', path: '/w', value: true },
    { op: 'remove', path: '/x/y/1', oldValue: 2 },
    { op: 'remove', path: '/z', oldValue: null },
  ]);
});

test('diff trên cấu hình có khóa chứa / và ~ lấy từ cfg; con trỏ phân giải ngược về giá trị', () => {
  // khóa cfg chỉ gồm [A-Za-z0-9_-], nên thử với JSON thật từ evaluate + khóa thủ công
  const a = { ...compile({ main: 'a { b = 1 }' }, 'main').config, 'x/y': { '~': 1 } };
  const b = { ...compile({ main: 'a { b = 2 }' }, 'main').config, 'x/y': { '~': 2 } };
  const ops = diff(a, b);
  assert.deepEqual(ops.map((o) => o.path), ['/a/b', '/x~1y/~0']);
  for (const o of ops) {
    let cur = a;
    for (const seg of parsePointer(o.path)) cur = cur[seg];
    assert.equal(cur, o.oldValue);
  }
});

test('đầu cuối: cấu hình lớn nhiều tầng include, 3 tệp, kiểm lược đồ rồi diff với bản đã chỉnh', () => {
  const files = {
    main: 'include "defaults.cfg"\ninclude "env/prod.cfg"\nservice { name = "${@svc}-${service.region}" }\nconst svc = "api"',
    'defaults.cfg': 'service { region = "hn" replicas = 2 ports = [80] }\nlogging { level = "info" sinks = ["stdout"] }',
    'env/prod.cfg': 'service { replicas = 6 ports = [80, 443] }\nlogging { level = "warn" }',
  };
  const schema = {
    type: 'object', closed: true,
    fields: {
      service: { type: 'object', required: true, fields: { name: { type: 'string' }, region: { enum: ['hn', 'sg'] }, replicas: { type: 'integer' }, ports: { type: 'array', items: { type: 'integer' } } } },
      logging: { type: 'object', fields: { level: { enum: ['info', 'warn'] }, sinks: { type: 'array', items: { type: 'string' } } } },
    },
  };
  const r = compile(files, 'main', schema);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.config, {
    service: { region: 'hn', replicas: 6, ports: [80, 443], name: 'api-hn' },
    logging: { level: 'warn', sinks: ['stdout'] },
  });
  const changed = compile({ ...files, 'env/prod.cfg': 'service { replicas = 3 }\nlogging { level = "debug" }' }, 'main', schema);
  assert.equal(changed.ok, false);
  assert.deepEqual(changed.errors.map((e) => [e.code, e.file, e.line, e.column]), [['SEM_NOT_IN_ENUM', 'env/prod.cfg', 2, 19]]);
});

test('đầu cuối: vị trí lỗi tính theo UTF-16 và CRLF xuyên suốt đường ống', () => {
  const r = compile({ main: 'ten = "Đà Nẵng 😀"\r\nx = "${y}"\r\n' }, 'main');
  assert.deepEqual([r.stage, r.errors[0].code, r.errors[0].line, r.errors[0].column], ['check', 'SEM_UNDEFINED_REF', 2, 6]);
  const p = compile({ main: '﻿a = "😀" }' }, 'main');
  assert.deepEqual([p.stage, p.errors[0].code, p.errors[0].line, p.errors[0].column], ['parse', 'PARSE_UNEXPECTED_TOKEN', 1, 10]);
});

test('đầu cuối: compile không ném với đầu vào ngẫu nhiên có hạt giống cố định', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alpha = ['a', 'b', ' ', '\n', '=', '{', '}', '[', ']', ',', '"', '${', '}', 'include', 'const', ' "x"', '1', '-', '#', '/*', '*/', '\\', '@', '.', 'true', 'null', '\r\n'];
  for (let i = 0; i < 400; i++) {
    let s = '';
    for (let k = 0, n = 1 + rnd(30); k < n; k++) s += alpha[rnd(alpha.length)];
    let r;
    assert.doesNotThrow(() => { r = compile({ main: s, x: s }, 'main'); }, JSON.stringify(s));
    assert.equal(typeof r.ok, 'boolean');
    if (!r.ok) assert.ok(['parse', 'check'].includes(r.stage));
    else assert.deepEqual(JSON.parse(JSON.stringify(r.config)), r.config);
  }
});

test('đầu cuối: config tạo ra luôn tự so sánh bằng chính nó (diff rỗng) và ổn định giữa các lần compile', () => {
  const a = compile({ main: BASE }, 'main');
  const b = compile({ main: BASE }, 'main');
  assert.deepEqual(a, b);
  assert.deepEqual(diff(a.config, b.config), []);
  assert.equal(formatText(diff(a.config, b.config)), 'Không có thay đổi');
});

test('đầu cuối: 200 tệp include nối chuỗi và 1000 khóa chạy được', () => {
  const files = {};
  for (let i = 0; i < 200; i++) files[`f${i}`] = `k${i} = ${i}\n` + (i < 199 ? `include "f${i + 1}"` : '');
  const r = compile(files, 'f0');
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.config).length, 200);
  assert.deepEqual(Object.keys(r.config).slice(0, 3), ['k0', 'k1', 'k2']);
  const big = Array.from({ length: 1000 }, (_, i) => `a${i} = "v${i}-\${a${(i + 1) % 1000 === 0 ? 0 : i + 1}}"`);
  assert.equal(compile({ main: big.join('\n') }, 'main').ok, false);
});
