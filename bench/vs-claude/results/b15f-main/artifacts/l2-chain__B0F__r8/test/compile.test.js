import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText, applyDiff, check, evaluate, parseProject, tokenize, parse } from '../src/index.js';

test('index xuất lại các hàm công khai', () => {
  for (const f of [tokenize, parse, parseProject, check, evaluate, diff, formatText, applyDiff, compile]) {
    assert.equal(typeof f, 'function');
  }
});

test('compile nhánh parse: lỗi cú pháp', () => {
  const r = compile({ main: 'a = 1\nb = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(r.errors[0].file, 'main');
});

test('compile nhánh parse: thiếu entry và lỗi ở tệp include', () => {
  const a = compile({}, 'main');
  assert.equal(a.stage, 'parse');
  assert.equal(a.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const b = compile({ main: 'include "x"', x: 'a = ' }, 'main');
  assert.equal(b.stage, 'parse');
  assert.equal(b.errors[0].file, 'x');
});

test('compile nhánh check: trả đúng mảng của check', () => {
  const files = { main: 'a = "${zz}"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors, check(parseProject(files, 'main').program));
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('compile nhánh ok, không và có schema', () => {
  const files = { main: 'port = 80\nname = "x"' };
  assert.deepEqual(compile(files, 'main'), { ok: true, config: { port: 80, name: 'x' } });
  const schema = { type: 'object', closed: true, fields: { port: { type: 'integer', required: true }, name: { type: 'string' } } };
  assert.deepEqual(compile(files, 'main', schema), { ok: true, config: { port: 80, name: 'x' } });
  const bad = compile({ main: 'port = "a"\nextra = 1' }, 'main', schema);
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'check');
  assert.deepEqual(bad.errors.map((e) => e.code), ['SEM_TYPE_MISMATCH', 'SEM_UNKNOWN_KEY']);
  const miss = compile({ main: 'name = "x"' }, 'main', schema);
  assert.equal(miss.errors[0].code, 'SEM_MISSING_REQUIRED');
});

test('compile ví dụ include và ghi đè', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('đường ống đầu cuối: compile hai cấu hình rồi diff/formatText/applyDiff', () => {
  const a = compile({ main: 'name = "svc"\nports = [80, 443]\nhttp { port = 80 }' }, 'main');
  const b = compile({ main: 'name = "svc2"\nports = [80]\nhttp { port = 80 }\ndebug = true' }, 'main');
  assert.ok(a.ok && b.ok);
  const ops = diff(a.config, b.config);
  assert.deepEqual(ops, [
    { op: 'add', path: '/debug', value: true },
    { op: 'replace', path: '/name', oldValue: 'svc', value: 'svc2' },
    { op: 'remove', path: '/ports/1', oldValue: 443 },
  ]);
  assert.equal(formatText(ops), '+ /debug = true\n~ /name: "svc" -> "svc2"\n- /ports/1 = 443');
  assert.deepEqual(applyDiff(a.config, ops), b.config);
});
