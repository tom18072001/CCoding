// B-18 (lớp 2): fail-closed, ánh xạ WSL2, parser từ chối, log, hồi quy E5 (không chặn nhầm khi tắt / lượt thường).
// Mọi giá trị đường dẫn là dữ liệu giả. Phần WSL2 CHƯA KIỂM TRÊN MÁY THẬT (spike G1) — đây là test thuần.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClaudeArgs, ClaudeCliRuntime, ClaudeStreamParser, parseSandboxDeny, sandboxAvailable, toWslPath, wrapForWsl } from '../src/runtimes/claude-cli.js';
import { logSandboxDeny } from '../src/tools/claude-guard.js';
import { loadConfig, validateOsSandbox } from '../src/config.js';
import type { RunRequest } from '../src/types.js';

function tmpData() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sbx-'));
  const state = path.join(data, 'runs', 'T-1', 'guard', 'state.json'); // dataDir suy từ state (guardLogTarget)
  fs.mkdirSync(path.dirname(state), { recursive: true });
  return { data, state };
}
const readLog = (data: string) => {
  const f = path.join(data, 'logs', 'system.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const req = (state?: string): RunRequest =>
  ({
    phase: 'execute', model: 'sonnet', cwd: process.cwd(), tools: ['Read', 'Bash'], allowTools: true, timeoutMs: 1000, system: 's', prompt: 'p',
    toolPolicy: { root: process.cwd(), allow: [], maxTurns: 5, commandTimeoutSec: 10, maxOutputChars: 1000, guardState: state },
    meta: { taskId: 't', department: 'dev', callId: 'c' },
  }) as unknown as RunRequest;

// ── fail-closed ──
test('B-18: bật mà không có sandbox → lỗi tiếng Việt, KHÔNG chạy lệnh, ghi sandbox.unavailable', async () => {
  const { data, state } = tmpData();
  // lệnh không tồn tại: nếu run() lọt tới runProcess thì lỗi sẽ khác (không tìm thấy lệnh) — và test dưới đây sẽ đỏ
  const rt = new ClaudeCliRuntime({ command: 'ccoding-khong-ton-tai-xyz', osSandbox: { enabled: true } }, {}, { sandboxAvailable: () => ({ ok: false, backend: 'none', reason: 'Windows không có WSL2 với distro nào' }) });
  const r = await rt.run(req(state), {});
  assert.match(r.error ?? '', /^Sandbox hệ điều hành đã bật .*Không chạy/);
  assert.match(r.error ?? '', /WSL2/);
  assert.equal(r.text, '');
  const ev = readLog(data).filter((e) => e.kind === 'sandbox.unavailable');
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].data, { backend: 'none', platform: process.platform });
});

test('B-18: sandboxAvailable theo nền tảng (tiêm probe) — Linux kỳ vọng native, win32 chỉ khi có WSL2', () => {
  assert.deepEqual(sandboxAvailable('linux'), { ok: true, backend: 'native' });
  assert.deepEqual(sandboxAvailable('darwin'), { ok: true, backend: 'native' });
  assert.deepEqual(sandboxAvailable('win32', () => true), { ok: true, backend: 'wsl2' });
  const none = sandboxAvailable('win32', () => false);
  assert.equal(none.ok, false);
  assert.equal(none.backend, 'none');
  assert.ok(none.reason);
  assert.equal(sandboxAvailable('win32', () => true, 'appcontainer').ok, false);
  assert.equal(sandboxAvailable('linux', () => true, 'wsl2').ok, false);
});

// ── ánh xạ đường dẫn WSL2 ──
test('B-18: toWslPath', () => {
  assert.equal(toWslPath('C:\\Users\\a b\\proj'), '/mnt/c/Users/a b/proj');
  assert.equal(toWslPath('D:/x/y/'), '/mnt/d/x/y');
  assert.equal(toWslPath('C:\\'), '/mnt/c');
  assert.equal(toWslPath('/home/u/p'), '/home/u/p');
  assert.throws(() => toWslPath('\\\\server\\share\\x'), /Không đổi được đường dẫn sang WSL/);
  assert.throws(() => toWslPath('tuong-doi/x'), /Không đổi được/);
});

