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
 * Đóng server http theo sự kiện: gọi close(), đóng cả kết nối keep-alive (fetch/undici) bằng closeAllConnections(),
 * rồi chờ sự kiện 'close' của server (hạn an toàn, không thăm dò). Sau đó còn một nhịp đệm 50 ms có số đo (xem dưới). Không đợi thì --test-force-exit thoát giữa lúc handle
 * đang đóng và libuv sập trên Windows (Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\winsync.c).
 * Có hạn an toàn để test không treo vô hạn nếu 'close' không bao giờ tới.
 */
export async function closeServer(srv: import('node:http').Server | import('node:net').Server, limitMs = 5000): Promise<void> {
  if (!srv.listening) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`closeServer: máy chủ không phát sự kiện 'close' sau ${limitMs} ms (còn kết nối hoặc handle chưa đóng)`)), limitMs);
    srv.once('close', () => { clearTimeout(timer); resolve(); });
    srv.close();
    if ('closeAllConnections' in srv) srv.closeAllConnections();
  });
  // Nhịp đệm sau 'close' — CÓ SỐ ĐO (Windows, Node 24, `--test-force-exit`, selfimprove-route + ux4, 8 lần mỗi mức):
  // không nhịp 8/8 sập libuv; một setImmediate 8/8 sập; chờ handle (getActiveResourcesInfo) theo setImmediate 8/8 sập;
  // setTimeout 20 ms 1/6 sập; setTimeout 50 ms 0/8 sập. Handle async nội bộ của libuv cần vài ms thật để đóng xong.
  await new Promise((r) => setTimeout(r, 50));
}
