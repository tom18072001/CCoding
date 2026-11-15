// D24: createApp(overrides, { root, configFile }) — cấu hình thêm tường minh theo từng app (E7b: trần lượt accept khác nhau theo arm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-cfgfile-'));
const mk = (name: string, accept: number) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, JSON.stringify({ phases: { toolTurns: { accept } } }));
  return f;
};
const mkApp = (configFile?: string) => {
  const dataDir = fs.mkdtempSync(path.join(dir, 'data-'));
  const base = loadConfig();
  return createApp({ dataDir, workspacesDir: path.join(dataDir, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, configFile ? { configFile } : {});
};

test('createApp configFile: hai app trong một tiến trình nhận trần lượt accept 6 và 16 theo từng tệp', () => {
  const a = mkApp(mk('r1.json', 6));
  const b = mkApp(mk('r2.json', 16));
  assert.equal(a.config.phases?.toolTurns?.accept, 6);
  assert.equal(b.config.phases?.toolTurns?.accept, 16);
  assert.equal(a.config.phases?.toolTurns?.accept, 6, 'app thứ hai không làm đổi app thứ nhất');
});

test('createApp không truyền configFile: như cũ (giá trị mặc định của cấu hình)', () => {
  const expected = loadConfig().phases?.toolTurns?.accept;
  assert.equal(mkApp().config.phases?.toolTurns?.accept, expected);
});

test('createApp configFile không tồn tại: báo lỗi rõ', () => {
  assert.throws(() => mkApp(path.join(dir, 'khong-co.json')), /Không thấy file cấu hình/);
});
