import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';
import { Herdr, type LogGroup } from '../src/herdr.js';
import { levelFilter, logFiles, pickLatestTask, recentTasks } from '../src/logview.js';
import { Registry } from '../src/registry.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-logview-'));

function writeTask(dataDir: string, id: string, status: string, ageMs: number): void {
  const dir = path.join(dataDir, 'runs', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify({ id, title: `Nhiệm vụ ${id}`, status }));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"ts":"2026-10-28T00:00:00Z","level":"info","kind":"x","msg":"m"}\n');
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(path.join(dir, 'task.json'), t, t);
  fs.utimesSync(path.join(dir, 'events.jsonl'), t, t);
}

test('levelFilter: mức đúng, "warn+" lấy từ mức đó trở lên, danh sách, lỗi khi sai', () => {
  const f = levelFilter('warn+');
  assert.deepEqual(['debug', 'info', 'warn', 'error'].map((level) => f({ level: level as any })), [false, false, true, true]);
  assert.equal(levelFilter('warn')({ level: 'error' }), false);
  assert.equal(levelFilter('info,error')({ level: 'error' }), true);
  assert.equal(levelFilter()({ level: 'debug' }), true);
  assert.throws(() => levelFilter('loud+'), /không hợp lệ/);
});

test('--task latest: theo nhiệm vụ hoạt động gần nhất, không nhảy giữa hai nhiệm vụ đang chạy', () => {
  const d = tmp();
  try {
    assert.equal(pickLatestTask(d), undefined);
    writeTask(d, 'T-20261028-100000-aaa', 'done', 60_000);
    writeTask(d, 'T-20261028-110000-bbb', 'running', 5_000);
    assert.equal(pickLatestTask(d)?.id, 'T-20261028-110000-bbb');
    assert.equal(recentTasks(d)[0].title, 'Nhiệm vụ T-20261028-110000-bbb');
    // nhiệm vụ cũ được tiếp tục (resume) → có sự kiện mới hơn, nhưng nhiệm vụ đang theo vẫn chạy → giữ nguyên
    writeTask(d, 'T-20261028-100000-aaa', 'running', 0);
    assert.equal(pickLatestTask(d, 'T-20261028-110000-bbb')?.id, 'T-20261028-110000-bbb');
    // nhiệm vụ đang theo đã xong → chuyển sang nhiệm vụ đang hoạt động
    writeTask(d, 'T-20261028-110000-bbb', 'done', 2_000);
    assert.equal(pickLatestTask(d, 'T-20261028-110000-bbb')?.id, 'T-20261028-100000-aaa');
    // nhiệm vụ mới tạo sau nhiệm vụ đang theo → chuyển ngay
    writeTask(d, 'T-20261028-120000-ccc', 'running', 1_000);
    assert.equal(pickLatestTask(d, 'T-20261028-110000-bbb')?.id, 'T-20261028-120000-ccc');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('logFiles: liệt kê log hệ thống, phòng ban, agent và nhiệm vụ', () => {
  const d = tmp();
  try {
    fs.mkdirSync(path.join(d, 'logs', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(d, 'logs', 'departments'), { recursive: true });
    fs.writeFileSync(path.join(d, 'logs', 'system.jsonl'), '{}\n');
    fs.writeFileSync(path.join(d, 'logs', 'departments', 'dev.jsonl'), '{}\n');
    fs.writeFileSync(path.join(d, 'logs', 'agents', 'qa-tester.jsonl'), '{}\n');
    writeTask(d, 'T-20261028-100000-aaa', 'done', 0);
    assert.deepEqual(
      logFiles(d).map((f) => `${f.scope}:${f.id}`),
      ['system:system', 'department:dev', 'agent:qa-tester', 'task:T-20261028-100000-aaa'],
    );
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** herdr giả: ghi lại lệnh, trả JSON như herdr thật cho workspace/tab/pane. */
const FAKE_HERDR = `#!/usr/bin/env node
const fs = require('node:fs');
const file = process.env.FAKE_HERDR_STATE;
const st = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { ws: 0, panes: {}, tabs: {}, calls: [] };
let a = process.argv.slice(2);
if (a[0] === '--session') a = a.slice(2);
st.calls.push(a);
const out = (o) => process.stdout.write(JSON.stringify(o));
const newPane = (w) => { const n = Object.keys(st.panes).filter((p) => p.startsWith(w + ':')).length + 1; const id = w + ':p' + n; st.panes[id] = true; return id; };
const k = a[0] + ' ' + a[1];
let code = 0;
if (a[0] === '--version') process.stdout.write('herdr 0.0-fake');
else if (k === 'status server') process.stdout.write('status: running');
else if (k === 'workspace create') { const w = 'w' + ++st.ws; st.tabs[w] = 1; out({ result: { workspace: { workspace_id: w }, tab: { tab_id: w + ':t1' }, root_pane: { pane_id: newPane(w) } } }); }
else if (k === 'tab create') { const w = a[a.indexOf('--workspace') + 1]; const t = w + ':t' + ++st.tabs[w]; out({ result: { tab: { tab_id: t }, root_pane: { pane_id: newPane(w) } } }); }
else if (k === 'pane split') out({ result: { pane: { pane_id: newPane(a[2].split(':')[0]) } } });
else if (k === 'pane get') code = st.panes[a[2]] ? 0 : 1;
else if (k === 'workspace close') { for (const p of Object.keys(st.panes)) if (p.startsWith(a[2] + ':')) delete st.panes[p]; }
fs.writeFileSync(file, JSON.stringify(st));
process.exit(code);
`;

test('herdr logs: dựng các space log (hệ thống, nhiệm vụ, phòng ban, agent), idempotent, --rebuild dựng lại', async (t) => {
  if (process.platform === 'win32') return t.skip('herdr giả dùng shebang (Linux/macOS)');
  const d = tmp();
  const bin = path.join(d, 'fake-herdr.cjs');
  fs.writeFileSync(bin, FAKE_HERDR, { mode: 0o755 });
  const stateFile = path.join(d, 'fake-state.json');
  process.env.FAKE_HERDR_STATE = stateFile;
  try {
    const base = loadConfig();
    const config = { ...base, dataDir: d, herdr: { ...base.herdr, bin, logSpaces: { enabled: true, agents: true } } };
    const reg = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
    const groups: LogGroup[] = [
      { id: 'office', short: 'Điều phối', agents: [reg.router()!] },
      ...[...reg.departments.values()].map((x) => ({ id: x.id, short: x.short, agents: reg.members(x.id) })),
    ];
    const h = new Herdr(config);
    const notes = await h.upLogSpaces(groups);
    assert.equal(notes.length, 4, notes.join('\n'));
    const spaces = h.state.logSpaces!;
    assert.deepEqual(Object.keys(spaces), ['system', 'tasks', 'departments', 'agents']);
    assert.deepEqual(Object.values(spaces).map((s) => s.label), ['Log · Hệ thống', 'Log · Nhiệm vụ', 'Log · Phòng ban', 'Log · Agent']);
    assert.equal(Object.keys(spaces.departments.panes).length, 3);
    // mỗi phòng một tab, mỗi agent một pane
    assert.deepEqual(Object.keys(spaces.agents.tabs), ['office', 'dev', 'research']);
    assert.equal(Object.keys(spaces.agents.panes).length, 1 + 9 + 6);
    assert.ok(spaces.agents.panes['dev/backend-dev']);
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const runs = st.calls.filter((c: string[]) => c[0] === 'pane' && c[1] === 'run').map((c: string[]) => c[3]);
    assert.ok(runs.some((r: string) => r.endsWith('logs -f --level warn+ -n 40')));
    assert.ok(runs.some((r: string) => r.endsWith('logs -f --task latest -n 60')));
    assert.ok(runs.some((r: string) => r.endsWith('logs -f --agent qa-tester -n 30')));
    // bố cục lưu trong data/herdr.json, cwd của space là thư mục log tương ứng
    assert.ok(fs.existsSync(path.join(d, 'logs', 'agents')));
    const created = st.calls.filter((c: string[]) => c[0] === 'workspace' && c[1] === 'create');
    assert.equal(created[3][created[3].indexOf('--cwd') + 1], path.join(d, 'logs', 'agents'));
    // chia ô cân: 9 agent không split liên tiếp cùng hướng quá 2 lần trên cùng một pane
    const splitsFromRoot = st.calls.filter((c: string[]) => c[1] === 'split' && c[2] === spaces.agents.panes['dev/dev-lead']);
    assert.ok(splitsFromRoot.length <= 4);

    // gọi lại: giữ nguyên
    const again = await h.upLogSpaces(groups);
    assert.ok(again.every((n) => n.includes('đã có')), again.join('\n'));
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).ws, 4);
    // --rebuild: đóng rồi dựng lại
    await h.upLogSpaces(groups, { rebuild: true });
    const st2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(st2.ws, 8);
    assert.equal(st2.calls.filter((c: string[]) => c[0] === 'workspace' && c[1] === 'close').length, 4);
    // tắt space agent
    const h2 = new Herdr({ ...config, herdr: { ...config.herdr, logSpaces: { enabled: true, agents: false } } });
    assert.deepEqual(h2.logSpaceSpecs(groups).map((s) => s.key), ['system', 'tasks', 'departments']);
    assert.equal(await h2.downLogSpaces(), 4);
    assert.deepEqual(h2.state.logSpaces, {});
  } finally {
    delete process.env.FAKE_HERDR_STATE;
    fs.rmSync(d, { recursive: true, force: true });
  }
});
