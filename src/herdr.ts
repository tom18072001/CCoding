import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { quickRun, resolveCommand, runProcess } from './runtimes/spawn.js';
import { readJsonFile, writeJsonAtomic } from './util/fsx.js';
import type { Config } from './config.js';
import type { AgentDef, DepartmentDef, Usage } from './types.js';
import { totalTokens } from './types.js';

interface HerdrState {
  session: string;
  workspaceId?: string;
  officeTabId?: string;
  serverPaneId?: string;
  tabs: Record<string, string>; // dept -> tab id
  tabPanes: Record<string, string[]>; // dept -> pane ids (theo thứ tự tạo)
  panes: Record<string, string>; // agent -> pane id
  serviceTabId?: string;
  servicePanes?: Record<string, string>; // nhãn dịch vụ -> pane id
}

/**
 * Tích hợp herdr (agent multiplexer chạy trong terminal):
 *  - `ccoding herdr up` dựng workspace "CCoding Office": server, log, token, mỗi phòng ban một tab.
 *  - Runner "herdr": mỗi agent có pane riêng; lượt làm việc chạy thật trong pane đó và
 *    báo trạng thái (working/idle) + số token lên sidebar của herdr.
 *  - Tách (ctrl+b q) thì mọi thứ vẫn chạy nền; gõ `herdr --session ccoding` để vào lại.
 */
export class Herdr {
  private stateFile: string;
  state: HerdrState;

  constructor(private config: Config) {
    this.stateFile = path.join(config.dataDir, 'herdr.json');
    this.state = readJsonFile<HerdrState>(this.stateFile, { session: config.herdr.session, tabs: {}, tabPanes: {}, panes: {} });
    this.state.tabs ??= {};
    this.state.tabPanes ??= {};
    this.state.panes ??= {};
  }

  bin(): string {
    if (this.config.herdr.bin) return this.config.herdr.bin;
    if (process.env.HERDR_BIN_PATH) return process.env.HERDR_BIN_PATH;
    if (resolveCommand('herdr')) return 'herdr';
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const candidates = [
      path.join(home, '.herdr', 'packages', 'standalone', 'current', 'herdr.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Herdr', 'bin', 'herdr.exe'),
      path.join(home, '.local', 'bin', 'herdr'),
    ];
    return candidates.find((c) => c && fs.existsSync(c)) ?? 'herdr';
  }

  /** Đang chạy bên trong một pane của herdr? */
  insideHerdr(): boolean {
    return process.env.HERDR_ENV === '1' && !!process.env.HERDR_SOCKET_PATH;
  }

  private sessionArgs(): string[] {
    return this.insideHerdr() ? [] : ['--session', this.state.session];
  }

  reload(): void {
    const s = readJsonFile<HerdrState | null>(this.stateFile, null);
    if (s) this.state = { ...s, tabs: s.tabs ?? {}, tabPanes: s.tabPanes ?? {}, panes: s.panes ?? {} };
  }

  private save(): void {
    writeJsonAtomic(this.stateFile, this.state);
  }

