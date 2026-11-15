import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// D27/K1: một test treo phải làm lệnh đỏ. Cờ đọc từ chính package.json, không chép cứng giá trị.
// D28: --test-force-exit đã bật (xem test/force-exit.test.ts); các tệp test đóng server qua closeServer (test/helpers.ts) để libuv không sập trên Windows.

const ROOT = path.resolve(import.meta.dirname, '..');
const scripts = (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const flagOf = (script: string): number | undefined => {
  const m = /--test-timeout[= ](\d+)/.exec(scripts[script] ?? '');
  return m ? Number(m[1]) : undefined;
};

for (const name of ['test', 'test:bench', 'test:research']) {
  test(`script "${name}" có --test-timeout hợp lý`, () => {
    const ms = flagOf(name);
    assert.ok(ms !== undefined, `thiếu --test-timeout trong script ${name}`);
    assert.ok(ms >= 60_000 && ms <= 1_800_000, `--test-timeout=${ms} ngoài khoảng 1–30 phút`);
  });
}

const HANG_NO_HANDLE = "import { test } from 'node:test';\ntest('treo vô hạn', async () => { await new Promise(() => {}); });\n";
const HANG_WITH_HANDLE = "import { test } from 'node:test';\ntest('treo vô hạn', async () => { setInterval(() => {}, 1000); await new Promise(() => {}); });\n";

/** Chạy một tệp test treo bằng `node --test` hoặc `tsx --test` với --test-timeout nhỏ (giới hạn cứng 8 giây bằng spawnSync). */
function runHang(source: string, ext: 'mjs' | 'ts', runner: 'node' | 'tsx', timeoutMs: number, forceExit = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-hang-'));
  try {
    const file = path.join(dir, `hang.test.${ext}`);
    fs.writeFileSync(file, source);
    const flags = ['--test', `--test-timeout=${timeoutMs}`, ...(forceExit ? ['--test-force-exit'] : [])];
    const args = runner === 'node' ? [...flags, file] : [TSX, ...flags, file];
    // NODE_TEST_CONTEXT của tiến trình test cha làm `node --test` con chạy như tiến trình con của runner, không chạy thật
    const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 8_000, killSignal: 'SIGKILL', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    return { status: r.status, killed: r.error !== undefined || r.signal !== null, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('node --test --test-timeout: test treo (không handle mở) ⇒ đỏ, tiến trình tự thoát mã ≠ 0', () => {
  const r = runHang(HANG_NO_HANDLE, 'mjs', 'node', 1500);
  assert.equal(r.killed, false, `tiến trình phải tự thoát: ${r.out.slice(0, 300)}`);
  assert.notEqual(r.status, 0);
});

test('A1: tsx --test chuyển --test-timeout sang node --test (tệp .ts treo có handle mở ⇒ báo đỏ vì quá hạn)', () => {
  // có handle mở thì tiến trình có thể còn sống sau khi báo đỏ (giới hạn ghi ở docs/LINT.md); ở đây chỉ cần thấy test bị đánh dấu quá hạn
  const r = runHang(HANG_WITH_HANDLE, 'ts', 'tsx', 1500, true);
  assert.match(r.out, /✖ treo vô hạn|not ok 1 - treo vô hạn|timed out/);
  assert.notEqual(r.status, 0, 'không được thoát 0');
});

test('A1: tsx --test với tệp .ts treo không handle ⇒ thoát mã ≠ 0 tự nhiên', () => {
  const r = runHang(HANG_NO_HANDLE, 'ts', 'tsx', 1500);
  assert.equal(r.killed, false, `tiến trình phải tự thoát: ${r.out.slice(0, 300)}`);
  assert.notEqual(r.status, 0);
});
