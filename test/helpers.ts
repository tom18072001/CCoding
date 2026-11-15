import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** Dựng app với thư mục dữ liệu tạm và runtime mock chạy nhanh. */
export function testApp(extra: { reviewRejectRate?: number; acceptRejectRate?: number; dataDir?: string } = {}): App & { cleanup: () => void } {
  const dataDir = extra.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-test-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: extra.reviewRejectRate ?? 0, acceptRejectRate: extra.acceptRejectRate ?? 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  return Object.assign(app, { cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) });
}

/** Đọc thân JSON của phản hồi với kiểu do test khai báo (Response.json() trả unknown). */
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Đóng server http và chờ xong: đóng cả kết nối keep-alive (fetch/undici) rồi đợi socket phía client
 * nhận FIN và đóng hẳn, và các yêu cầu fs bất đồng bộ còn dở (FSReqCallback) xong. Không đợi thì --test-force-exit thoát giữa lúc handle đang đóng và libuv sập
 * trên Windows (Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c).
 */
export async function closeServer(srv: import('node:http').Server): Promise<void> {
  await new Promise<void>((resolve) => {
    srv.close(() => resolve());
    srv.closeAllConnections();
  });
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && process.getActiveResourcesInfo().some((r) => r !== 'PipeWrap' && r !== 'Timeout' && r !== 'Immediate' && r !== 'TTYWrap')) {
    await new Promise((r) => setTimeout(r, 10));
  }
  // vòng lặp sự kiện cần quay thêm một nhịp để libuv đóng xong các async handle nội bộ (không hiện trong getActiveResourcesInfo);
  // đo trên Windows/Node 24: không chờ ⇒ sập ~50% với selfimprove-route/ux4, chờ ≥ 20 ms ⇒ 8/8 lần thoát sạch
  await new Promise((r) => setTimeout(r, 50));
}
