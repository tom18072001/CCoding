import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** Dựng app với thư mục dữ liệu tạm và runtime mock chạy nhanh. */
export function testApp(extra: { reviewRejectRate?: number; dataDir?: string } = {}): App & { cleanup: () => void } {
  const dataDir = extra.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-test-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: extra.reviewRejectRate ?? 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  return Object.assign(app, { cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) });
}
