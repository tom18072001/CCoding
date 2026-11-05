// B-14a: test script chẩn đoán cache bằng dữ liệu giả — không spawn `claude`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan, hitRatio, interpret, runDiagnostic, toCsv, MAX_CALLS, buildPrompt } from '../cache-diagnostic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, '..', 'fixtures', 'cache-diagnostic.fixture.json');
const hasDist = fs.existsSync(path.resolve(here, '..', '..', '..', 'dist', 'runtimes', 'claude-cli.js'));

test('kế hoạch: 3 cặp + khởi động = 7 lượt ≤ 8; b đổi công cụ, c đổi cwd', () => {
  const p = buildPlan();
  assert.equal(p.length, 7);
  assert.ok(p.length <= MAX_CALLS);
  assert.notDeepEqual(p.find((s) => s.label === 'b1').tools, p.find((s) => s.label === 'b2').tools);
  assert.notEqual(p.find((s) => s.label === 'c1').cwdKey, p.find((s) => s.label === 'c2').cwdKey);
  assert.equal(p.find((s) => s.label === 'a1').cwdKey, p.find((s) => s.label === 'a2').cwdKey);
  assert.equal(buildPlan({ warmup: false }).length, 6);
});

test('h = CR/(CR+CW+IN); prompt có nonce ở đầu', () => {
  assert.equal(hitRatio({ cr: 90, cw: 5, input: 5 }), 0.9);
  assert.equal(hitRatio({}), 0);
  assert.ok(buildPrompt('abc').startsWith('nonce:abc\n'));
});

test('fixture: ra đủ 7 hàng, đúng h, diễn giải khớp G1', { skip: hasDist ? false : 'thiếu dist/ — chạy npm run build' }, async () => {
  const steps = [];
  const { rows } = await runDiagnostic({ fixture }, { onStep: (s) => steps.push(s) });
  assert.equal(rows.length, 7);
  assert.ok(rows.find((r) => r.call === 'a2').h >= 0.9);
  assert.ok(rows.find((r) => r.call === 'b2').h < 0.2);
  // cờ lấy từ buildClaudeArgs thật: --tools theo từng lượt
  const b2 = steps.find((s) => s.step.label === 'b2').args;
  assert.equal(b2[b2.indexOf('--tools') + 1], 'Read,Grep,Edit,Write');
  assert.ok(b2.includes('--no-session-persistence'));
  assert.match(toCsv(rows), /^pair,call,model,gap_s,cw,cr,in,out,h\n/);
  const text = interpret(rows).join('\n');
  assert.match(text, /cache hoạt động/);
  assert.match(text, /khớp G1/);
  assert.match(text, /c2/);
});

test('fixture thiếu lượt → lỗi rõ', { skip: hasDist ? false : 'thiếu dist/' }, async () => {
  const tmp = path.join(here, '..', 'fixtures', '_tmp-missing.json');
  fs.writeFileSync(tmp, JSON.stringify({ calls: { warmup: {} } }));
  try { await assert.rejects(runDiagnostic({ fixture: tmp }), /fixture thiếu lượt/); } finally { fs.rmSync(tmp, { force: true }); }
});
