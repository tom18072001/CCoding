// DET-04: log sandbox.deny / sandbox.unavailable không được bỏ qua im lặng. Đường dẫn dựng bằng path.join(os.tmpdir(), …) — chạy trên win32 và posix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logSandboxDeny, logSandboxUnavailable } from '../src/tools/claude-guard.js';
import { ClaudeCliRuntime } from '../src/runtimes/claude-cli.js';
import type { RunRequest } from '../src/types.js';
// Cô lập môi trường: CCODING_DATA_DIR của máy chạy sẽ lấn át thư mục dữ liệu suy từ state và làm test ghi vào dữ liệu thật.
delete process.env.CCODING_DATA_DIR;


function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sbxfb-'));
}

/** Bắt mọi thứ ghi vào stderr trong lúc chạy fn. */
async function captureStderr<T>(fn: () => T | Promise<T>): Promise<{ result: T; lines: string[] }> {
  const orig = process.stderr.write;
  let buf = '';
  (process.stderr as unknown as { write: unknown }).write = (c: string | Uint8Array) => {
    buf += String(c);
    return true;
  };
  try {
    const result = await fn();
    return { result, lines: buf.split('\n').filter(Boolean) };
  } finally {
    process.stderr.write = orig;
  }
}

const deny = { tool: 'Bash', rule: 'write-denied', backend: 'native' as const };

test('DET-04: không có dataDir, không có CCODING_DATA_DIR → đúng 1 dòng stderr, không lộ đường dẫn', async () => {
  const { result, lines } = await captureStderr(() => logSandboxDeny(deny, {}, {}));
  assert.equal(result.ok, false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[ccoding\] sandbox\.deny không ghi được log: không xác định thư mục dữ liệu \(đặt CCODING_DATA_DIR\) \{tool: Bash, rule: write-denied, backend: native\}$/);
  assert.ok(!lines[0].includes(os.tmpdir()));
  const u = await captureStderr(() => logSandboxUnavailable({ backend: 'none', platform: 'win32' }, {}, {}));
  assert.equal(u.lines.length, 1);
  assert.match(u.lines[0], /^\[ccoding\] sandbox\.unavailable không ghi được log: không xác định thư mục dữ liệu/);
});

test('DET-04: dataDir trỏ vào một tệp (không ghi được) → có cảnh báo chỉ nêu loại lỗi, không ném lỗi', async () => {
  const dir = tmp();
  const file = path.join(dir, 'la-mot-tep');
  fs.writeFileSync(file, 'x');
  const { result, lines } = await captureStderr(() => logSandboxDeny(deny, { dataDir: file }, {}));
  assert.equal(result.ok, false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[ccoding\] sandbox\.deny không ghi được log: ghi nhật ký thất bại \([A-Za-z0-9_]+\) \{tool: Bash, rule: write-denied, backend: native\}$/);
  assert.ok(!lines[0].includes(dir) && !lines[0].includes(path.basename(file)));
});

test('DET-04: bình thường → sự kiện vào system.jsonl, stderr trống', async () => {
  const data = tmp();
  const oldKey = process.env.CCODING_LOG_HMAC_KEY;
  process.env.CCODING_LOG_HMAC_KEY = 'khoa-gia-chi-dung-cho-test'; // tránh cảnh báo thiếu khóa lẫn vào stderr
  let captured;
  try {
    captured = await captureStderr(() => logSandboxDeny(deny, { dataDir: data }, {}));
  } finally {
    if (oldKey === undefined) delete process.env.CCODING_LOG_HMAC_KEY;
    else process.env.CCODING_LOG_HMAC_KEY = oldKey;
  }
  const { result, lines } = captured;
  assert.equal(result.ok, true);
  assert.deepEqual(lines, []);
  const rows = fs.readFileSync(path.join(data, 'logs', 'system.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'sandbox.deny');
  assert.deepEqual(rows[0].data, { tool: 'Bash', rule: 'write-denied', backend: 'native' });
});

test('DET-04: claude-cli với log hỏng → lỗi lộ ra trong kết quả lượt, vẫn fail-closed', async () => {
  const dir = tmp();
  const file = path.join(dir, 'la-mot-tep');
  fs.writeFileSync(file, 'x');
  const state = path.join(file, 'runs', 'T-1', 'guard', 'state.json'); // dataDir suy ra = tệp ⇒ ghi log thất bại
  const req = {
    phase: 'execute', model: 'sonnet', cwd: process.cwd(), tools: ['Read'], allowTools: true, timeoutMs: 1000, system: 's', prompt: 'p',
    toolPolicy: { root: process.cwd(), allow: [], maxTurns: 5, commandTimeoutSec: 10, maxOutputChars: 1000, guardState: state },
    meta: { taskId: 't', department: 'dev', callId: 'c' },
  } as unknown as RunRequest;
  const rt = new ClaudeCliRuntime({ command: 'ccoding-khong-ton-tai-xyz', osSandbox: { enabled: true } }, {}, { sandboxAvailable: () => ({ ok: false, backend: 'none', reason: 'không có WSL2' }) });
  const { result: r, lines } = await captureStderr(() => rt.run(req, {}));
  assert.match(r.error ?? '', /^Sandbox hệ điều hành đã bật .*Không chạy/);
  assert.match(r.error ?? '', /không ghi được sự kiện sandbox\.unavailable vào nhật ký \([A-Za-z0-9_]+\)/);
  assert.ok(!(r.error ?? '').includes(dir));
  assert.equal(r.text, '');
  assert.equal(lines.length, 1);
});
