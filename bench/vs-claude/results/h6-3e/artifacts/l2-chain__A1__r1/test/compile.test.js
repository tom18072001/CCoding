import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText } from '../src/index.js';

test('compile thành công và diff đường ống', () => {
  const r1 = compile({ main: 'a = 1\nb = "${a}"' }, 'main');
  const r2 = compile({ main: 'a = 2\nb = "${a}"' }, 'main');
  assert.deepEqual(r1, { ok: true, config: { a: 1, b: 1 } });
  assert.equal(formatText(diff(r1.config, r2.config)), '~ /a: 1 -> 2\n~ /b: 1 -> 2');
});

test('compile lỗi từng giai đoạn', () => {
  const p = compile({ main: 'a = ' }, 'main');
  assert.equal(p.ok, false);
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors.length, 1);
  assert.deepEqual([p.errors[0].code, p.errors[0].file], ['PARSE_UNEXPECTED_EOF', 'main']);
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_UNDEFINED_REF');
  const s = compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.equal(s.stage, 'check');
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
  assert.equal(compile({}, 'x').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});
