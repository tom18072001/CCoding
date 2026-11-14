import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText } from '../src/index.js';

test('compile: các giai đoạn', () => {
  const p = compile({ main: 'a = 1 }' }, 'main');
  assert.equal(p.ok, false);
  assert.equal(p.stage, 'parse');
  const e = p.errors[0];
  assert.deepEqual([e.code, e.file, e.line, e.column], ['PARSE_UNEXPECTED_TOKEN', 'main', 1, 7]);
  assert.equal(compile({}, 'x').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_UNDEFINED_REF');
  const s = compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.equal(s.stage, 'check');
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('đường ống đầu cuối: compile hai phiên bản rồi diff', () => {
  const a = compile({ main: 'port = 80\nurl = "h:${port}"' }, 'main');
  const b = compile({ main: 'port = 81\nurl = "h:${port}"' }, 'main');
  assert.equal(formatText(diff(a.config, b.config)), '~ /port: 80 -> 81\n~ /url: "h:80" -> "h:81"');
});