  async exec<T = any>(args: string[], timeoutMs = 20000): Promise<T> {
    const r = await runProcess({ cmd: this.bin(), args: [...this.sessionArgs(), ...args], cwd: this.config.root, timeoutMs });
    if (r.code !== 0) throw new Error(`herdr ${args.slice(0, 2).join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    const out = r.stdout.trim();
    if (!out) return {} as T;
    try {
      return JSON.parse(out) as T;
    } catch {
      return { text: out } as T;
    }
  }

  async version(): Promise<string | undefined> {
    const r = await quickRun(this.bin(), ['--version']);
    return r.ok ? r.out : undefined;
  }

  async serverRunning(): Promise<boolean> {
    const r = await quickRun(this.bin(), [...this.sessionArgs(), 'status', 'server']);
    return /status:\s*running/i.test(r.out);
  }

  async ensureServer(): Promise<void> {
    if (await this.serverRunning()) return;
    const child = spawn(this.bin(), [...this.sessionArgs(), 'server'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: this.config.root,
    });
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.serverRunning()) return;
    }
    throw new Error('Không khởi động được herdr server');
  }

  private async alive(paneId?: string): Promise<boolean> {
    if (!paneId) return false;
    try {
      await this.exec(['pane', 'get', paneId], 8000);
      return true;
    } catch {
      return false;
    }
  }

  private cli(args: string): string {
    const js = path.join(this.config.root, 'dist', 'cli.js');
    return `node "${js}" ${args}`;
  }

  /** Dựng bố cục văn phòng trong herdr. Idempotent: gọi lại sẽ chỉ bổ sung phần thiếu. */
  async up(departments: DepartmentDef[], opts: { startServer?: boolean } = {}): Promise<string[]> {
    const notes: string[] = [];
    let startServer = false;
    this.reload();
    await this.ensureServer();
    const root = this.config.root;
    if (!this.state.workspaceId || !(await this.alive(this.state.serverPaneId))) {
      const ws = await this.exec(['workspace', 'create', '--label', this.config.herdr.workspaceLabel, '--cwd', root, '--no-focus']);
      this.state.workspaceId = ws.result.workspace.workspace_id;
      this.state.officeTabId = ws.result.tab.tab_id;
      this.state.serverPaneId = ws.result.root_pane.pane_id;
      this.state.tabs = {};
      this.state.tabPanes = {};
      this.state.panes = {};
      this.state.servicePanes = {};
      this.state.serviceTabId = undefined;
      await this.exec(['tab', 'rename', this.state.officeTabId!, 'Văn phòng']);
      await this.exec(['pane', 'rename', this.state.serverPaneId!, 'server']);
      startServer = opts.startServer !== false;
      const logs = await this.exec(['pane', 'split', this.state.serverPaneId!, '--direction', 'right', '--cwd', root, '--no-focus']);
      const logsPane = logs.result.pane.pane_id;
      await this.exec(['pane', 'rename', logsPane, 'logs']);
      await this.exec(['pane', 'run', logsPane, this.cli('logs -f')]);
      const tok = await this.exec(['pane', 'split', logsPane, '--direction', 'down', '--cwd', root, '--no-focus']);
      const tokPane = tok.result.pane.pane_id;
      await this.exec(['pane', 'rename', tokPane, 'tokens']);
      await this.exec(['pane', 'run', tokPane, this.cli('usage --watch')]);
      notes.push(`Tạo workspace ${this.state.workspaceId}: server + logs + tokens`);
    } else {
      notes.push(`Workspace ${this.state.workspaceId} đã tồn tại`);
    }
    // dịch vụ chạy kèm (Bifrost, Ollama…) — chạy trước server để runtime sẵn sàng
    const services = (this.config.herdr.services ?? []).filter((x) => x.enabled !== false && x.command);
    this.state.servicePanes ??= {};
    for (const svc of services) {
      if (await this.alive(this.state.servicePanes[svc.label])) continue;
      let pane: string;
      if (!this.state.serviceTabId || !(await this.alive(Object.values(this.state.servicePanes)[0]))) {
        const t = await this.exec(['tab', 'create', '--workspace', this.state.workspaceId!, '--label', 'Dịch vụ', '--cwd', svc.cwd ?? root, '--no-focus']);
        this.state.serviceTabId = t.result.tab.tab_id;
        this.state.servicePanes = {};
        pane = t.result.root_pane.pane_id;
      } else {
        const last = Object.values(this.state.servicePanes).at(-1)!;
        const sp = await this.exec(['pane', 'split', last, '--direction', 'down', '--cwd', svc.cwd ?? root, '--no-focus']);
        pane = sp.result.pane.pane_id;
      }
      this.state.servicePanes[svc.label] = pane;
      await this.exec(['pane', 'rename', pane, svc.label]);
      await this.exec(['pane', 'run', pane, svc.command]);
      notes.push(`Dịch vụ ${svc.label}: ${svc.command}`);
    }
    for (const d of departments) {
      if (this.state.tabs[d.id] && (await this.alive(this.state.tabPanes[d.id]?.[0]))) continue;
      await this.ensureDeptTab(d);
      notes.push(`Tab phòng ${d.short}`);
    }
    this.save();
    // chạy server sau cùng để nó đọc được bố cục đã lưu
    if (startServer) await this.exec(['pane', 'run', this.state.serverPaneId!, this.cli('serve')]);
    return notes;
  }

  private async ensureDeptTab(d: DepartmentDef): Promise<string> {
    const existing = this.state.tabs[d.id];
    if (existing && (await this.alive(this.state.tabPanes[d.id]?.[0]))) return existing;
    if (!this.state.workspaceId) throw new Error('Chưa có workspace herdr — chạy `ccoding herdr up` trước');
    const t = await this.exec(['tab', 'create', '--workspace', this.state.workspaceId, '--label', d.short, '--cwd', this.config.root, '--no-focus']);
    const tabId = t.result.tab.tab_id;
    const rootPane = t.result.root_pane.pane_id;
    this.state.tabs[d.id] = tabId;
    this.state.tabPanes[d.id] = [rootPane];
    await this.exec(['pane', 'rename', rootPane, `${d.id}-log`]);
    await this.exec(['pane', 'run', rootPane, this.cli(`logs -f --dept ${d.id}`)]);
    this.save();
    return tabId;
  }

  /** Mỗi agent một pane trong tab phòng ban của mình (tạo khi cần). */
  async ensureAgentPane(agent: AgentDef, dept: DepartmentDef): Promise<string> {
    this.reload();
    const cur = this.state.panes[agent.id];
    if (cur && (await this.alive(cur))) return cur;
    await this.ensureDeptTab(dept);
    const panes = (this.state.tabPanes[dept.id] ??= []);
    const target = panes[panes.length - 1];
    const direction = panes.length % 2 === 1 ? 'right' : 'down';
    const sp = await this.exec(['pane', 'split', target, '--direction', direction, '--cwd', this.config.root, '--no-focus']);
    const paneId = sp.result.pane.pane_id as string;
    panes.push(paneId);
    this.state.panes[agent.id] = paneId;
    await this.exec(['pane', 'rename', paneId, `${agent.name} · ${agent.id}`]);
    this.save();
    return paneId;
  }

  /** Chạy một lượt làm việc của agent trong pane của nó, chờ file kết quả. */
  async runJob(paneId: string, jobFile: string, resultFile: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    fs.rmSync(resultFile, { force: true });
    await this.exec(['pane', 'run', paneId, this.cli(`agent-exec --job "${jobFile}"`)]);
    const deadline = Date.now() + timeoutMs + 30000;
    while (!fs.existsSync(resultFile)) {
      if (signal?.aborted) {
        await this.exec(['pane', 'send-keys', paneId, 'ctrl+c']).catch(() => undefined);
        throw new Error('Đã hủy');
      }
      if (Date.now() > deadline) {
        await this.exec(['pane', 'send-keys', paneId, 'ctrl+c']).catch(() => undefined);
        throw new Error('Hết thời gian chờ pane herdr');
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async reportAgent(paneId: string, agent: AgentDef, state: 'idle' | 'working' | 'blocked', message?: string): Promise<void> {
    const args = ['pane', 'report-agent', paneId, '--source', 'ccoding', '--agent', agent.id, '--state', state];
    if (message) args.push('--message', message.slice(0, 120));
    await this.exec(args, 8000).catch(() => undefined);
  }

  async reportTokens(paneId: string, agent: AgentDef, title: string, u: Usage): Promise<void> {
    await this.exec(
      [
        'pane', 'report-metadata', paneId, '--source', 'ccoding', '--agent', agent.id,
        '--title', title.slice(0, 80), '--display-agent', `${agent.name}`,
        '--token', `in=${u.input}`, '--token', `out=${u.output}`, '--token', `total=${totalTokens(u)}`,
      ],
      8000,
    ).catch(() => undefined);
  }

  async notify(title: string, body: string): Promise<void> {
    if (!this.config.herdr.notify) return;
    await this.exec(['notification', 'show', title.slice(0, 80), '--body', body.slice(0, 200), '--sound', 'done'], 8000).catch(() => undefined);
  }

  async listAgents(): Promise<any> {
    return this.exec(['agent', 'list']);
  }

  async down(): Promise<void> {
    if (this.state.workspaceId) await this.exec(['workspace', 'close', this.state.workspaceId]).catch(() => undefined);
    this.state = { session: this.state.session, tabs: {}, tabPanes: {}, panes: {} };
    this.save();
  }
}