test('B-18: wrapForWsl đổi cmd, ánh xạ cwd, CCODING_GUARD.root/state, hook, allowWrite; WSLENV chia sẻ biến', () => {
  const { args, env } = buildClaudeArgs({ osSandbox: { enabled: true } }, { ...req(), cwd: 'C:\\w\\task 1', toolPolicy: { ...req().toolPolicy, root: 'C:\\w\\task 1', guardState: 'C:\\d\\runs\\T\\guard\\s.json' } } as RunRequest, 'm');
  const w = wrapForWsl({ cmd: 'claude', args, cwd: 'C:\\w\\task 1', env });
  assert.equal(w.cmd, 'wsl.exe');
  assert.deepEqual(w.args.slice(0, 4), ['--cd', '/mnt/c/w/task 1', '--exec', 'claude']);
  const s = JSON.parse(w.args[w.args.indexOf('--settings') + 1]);
  // Đường dẫn hook lấy theo nơi cài repo: trên Windows là C:\… nên phải thành /mnt/<ổ>/…; trên Linux/macOS đã là POSIX nên giữ nguyên.
  const hookOrig = JSON.parse(args[args.indexOf('--settings') + 1]).hooks.PreToolUse[0].hooks[0].command as string;
  if (process.platform === 'win32') assert.match(s.hooks.PreToolUse[0].hooks[0].command, /^node "\/mnt\/[a-z]\/.*claude-guard\.js"$/);
  else assert.equal(s.hooks.PreToolUse[0].hooks[0].command, hookOrig);
  assert.deepEqual(s.sandbox.filesystem.allowWrite, ['/mnt/c/w/task 1']);
  const g = JSON.parse(w.env.CCODING_GUARD!);
  assert.equal(g.root, '/mnt/c/w/task 1');
  assert.equal(g.state, '/mnt/c/d/runs/T/guard/s.json');
  assert.equal(w.env.WSLENV, 'CCODING_GUARD');
  // cờ khác không bị đụng
  assert.deepEqual(w.args.slice(4).filter((a) => !a.startsWith('{')), args.filter((a) => !a.startsWith('{')));
  // đầu vào không bị sửa (hàm thuần)
  assert.ok(JSON.parse(env.CCODING_GUARD!).root.startsWith('C:'));
});

test('B-18: wrapForWsl giữ WSLENV có sẵn và ánh xạ state khi là đường dẫn Windows', () => {
  const env = { CCODING_GUARD: JSON.stringify({ root: 'C:/r', state: 'C:/d/s.json' }), WSLENV: 'FOO/p', BASH_MAX_OUTPUT_LENGTH: '100' };
  const w = wrapForWsl({ cmd: 'claude', args: ['-p'], cwd: 'C:/r', env });
  assert.equal(w.env.WSLENV, 'FOO/p:CCODING_GUARD:BASH_MAX_OUTPUT_LENGTH');
  assert.deepEqual(JSON.parse(w.env.CCODING_GUARD!), { root: '/mnt/c/r', state: '/mnt/c/d/s.json' });
});

// ── parser từ chối + log ──
test('B-18: parseSandboxDeny nhận Read-only file system, proxy 403, host bị chặn; lạ → unknown; thường → null', () => {
  assert.deepEqual(parseSandboxDeny('bash: x: Read-only file system'), { rule: 'fs-readonly' });
  assert.deepEqual(parseSandboxDeny('HTTP/1.1 403 Forbidden from proxy'), { rule: 'net-403' });
  assert.deepEqual(parseSandboxDeny('connect: host api.example.test blocked by policy'), { rule: 'net-host' });
  assert.deepEqual(parseSandboxDeny('Command failed: sandbox violation'), { rule: 'unknown' });
  assert.equal(parseSandboxDeny('npm ERR! test failed, exit 1'), null);
  assert.equal(parseSandboxDeny('ok'), null);
});

