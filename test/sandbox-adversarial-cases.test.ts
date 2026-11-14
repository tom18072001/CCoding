// B-18: phần dựng ca và chấm của scripts/sandbox-adversarial.mjs, sandbox-bench.mjs. Dữ liệu giả, không spawn lệnh ca nào.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildAdversarialCases, selectForPlatform, gradeCase, gradeControl, summarize, CANARY } from '../scripts/lib/sandbox-cases.mjs';
import { stats, evaluate } from '../scripts/lib/sandbox-bench-stats.mjs';

const cases = buildAdversarialCases({ envPath: '/tmp/wt/.env', outsideDir: '/tmp/out', port: 1234, worktree: '/tmp/wt' });
const byId = (id: string) => cases.find((c: { id: string }) => c.id === id)!;

test('dựng ca: id duy nhất, đủ nhóm E1–E4, E3 có E3-6, E4-WMI bắt buộc', () => {
  assert.equal(new Set(cases.map((c: { id: string }) => c.id)).size, cases.length);
  for (const g of ['E1', 'E2', 'E3', 'E4']) assert.ok(cases.some((c: { group: string }) => c.group === g));
  assert.ok(byId('E3-6a') && byId('E3-6b'));
  assert.equal(byId('E4-WMI').mandatory, true);
  assert.equal(byId('E2-5').expect, 'allowed');
  assert.ok(byId('E3-1').cmd.includes('1234'));
});

test('chọn theo nền tảng: ca win32 bị bỏ trên linux và có lý do (không xanh giả)', () => {
  const { run, skipped } = selectForPlatform(cases, 'linux');
  assert.deepEqual(skipped.map((s: { id: string }) => s.id).sort(), ['E4-5', 'E4-WMI']);
  assert.ok(skipped.every((s: { reason: string }) => s.reason.length > 0));
  assert.equal(run.length + skipped.length, cases.length);
});

test('chấm: canary rò rỉ → rớt; dấu vết ngoài sandbox → rớt; exit≠0 sạch → đạt', () => {
  const x = byId('E1-1');
  assert.equal(gradeCase(x, { exitCode: 0, stdout: CANARY, stderr: '' }).pass, false);
  assert.equal(gradeCase(x, { exitCode: 1, stdout: '', stderr: 'Permission denied' }).pass, true);
  const w = byId('E2-1');
  assert.equal(gradeCase(w, { exitCode: 1, stdout: '', stderr: '', sideEffect: true }).pass, false);
  assert.equal(gradeCase(w, { exitCode: 1, stdout: '', stderr: '', sideEffect: false }).pass, true);
});

test('chấm: lệnh thành công mà không có bằng chứng bị chặn → rớt; E3-1 in ERR thì đạt', () => {
  assert.equal(gradeCase(byId('E1-4'), { exitCode: 0, stdout: '', stderr: '' }).pass, false);
  assert.equal(gradeCase(byId('E3-1'), { exitCode: 0, stdout: 'ERR ECONNREFUSED\n', stderr: '', sideEffect: false }).pass, true);
  assert.equal(gradeCase(byId('E3-1'), { exitCode: 0, stdout: '200\n', stderr: '', sideEffect: true }).pass, false);
});

test('chấm: đối chứng cho phép (E2-5) phải thành công, bị chặn nhầm thì rớt', () => {
  assert.equal(gradeCase(byId('E2-5'), { exitCode: 0, stdout: '', stderr: '', sideEffect: true }).pass, true);
  assert.equal(gradeCase(byId('E2-5'), { exitCode: 1, stdout: '', stderr: 'denied', sideEffect: false }).pass, false);
});

test('đối chứng sandbox tắt: ca không thấy được đòn tấn công là vô nghĩa', () => {
  assert.equal(gradeControl(byId('E1-1'), { exitCode: 0, stdout: CANARY, stderr: '' }).valid, true);
  assert.equal(gradeControl(byId('E1-1'), { exitCode: 1, stdout: '', stderr: 'no such file' }).valid, false);
});

test('tổng hợp: nhóm <5 ca bị nêu (E4 trên linux chỉ 4), một ca rớt → không đạt', () => {
  const { run, skipped } = selectForPlatform(cases, 'linux');
  const graded = run.map((x: { id: string }) => ({ id: x.id, pass: true, reason: '' }));
  const controls = run.map((x: { id: string }) => ({ id: x.id, valid: true }));
  const s = summarize(run, graded, controls, skipped);
  assert.equal(s.skipped, 2);
  assert.deepEqual(s.thinGroups, ['E4: 4 ca (<5)']);
  assert.equal(s.pass, false);
  const bad = summarize(run, graded.map((g: { id: string }, i: number) => (i === 0 ? { ...g, pass: false } : g)), controls, skipped);
  assert.deepEqual(bad.failed, [graded[0].id]);
});

test('thống kê: trung vị, p95 nearest-rank (n=30 → phần tử lớn thứ hai), rỗng → NaN', () => {
  const xs = Array.from({ length: 30 }, (_, i) => i + 1);
  const s = stats(xs);
  assert.equal(s.median, 15.5);
  assert.equal(s.p95, 29);
  assert.equal(s.min, 1);
  assert.equal(s.max, 30);
  assert.ok(Number.isNaN(stats([]).median));
});

test('ngưỡng: đạt/vượt theo §f, thiếu dữ liệu → null', () => {
  const ok = evaluate({ 0: [10, 10, 10], 1: [100, 100, 100] });
  assert.equal(ok.perCommand?.ok, true);
  const bad = evaluate({ 0: [10, 10, 10], 1: [400, 400, 700] });
  assert.equal(bad.perCommand?.ok, false);
  assert.equal(ok.perClaude, null);
  assert.equal(evaluate({ '4off': [100], '4on': [110] }).endToEnd?.ok, false);
});

test('script: --run-real bị từ chối trên win32 / khi có CCODING_GUARD (exit 2), không chạy lệnh ca', () => {
  for (const s of ['scripts/sandbox-adversarial.mjs', 'scripts/sandbox-bench.mjs']) {
    const r = spawnSync(process.execPath, [s, '--run-real'], { encoding: 'utf8', env: { ...process.env, CCODING_GUARD: '{}', CCODING_SANDBOX_TEST: '1' } });
    assert.equal(r.status, 2, s);
    assert.match(r.stderr, /Từ chối chạy thật/);
  }
});

test('script --dry-run: in cảnh báo "chỉ chạy trên Linux ngoài hook" và exit 0', () => {
  for (const s of ['scripts/sandbox-adversarial.mjs', 'scripts/sandbox-bench.mjs']) {
    const r = spawnSync(process.execPath, [s], { encoding: 'utf8' });
    assert.equal(r.status, 0, s);
    assert.match(r.stdout + r.stderr, /Chỉ chạy trên Linux ngoài hook/);
  }
});
