import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSlim, SLIM_DEFAULTS } from '../src/slim.js';
import { loadConfig } from '../src/config.js';
import { variantOptions } from '../src/orchestrator.js';

test('B-11 slim: mặc định accept=full, compactTemplate=false, promptDiet=true', () => {
  const s = resolveSlim();
  assert.equal(s.accept, 'full');
  assert.equal(s.compactTemplate, false);
  assert.equal(s.promptDiet, true);
  assert.deepEqual(resolveSlim(loadConfig({ local: false })), SLIM_DEFAULTS);
});

test('B-11 slim: thứ tự mặc định < config < dự án < nhiệm vụ', () => {
  const cfg = { lanes: { single: { slim: { accept: 'brief', compactTemplate: true } } } };
  assert.deepEqual(resolveSlim(cfg), { accept: 'brief', compactTemplate: true, promptDiet: true });
  const proj = { slim: { accept: 'skip', promptDiet: false } };
  assert.deepEqual(resolveSlim(cfg, proj), { accept: 'skip', compactTemplate: true, promptDiet: false });
  const opt = { slim: { accept: 'full', compactTemplate: false } };
  assert.deepEqual(resolveSlim(cfg, proj, opt), { accept: 'full', compactTemplate: false, promptDiet: false });
});

test('B-11 slim: khóa sai kiểu / giá trị lạ bị bỏ, không đè giá trị cấp thấp hơn', () => {
  const cfg = { lanes: { single: { slim: { accept: 'brief' } } } };
  const bad = { slim: { accept: 'nope', compactTemplate: 'yes', promptDiet: 1, extra: true } };
  assert.deepEqual(resolveSlim(cfg, bad, bad), { accept: 'brief', compactTemplate: false, promptDiet: true });
  assert.deepEqual(resolveSlim(undefined, { slim: 'x' }, { slim: [1] }), SLIM_DEFAULTS);
});

test('B-11 slim: variantOptions chuẩn hóa options.slim', () => {
  assert.deepEqual(variantOptions({ slim: { accept: 'brief', junk: 1 } as never }).slim, { accept: 'brief' });
  assert.equal(variantOptions({ slim: { accept: 'zzz' } as never }).slim, undefined);
  assert.equal(variantOptions({}).slim, undefined);
});
