// B-18 (lớp 2): buildClaudeArgs khi osSandbox bật/tắt. Hàm thuần — không spawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildClaudeArgs, buildSandboxSettings } from '../src/runtimes/claude-cli.js';
import type { RunRequest } from '../src/types.js';

const req = (allowTools = true): RunRequest =>
  ({
    phase: 'execute', model: 'sonnet', cwd: 'C:/tmp/x', tools: allowTools ? ['Read', 'Grep', 'Bash'] : [], allowTools, timeoutMs: 1000, system: 's', prompt: 'p',
    toolPolicy: { root: 'C:/tmp/x', allow: [], maxTurns: 40, commandTimeoutSec: 10, maxOutputChars: 1000, denyCommands: ['x y'] },
    meta: { taskId: 't', department: 'dev', callId: 'c' },
  }) as unknown as RunRequest;

const settingsOf = (args: string[]) => JSON.parse(args[args.indexOf('--settings') + 1]);
// đường dẫn hook phụ thuộc nơi checkout → thay bằng <GUARD> trước khi băm
const sha = (v: unknown) => crypto.createHash('sha256').update(JSON.stringify(v).replace(/[^"\\]*claude-guard\.js/g, '<GUARD>')).digest('hex').slice(0, 16);

// Băm { args, env } của buildClaudeArgs TRƯỚC khi thêm B-18 (commit 8b0b6c3, dựng bằng bản claude-cli.ts của HEAD đó, 3/11/2026).
// buildClaudeArgs không có nhánh theo nền tảng → một băm cho win32 và Linux (đo trên win32; kỳ vọng Linux: cùng giá trị).
const SNAPSHOT_OFF = 'b5ce1ce888358c4a';

test('B-18: tắt (không đặt / enabled=false) → args + env trùng từng byte với bản trước', () => {
  const base = { permissionMode: 'acceptEdits' };
  assert.equal(sha(buildClaudeArgs(base, req(), 'm')), SNAPSHOT_OFF);
  assert.equal(sha(buildClaudeArgs({ ...base, osSandbox: { enabled: false } }, req(), 'm')), SNAPSHOT_OFF);
  assert.equal(sha(buildClaudeArgs({ ...base, osSandbox: { extraAllowedDomains: ['a.example'] } }, req(), 'm')), SNAPSHOT_OFF);
  assert.equal('sandbox' in settingsOf(buildClaudeArgs(base, req(), 'm').args), false);
});

test('B-18: bật → khóa sandbox chung chuỗi --settings với hook, đúng đặc tả §d.1', () => {
  const { args } = buildClaudeArgs({ osSandbox: { enabled: true } }, req(), 'm');
  assert.equal(args.filter((a) => a === '--settings').length, 1);
  const s = settingsOf(args);
  assert.ok(s.hooks.PreToolUse[0].hooks[0].command.includes('claude-guard.js'), 'hook lớp 1 vẫn còn');
  assert.deepEqual(s.sandbox, {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: { allowWrite: ['C:/tmp/x'], denyRead: ['.env*'] },
    network: { allowedDomains: [], strictAllowlist: true },
  });
});

test('B-18: bật → mọi cờ khác giữ nguyên, chỉ chuỗi --settings thêm khóa sandbox', () => {
  const off = buildClaudeArgs({}, req(), 'm');
  const on = buildClaudeArgs({ osSandbox: { enabled: true } }, req(), 'm');
  assert.deepEqual(on.env, off.env);
  const strip = (a: string[]) => a.map((x) => (x.startsWith('{"hooks"') ? JSON.stringify({ ...JSON.parse(x), sandbox: undefined }) : x));
  assert.deepEqual(strip(on.args), strip(off.args));
});

test('B-18: extraAllowedDomains và denyRead cấu hình được thêm vào, không thay mặc định', () => {
  const s = buildSandboxSettings('/r', { enabled: true, extraAllowedDomains: ['api.example.test'], denyRead: ['secrets/**'] }) as any;
  assert.deepEqual(s.network, { allowedDomains: ['api.example.test'], strictAllowlist: true });
  assert.deepEqual(s.filesystem.denyRead, ['.env*', 'secrets/**']);
  assert.deepEqual(s.filesystem.allowWrite, ['/r']);
});

test('B-18: lượt không có công cụ (allowTools=false) → không có --settings, bật hay tắt như nhau', () => {
  const a = buildClaudeArgs({ osSandbox: { enabled: true } }, req(false), 'm');
  assert.equal(a.args.includes('--settings'), false);
  assert.deepEqual(a, buildClaudeArgs({}, req(false), 'm'));
});

test('B-18: tham số osSandbox tường minh được ưu tiên hơn cfg.osSandbox', () => {
  assert.ok('sandbox' in settingsOf(buildClaudeArgs({}, req(), 'm', { enabled: true }).args));
  assert.equal('sandbox' in settingsOf(buildClaudeArgs({ osSandbox: { enabled: true } }, req(), 'm', { enabled: false }).args), false);
});