const toolTurn = (id: string, name: string, result: string, isError = true) => [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { command: 'echo SECRET_CMD_BODY > /etc/x' } }] } }),
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: result }] } }),
];

test('B-18: ClaudeStreamParser gọi onSandboxDeny với { tool, rule } khi bật; tắt thì không báo', () => {
  const seen: unknown[] = [];
  const on = new ClaudeStreamParser({}, (d) => seen.push(d));
  for (const l of toolTurn('a', 'Bash', 'cannot create: Read-only file system')) on.feed(l);
  assert.deepEqual(seen, [{ tool: 'run_command', rule: 'fs-readonly' }]);
  const off = new ClaudeStreamParser({});
  for (const l of toolTurn('b', 'Bash', 'cannot create: Read-only file system')) off.feed(l);
  assert.equal(off.toolCalls[0].ok, false); // vẫn là lỗi công cụ bình thường
});

test('B-18: logSandboxDeny ghi sandbox.deny qua LogStore, data chỉ { tool, rule, backend }', () => {
  const { data, state } = tmpData();
  logSandboxDeny({ tool: 'run_command', rule: 'fs-readonly', backend: 'wsl2' }, { state });
  const ev = readLog(data).filter((e) => e.kind === 'sandbox.deny');
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].data, { tool: 'run_command', rule: 'fs-readonly', backend: 'wsl2' });
  assert.doesNotMatch(JSON.stringify(ev[0]), /SECRET_CMD_BODY/);
});

// ── E5: không chặn nhầm ──
test('E5: sandbox tắt → không khóa sandbox, không log deny dù kết quả công cụ chứa chữ "sandbox"/"Read-only"', () => {
  assert.equal(buildClaudeArgs({}, req(), 'm').args.some((a) => a.includes('"sandbox"')), false);
  const p = new ClaudeStreamParser({});
  for (const l of toolTurn('c', 'Bash', 'sandbox Read-only file system')) p.feed(l);
  assert.equal(p.toolCalls[0].ok, false); // chỉ là lỗi công cụ thường, không có đường báo deny khi tắt
});

test('E5: lượt claude-cli bình thường (kết quả thành công, lỗi test thường) không bị coi là sandbox từ chối', () => {
  const seen: unknown[] = [];
  const p = new ClaudeStreamParser({}, (d) => seen.push(d));
  for (const l of toolTurn('d', 'Bash', 'tests 331 pass 327 fail 0', false)) p.feed(l);
  for (const l of toolTurn('e', 'Bash', 'npm ERR! code 1 — 2 tests failed', true)) p.feed(l);
  assert.deepEqual(seen, []);
});

test('E5: checkCommands của dự án không đi qua claude-cli → cấu hình osSandbox không ảnh hưởng chúng (chỉ có trong buildClaudeArgs)', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'orchestrator.ts'), 'utf8');
  assert.doesNotMatch(src, /osSandbox/);
});

// ── cấu hình ──
test('B-18: validateOsSandbox + loadConfig — mặc định tắt, sai kiểu báo lỗi tiếng Việt', () => {
  assert.doesNotThrow(() => validateOsSandbox(undefined));
  assert.doesNotThrow(() => validateOsSandbox({ enabled: true, platformBackend: 'wsl2', extraAllowedDomains: ['a.test'], denyRead: ['x'] }));
  assert.throws(() => validateOsSandbox({ enabled: 'yes' }), /enabled phải là true\/false/);
  assert.throws(() => validateOsSandbox({ platformBackend: 'docker' }), /platformBackend/);
  assert.throws(() => validateOsSandbox({ extraAllowedDomains: 'a' }), /mảng chuỗi/);
  assert.throws(() => validateOsSandbox([]), /đối tượng/);
  const cfg = loadConfig({ local: false });
  assert.notEqual(cfg.runtimes['claude-cli']?.osSandbox?.enabled, true);
  assert.equal(typeof cfg.runtimes['codex-cli']?.sandbox, 'string'); // trường sandbox của Codex không đổi
});
