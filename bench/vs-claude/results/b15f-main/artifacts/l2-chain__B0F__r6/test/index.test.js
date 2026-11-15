import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, tokenize, parse, parseProject, check, evaluate, diff, formatText } from '../src/index.js';
import * as api from '../src/index.js';

test('compile: thành công, ví dụ include và ghi đè', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('compile: stage parse', () => {
  const r = compile({ main: 'a = 1\nb = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].code, r.errors[0].file, r.errors[0].line], ['PARSE_UNEXPECTED_EOF', 'main', 2]);
  const e = compile({}, 'main');
  assert.equal(e.stage, 'parse');
  assert.equal(e.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile: stage check trả đúng mảng của check', () => {
  const files = { main: 'a = "${b}"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors, check(parseProject(files, 'main').program));
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('compile: schema được dùng (pha C)', () => {
  const schema = { fields: { port: { type: 'integer' } } };
  assert.deepEqual(compile({ main: 'port = 1' }, 'main', schema), { ok: true, config: { port: 1 } });
  const r = compile({ main: 'port = "x"' }, 'main', schema);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('index xuất đủ API công khai, không lộ merge', () => {
  for (const f of [compile, tokenize, parse, parseProject, check, evaluate, diff, formatText]) {
    assert.equal(typeof f, 'function');
  }
  assert.equal(api.buildModel, undefined);
});
