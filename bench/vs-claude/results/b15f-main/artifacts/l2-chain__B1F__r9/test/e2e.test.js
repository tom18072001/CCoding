import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText, applyDiff, summarize } from '../src/index.js';

const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }\n';

test('index xuất đủ named export', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('ví dụ mục 9', () => {
  const r = compile({ main }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè, thứ tự khóa', () => {
  const r = compile({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi parse: stage parse, errors có file', () => {
  const bad = main.replace('"${ports.1}" }', '"${ports.1}" , }');
  const r = compile({ main: bad }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].code, r.errors[0].file, r.errors[0].line], ['PARSE_UNEXPECTED_TOKEN', 'main', 5]);
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('lỗi check: stage check', () => {
  const r = compile({ main: 'a = "${b}"\nb = "${a}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [['SEM_REF_CYCLE', 1, 6], ['SEM_REF_CYCLE', 2, 6]]);
});

test('có lược đồ: hợp lệ và vi phạm', () => {
  const schema = {
    type: 'object', closed: true,
    fields: {
      name: { type: 'string', required: true }, ports: { type: 'array', items: { type: 'integer' } },
      http: { type: 'object', fields: { port: { type: 'integer' } } }, https: { type: 'object' },
    },
  };
  assert.equal(compile({ main }, 'main', schema).ok, true);
  const r = compile({ main: main + 'extra = 1' }, 'main', schema);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [['SEM_UNKNOWN_KEY', 'main', 6, 1]]);
  const r2 = compile({ main: main.replace('ports = [80, 443]', 'ports = [80, "x"]') }, 'main', schema);
  assert.deepEqual(r2.errors.map((e) => [e.code, e.line, e.column]), [['SEM_TYPE_MISMATCH', 3, 14]]);
});

test('diff hai lần compile', () => {
  const a = compile({ main }, 'main');
  const b = compile({ main: main.replace('443', '8443').replace('prod', 'dev') }, 'main');
  assert.equal(a.ok && b.ok, true);
  const ops = diff(a.config, b.config);
  assert.deepEqual(ops.map((o) => [o.op, o.path]), [
    ['replace', '/https/port'], ['replace', '/name'], ['replace', '/ports/1']]);
  assert.deepEqual(applyDiff(a.config, ops), b.config);
  assert.deepEqual(summarize(ops), { add: 0, remove: 0, replace: 3 });
  assert.equal(formatText(diff(a.config, a.config)), 'Không có thay đổi');
  assert.match(formatText(ops), /^~ \/name: "svc-prod" -> "svc-dev"/m);
});
