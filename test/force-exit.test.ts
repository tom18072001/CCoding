import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// D28/K1: test vừa treo vừa giữ handle mở (setInterval không unref) phải làm lệnh thoát ≠ 0 trong thời hạn.
// Cờ đọc thẳng từ package.json cho từng script (không chép cứng); chỉ hạ --test-timeout xuống nhỏ để test chạy nhanh.
// Tệp test tạm nằm ở os.tmpdir() (ngoài cây repo), dọn trong finally; watchdog riêng giết cả cây tiến trình nếu lệnh tự treo.

const ROOT = path.resolve(import.meta.dirname, '..');
const scripts = (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WATCHDOG_MS = 25_000;
const TEST_TIMEOUT_MS = 1500;

const HANG_WITH_OPEN_HANDLE = "import { test } from 'node:test';\ntest('treo vô hạn, giữ handle', async () => { setInterval(() => {}, 1000); await new Promise(() => {}); });\n";

/** Các cờ `--test-*` của một script trong package.json (bỏ reporter và mẫu tệp; --test-timeout hạ xuống nhỏ). */
function testFlags(script: string): string[] {
  const flags = (scripts[script].match(/--test-[a-z-]+(?:=\S+)?/g) ?? []).filter((f) => !f.startsWith('--test-reporter'));
  return flags.map((f) => (f.startsWith('--test-timeout') ? `--test-timeout=${TEST_TIMEOUT_MS}` : f.replace(/^(--test-[a-z-]+=)"(.*)"$/, '$1$2')));
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* đã thoát */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* đã thoát */ }
  }
}

async function runHang(script: string): Promise<{ status: number | null; watchdog: boolean; ms: number; out: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-force-exit-'));
  try {
    const runner = scripts[script].startsWith('tsx ');
    const ext = runner ? 'ts' : 'mjs';
    const file = path.join(dir, `hang.test.${ext}`);
    fs.writeFileSync(file, HANG_WITH_OPEN_HANDLE);
    const args = [...(runner ? [TSX] : []), '--test', ...testFlags(script), file];
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: dir, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    let watchdog = false;
    const timer = setTimeout(() => { watchdog = true; killTree(child.pid); }, WATCHDOG_MS);
    const status = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
      child.on('error', () => resolve(null));
    });
    clearTimeout(timer);
    return { status, watchdog, ms: Date.now() - t0, out };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

// Script đã chứng minh xanh 3 lần liên tiếp trên Windows với --test-force-exit thì giữ cờ. `test` (libuv sập ~1/3 lần
// toàn bộ bộ: Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\winsync.c) và `test:bench` (đỏ 1 lần chưa rõ nguyên nhân)
// chưa đạt nên chưa bật; vẫn bắt buộc --test-timeout.
const FORCE_EXIT = ['test:research', 'test:bench'];
const NO_FORCE_EXIT = ['test'];

for (const name of NO_FORCE_EXIT) {
  test(`script "${name}" chưa bật --test-force-exit nhưng vẫn có --test-timeout`, () => {
    assert.doesNotMatch(scripts[name], /--test-force-exit/, `${name}: bật cờ phải kèm bằng chứng 3 lần xanh, rồi chuyển sang FORCE_EXIT`);
    assert.match(scripts[name], /--test-timeout=\d+/);
  });
}

for (const name of FORCE_EXIT) {
  test(`script "${name}" có --test-force-exit`, () => {
    assert.match(scripts[name], /--test-force-exit/, `thiếu --test-force-exit trong script ${name}`);
  });

  test(`script "${name}": test treo + giữ handle mở ⇒ lệnh tự thoát mã ≠ 0 trong hạn`, async () => {
    const r = await runHang(name);
    assert.equal(r.watchdog, false, `lệnh không tự thoát sau ${WATCHDOG_MS} ms (đã bị watchdog giết): ${r.out.slice(0, 400)}`);
    assert.ok(r.status !== null && r.status !== 0, `mã thoát phải ≠ 0, nhận ${r.status}: ${r.out.slice(0, 400)}`);
    assert.match(r.out, /treo vô hạn/, 'phải báo test treo là đỏ (quá hạn)');
    assert.ok(r.ms < WATCHDOG_MS, `thoát quá chậm: ${r.ms} ms`);
  });
}
