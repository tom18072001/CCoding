#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { Herdr } from './herdr.js';
import { LogStore, verifyChain } from './logger.js';
import { Registry } from './registry.js';
import { RuntimeManager } from './runtimes/index.js';
import { toRuntimeError } from './runtimes/errors.js';
import { createServer } from './server.js';
import { Store } from './store.js';
import { UsageLedger, type UsageDim, type UsageRow } from './usage.js';
import { kpiReport } from './kpi.js';
import { c, fmtDuration, fmtNum, fmtUsd, hexColor, table } from './util/format.js';
import { readJsonFile, readJsonl, writeJsonAtomic } from './util/fsx.js';
import { totalTokens, type ChatMessage, type LogEntry, type RunRequest, type RunResult, type Task, type TaskMode } from './types.js';

const HELP = `
${c.bold('CCoding Office')} — văn phòng AI đa tác tử (điều phối sub-agent, log theo vị trí, đếm token, chạy nền bằng herdr)

${c.bold('Sử dụng:')} ccoding <lệnh> [tùy chọn]

${c.bold('Server & giao diện')}
  serve [--port 7420] [--runtime <id>]     Chạy bộ điều phối + giao diện web (http://127.0.0.1:7420)
  herdr up                                  Dựng workspace "CCoding Office" trong herdr và chạy server nền
  herdr status | herdr down                 Xem / gỡ bố cục herdr

${c.bold('Giao việc')}
  task "<yêu cầu>" [tùy chọn]               Giao nhiệm vụ (qua server nếu đang chạy, nếu không thì chạy trực tiếp)
      --mode auto|department|project|joint  Chế độ (mặc định: auto — tự định tuyến)
      --dept dev|research                    Phòng ban (khi --mode department)
      --project <id>                         Gắn vào dự án (chế độ project)
      --title "<tiêu đề>"   --rounds 0-3   --parallel 1-8   --no-review
      --runtime <id>        --budget <token>   --budget-mode pause|complete   --wait
  cancel <taskId>                            Hủy nhiệm vụ đang chạy
  pause <taskId>                             Tạm dừng (giữ tiến độ)
  resume <taskId> [--add <token>] [--budget-mode pause|complete] [--from review|synthesize] [--rerun S1,S2|all]
                                             Tiếp tục từ checkpoint / làm lại từ review / chạy lại hạng mục
  split <taskId> [--only S1,S2] [--budget <token>] [--budget-mode pause|complete]
                                             Tách hạng mục chưa xong thành nhiệm vụ riêng (mỗi nhiệm vụ một gói việc)
  status                                     Danh sách nhiệm vụ & trạng thái agent
  show <taskId>                              Chi tiết một nhiệm vụ

${c.bold('Log & token')}
  logs [-f] [--agent id] [--dept id] [--task id] [-n 50]   Xem / theo dõi log
  logs verify                               Kiểm tra chuỗi băm (log có bị sửa không)
  usage [--by agent|department|task|project|model|runtime|day|phase] [--task id] [--dept id] [--watch] [--json]
  kpi [--task id,id] [--days 7] [--dept id] [--project id] [--json]   KPI từng sub-agent (chất lượng, hiệu quả, tin cậy, tuân thủ) + việc cần sửa

${c.bold('Nhân sự & dự án')}
  agents [--dept id]                         Danh sách agent theo phòng ban
  projects                                   Danh sách dự án
  project add <id> --name "<tên>" [--dept auto|dev|research|joint] [--class internal] [--path <dir>] [--runtime <id>]
  project rm <id>
  doctor                                     Kiểm tra môi trường (node, runtime, herdr…)
`;

const config = loadConfig();
const base = `http://127.0.0.1:${config.server.port}`;

async function api<T = any>(p: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
  if (config.server.token) headers.authorization = `Bearer ${config.server.token}`;
  const res = await fetch(base + p, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(15000) });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* text */
  }
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${text.slice(0, 200)}`);
  return body as T;
}

async function serverUp(): Promise<boolean> {
  try {
    await api('/api/health', { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

function localTime(iso: string, withDate = false): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const t = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return withDate ? `${p(d.getDate())}/${p(d.getMonth() + 1)} ${t}` : t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusColor(s: string): string {
  const map: Record<string, (x: string) => string> = { done: c.green, running: c.cyan, queued: c.yellow, paused: c.magenta, failed: c.red, cancelled: c.gray, working: c.cyan, thinking: c.blue, discussing: c.magenta, reviewing: c.yellow, error: c.red, idle: c.gray };
  return (map[s] ?? ((x: string) => x))(s);
}

function printMessage(m: ChatMessage, names: Map<string, string>): void {
  const who = m.from === 'system' ? 'hệ thống' : `${names.get(m.from) ?? m.from} (@${m.from})`;
  const tag = { plan: '📋', discussion: '💬', decision: '✅', handoff: '📦', review: '🔍', final: '🏁', system: 'ℹ️ ' }[m.kind] ?? '•';
  console.log(`${c.gray(localTime(m.ts))} ${tag} ${c.bold(who)} ${c.gray(`[${m.department}]`)}\n   ${m.text.split('\n').join('\n   ')}`);
}

function taskRow(t: Task): string[] {
  return [t.id, statusColor(t.status), t.phase ?? '', t.mode, t.departments.join('→') || t.department || '', fmtNum(totalTokens(t.usage)), t.title.slice(0, 50)];
}

// ── Lệnh ────────────────────────────────────────────────────────────────────

async function cmdServe(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { port: { type: 'string' }, host: { type: 'string' }, runtime: { type: 'string' } }, allowPositionals: true });
  const overrides: Partial<Config> = {};
  if (values.port) overrides.server = { ...config.server, port: Number(values.port) };
  if (values.host) overrides.server = { ...(overrides.server ?? config.server), host: values.host };
  if (values.runtime) overrides.runtime = { ...config.runtime, default: values.runtime };
  const app = createApp(overrides);
  const srv = createServer(app);
  const { host, port } = app.config.server;
  srv.listen(port, host, () => {
    console.log(`\n${c.bold('🏢 CCoding Office')} đang chạy tại ${c.cyan(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`)}`);
    console.log(`   runner: ${app.orchestrator.runner}${app.herdr.insideHerdr() ? ' (trong herdr)' : ''} · agent: ${app.registry.agents.size} · phòng ban: ${app.registry.departments.size} · dữ liệu: ${app.config.dataDir}`);
    for (const e of app.registry.errors) console.log(c.yellow(`   ⚠ ${e}`));
    app.logs.write({ level: 'info', kind: 'server.start', msg: `Server khởi động tại ${host}:${port} (runner ${app.orchestrator.runner})` });
    void app.runtimes.status().then((list) => {
      for (const r of list) console.log(`   ${r.ok ? c.green('●') : c.gray('○')} ${r.id.padEnd(14)} ${c.gray(r.detail)}`);
      console.log(`   runtime mặc định: ${app.config.runtime.default}\n`);
    });
  });
  srv.on('error', (e: NodeJS.ErrnoException) => {
    console.error(c.red(e.code === 'EADDRINUSE' ? `Cổng ${port} đang bận — có thể server đã chạy rồi (ccoding status).` : e.message));
    process.exit(1);
  });
  const stop = () => {
    app.store.flush();
    app.logs.write({ level: 'info', kind: 'server.stop', msg: 'Server dừng' });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function cmdTask(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      mode: { type: 'string' },
      dept: { type: 'string' },
      project: { type: 'string' },
      title: { type: 'string' },
      rounds: { type: 'string' },
      parallel: { type: 'string' },
      'no-review': { type: 'boolean' },
      runtime: { type: 'string' },
      budget: { type: 'string' },
      'budget-mode': { type: 'string' },
      wait: { type: 'boolean', short: 'w' },
      local: { type: 'boolean' },
    },
  });
  const brief = positionals.join(' ').trim();
  if (!brief) throw new Error('Thiếu nội dung nhiệm vụ. Ví dụ: ccoding task "Thiết kế pipeline Logstash cho log IIS" --dept dev');
  const input = {
    brief,
    title: values.title,
    mode: (values.mode as TaskMode | undefined) ?? (values.project ? 'project' : values.dept ? 'department' : 'auto'),
    department: values.dept,
    projectId: values.project,
    options: {
      ...(values.rounds !== undefined ? { discussionRounds: Number(values.rounds) } : {}),
      ...(values.parallel !== undefined ? { maxParallel: Number(values.parallel) } : {}),
      ...(values['no-review'] ? { review: false } : {}),
      ...(values.runtime ? { runtime: values.runtime } : {}),
      ...(values.budget ? { budgetTokens: Number(values.budget) } : {}),
      ...(values['budget-mode'] ? { budgetMode: values['budget-mode'] as 'pause' | 'complete' } : {}),
    },
  };

  if (!values.local && (await serverUp())) {
    const t = await api<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
    console.log(`${c.green('✓')} Đã giao ${c.bold(t.id)} — theo dõi tại ${c.cyan(base)}`);
    if (!values.wait) return;
    const state = await api('/api/state');
    const names = new Map<string, string>(state.agents.map((a: { id: string; name: string }) => [a.id, a.name]));
    let seen = 0;
    for (;;) {
      const d = await api<{ task: Task; transcript: ChatMessage[] }>(`/api/tasks/${t.id}`);
      for (const m of d.transcript.slice(seen)) printMessage(m, names);
      seen = d.transcript.length;
      if (['done', 'failed', 'cancelled', 'paused'].includes(d.task.status)) return finishTask(d.task, path.join(config.dataDir, 'runs', t.id));
      await sleep(1500);
    }
  }

  // Chế độ độc lập: chạy ngay trong tiến trình này
  const app = createApp();
  const names = new Map([...app.registry.agents.values()].map((a) => [a.id, a.name]));
  app.bus.subscribe((ev) => {
    if (ev.type === 'message') printMessage(ev.message, names);
    if (ev.type === 'log' && ev.entry.kind === 'phase') console.log(c.gray(`── ${ev.entry.msg}`));
    if (ev.type === 'log' && ev.entry.kind === 'runtime.fallback') console.log(c.yellow(`⚠ ${ev.entry.msg}`));
  });
  console.log(c.gray('(server chưa chạy — thực thi trực tiếp trong terminal này)'));
  const t = app.orchestrator.submit(input);
  console.log(`${c.green('✓')} ${c.bold(t.id)}: ${t.title}`);
  const done = await app.orchestrator.waitFor(t.id);
  app.store.flush();
  finishTask(done, app.store.runDir(t.id));
}

function finishTask(t: Task, runDir: string): void {
  console.log(`\n${c.bold('Kết thúc')} ${t.id}: ${statusColor(t.status)}${t.error ? c.red(` — ${t.error}`) : ''}${t.pause ? c.yellow(` — ${t.pause.detail} (tiếp tục: ccoding resume ${t.id})`) : ''}`);
  console.log(`Token: in ${fmtNum(t.usage.input)} · out ${fmtNum(t.usage.output)} · cache ${fmtNum(t.usage.cacheRead)} · ${t.usage.calls} lượt${t.usage.costUsd ? ` · ${fmtUsd(t.usage.costUsd)}` : ''}`);
  if (t.finalPath) console.log(`Báo cáo: ${c.cyan(path.join(runDir, t.finalPath))}`);
  if (t.status !== 'done') process.exitCode = 1;
}

async function cmdStatus(): Promise<void> {
  if (await serverUp()) {
    const s = await api('/api/state');
    console.log(c.bold(`Nhiệm vụ (runner: ${s.runner})`));
    console.log(table(['ID', 'Trạng thái', 'Pha', 'Chế độ', 'Phòng', 'Token', 'Tiêu đề'], s.tasks.slice(0, 15).map(taskRow), ['l', 'l', 'l', 'l', 'l', 'r']));
    console.log(`\n${c.bold('Nhân sự')}`);
    const rows = s.agents.map((a: any) => [
      hexColor(a.look.shirt, '■') + ' ' + a.name,
      a.id,
      a.department,
      statusColor(a.state?.status ?? 'idle'),
      (a.state?.activity ?? '').slice(0, 40),
      fmtNum(a.usage ? a.usage.input : 0),
      fmtNum(a.usage ? a.usage.output : 0),
    ]);
    console.log(table(['Vị trí', 'ID', 'Phòng', 'Trạng thái', 'Đang làm', 'In', 'Out'], rows, ['l', 'l', 'l', 'l', 'l', 'r', 'r']));
    return;
  }
  const logs = new LogStore(config.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
  const store = new Store(config.dataDir, logs);
  console.log(c.gray('(server không chạy — đọc từ đĩa)'));
  console.log(table(['ID', 'Trạng thái', 'Pha', 'Chế độ', 'Phòng', 'Token', 'Tiêu đề'], store.list().slice(0, 15).map(taskRow), ['l', 'l', 'l', 'l', 'l', 'r']));
}

async function cmdShow(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Cần taskId');
  const runDir = path.join(config.dataDir, 'runs', id);
  const t = readJsonFile<Task | null>(path.join(runDir, 'task.json'), null);
  if (!t) throw new Error(`Không có nhiệm vụ ${id}`);
  console.log(`${c.bold(t.id)} — ${t.title}\n${statusColor(t.status)} · ${t.mode} · ${t.departments.join(' → ')} · dữ liệu: ${t.classification}`);
  if (t.routing) console.log(c.gray(`Định tuyến: ${t.routing.reason} (bởi ${t.routing.by})`));
  for (const r of t.runs) {
    console.log(`\n${c.bold(r.department)} — ${statusColor(r.status)} · ${fmtNum(totalTokens(r.usage))} token`);
    console.log(
      table(
        ['Mã', 'Hạng mục', 'Phụ trách', 'Trạng thái', 'In', 'Out', 'File'],
        r.subtasks.map((s) => [s.id, s.title.slice(0, 40), s.assignee, statusColor(s.status), fmtNum(s.usage.input), fmtNum(s.usage.output), s.output ?? '']),
        ['l', 'l', 'l', 'l', 'r', 'r'],
      ),
    );
    if (r.review) console.log(`Review: ${r.review.approved ? c.green('duyệt') : c.yellow('cần sửa')} — ${r.review.summary}`);
  }
  if (t.finalPath) console.log(`\nBáo cáo: ${c.cyan(path.join(runDir, t.finalPath))}`);
}

function fmtLog(e: LogEntry): string {
  const lv = { info: c.blue('INF'), warn: c.yellow('WRN'), error: c.red('ERR'), debug: c.gray('DBG') }[e.level] ?? e.level;
  const scope = [e.department, e.agentId].filter(Boolean).join('/');
  return `${c.gray(localTime(e.ts, true))} ${lv} ${c.cyan(scope.padEnd(24).slice(0, 24))} ${e.msg}${e.taskId ? c.gray(` ${e.taskId}`) : ''}`;
}

async function cmdLogs(args: string[]): Promise<void> {
  if (args[0] === 'verify') return cmdVerify();
  const { values } = parseArgs({
    args,
    options: { follow: { type: 'boolean', short: 'f' }, agent: { type: 'string' }, dept: { type: 'string' }, task: { type: 'string' }, n: { type: 'string', short: 'n' }, level: { type: 'string' } },
  });
  const logs = new LogStore(config.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
  const file = values.task ? logs.fileFor('task', values.task) : values.agent ? logs.fileFor('agent', values.agent) : values.dept ? logs.fileFor('department', values.dept) : logs.fileFor('system');
  const label = values.task ?? values.agent ?? values.dept ?? 'toàn hệ thống';
  console.log(c.bold(`📜 Log ${label}`) + c.gray(` — ${file}`));
  const keep = (e: LogEntry) => !values.level || e.level === values.level;
  for (const e of readJsonl<LogEntry>(file, Number(values.n ?? 40))) if (keep(e)) console.log(fmtLog(e));
  if (!values.follow) return;
  let size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let rest = '';
  for (;;) {
    await sleep(700);
    if (!fs.existsSync(file)) continue;
    const st = fs.statSync(file);
    if (st.size < size) size = 0;
    if (st.size === size) continue;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(st.size - size);
    fs.readSync(fd, buf, 0, buf.length, size);
    fs.closeSync(fd);
    size = st.size;
    const text = rest + buf.toString('utf8');
    const lines = text.split('\n');
    rest = lines.pop() ?? '';
    for (const l of lines) {
      try {
        const e = JSON.parse(l) as LogEntry;
        if (keep(e)) console.log(fmtLog(e));
      } catch {
        /* bỏ qua */
      }
    }
  }
}

function cmdVerify(): void {
  const files: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) files.push(p);
    }
  };
  walk(config.dataDir);
  let bad = 0;
  for (const f of files) {
    const r = verifyChain(f);
    if (!r.ok) bad++;
    console.log(`${r.ok ? c.green('✓') : c.red('✗')} ${path.relative(config.dataDir, f)} — ${r.lines} dòng${r.ok ? '' : c.red(` · lỗi ở dòng ${r.brokenAt}: ${r.reason}`)}`);
  }
  console.log(bad ? c.red(`\n${bad} file có dấu hiệu bị sửa/hỏng`) : c.green(`\nToàn vẹn: ${files.length} file hợp lệ`));
  if (bad) process.exitCode = 2;
}

function usageTable(rows: UsageRow[], label: string, names?: Map<string, string>): string {
  return table(
    [label, 'Input', 'Output', 'Cache đọc', 'Cache ghi', 'Tổng', 'Lượt', 'Chi phí'],
    rows.map((r) => [
      names?.get(r.key) ? `${names.get(r.key)} (${r.key})` : r.key,
      fmtNum(r.input),
      fmtNum(r.output),
      fmtNum(r.cacheRead),
      fmtNum(r.cacheWrite),
      c.bold(fmtNum(r.total)),
      `${r.calls}${r.estimatedCalls ? c.gray(` (≈${r.estimatedCalls})`) : ''}`,
      fmtUsd(r.costUsd),
    ]),
    ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
  );
}

async function cmdUsage(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { by: { type: 'string' }, task: { type: 'string' }, dept: { type: 'string' }, agent: { type: 'string' }, project: { type: 'string' }, watch: { type: 'boolean' }, json: { type: 'boolean' } },
  });
  const registry = new Registry(config.agentsDir, config.departmentsDir);
  const names = new Map([...registry.agents.values()].map((a) => [a.id, a.name]));
  const render = () => {
    const ledger = new UsageLedger(config.dataDir);
    const filter = { task: values.task, department: values.dept, agent: values.agent, project: values.project };
    if (values.json) {
      console.log(JSON.stringify({ total: ledger.total(filter), rows: ledger.summary((values.by ?? 'agent') as UsageDim, filter) }, null, 2));
      return;
    }
    const t = ledger.total(filter);
    const out: string[] = [];
    out.push(`${c.bold('🔢 Bộ đếm token')} ${c.gray(new Date().toLocaleString('vi-VN'))}${values.task ? ` · task ${values.task}` : ''}${values.dept ? ` · phòng ${values.dept}` : ''}`);
    out.push(`Tổng: in ${c.bold(fmtNum(t.input))} · out ${c.bold(fmtNum(t.output))} · cache đọc ${fmtNum(t.cacheRead)} · ghi ${fmtNum(t.cacheWrite)} · ${t.calls} lượt${t.estimatedCalls ? c.gray(` (${t.estimatedCalls} ước lượng)`) : ''}${t.costUsd ? ` · ${fmtUsd(t.costUsd)}` : ''}\n`);
    if (values.by) {
      out.push(usageTable(ledger.summary(values.by as UsageDim, filter), values.by, values.by === 'agent' ? names : undefined));
    } else {
      out.push(c.bold('Theo phòng ban'), usageTable(ledger.summary('department', filter), 'Phòng'), '');
      out.push(c.bold('Theo agent'), usageTable(ledger.summary('agent', filter).slice(0, 20), 'Agent', names), '');
      if (!values.task) out.push(c.bold('Theo nhiệm vụ (10 gần nhất theo khối lượng)'), usageTable(ledger.summary('task', filter).slice(0, 10), 'Task'));
    }
    if (values.watch) process.stdout.write('\x1b[2J\x1b[H');
    console.log(out.join('\n'));
  };
  render();
  if (!values.watch) return;
  for (;;) {
    await sleep(2500);
    render();
  }
}

function cmdKpi(args: string[]): void {
  const { values } = parseArgs({ args, options: { task: { type: 'string' }, days: { type: 'string' }, dept: { type: 'string' }, project: { type: 'string' }, json: { type: 'boolean' } } });
  const logs = new LogStore(config.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
  const store = new Store(config.dataDir, logs);
  const registry = new Registry(config.agentsDir, config.departmentsDir);
  const rep = kpiReport({ store, registry, config }, { tasks: values.task?.split(','), days: values.days ? Number(values.days) : undefined, department: values.dept, project: values.project });
  if (values.json) {
    console.log(JSON.stringify(rep, null, 2));
    return;
  }
  console.log(`${c.bold('📊 KPI sub-agent')} · ${rep.tasks.length} nhiệm vụ · ${c.gray(new Date().toLocaleString('vi-VN'))}\n`);
  for (const d of rep.departments) console.log(`${c.bold(d.id)}: điểm ${d.score} (theo token) · ${d.agents} agent · ${fmtNum(d.tokens)} token · ${d.calls} lượt`);
  console.log('');
  const grade = (g: string) => (g === 'A' ? c.green(g) : g === 'B' ? c.cyan(g) : g === 'C' ? c.yellow(g) : c.red(g));
  console.log(
    table(
      ['Agent', 'Phòng', 'Điểm', 'CL', 'HQ', 'TC', 'TT', 'Hạng mục', 'Lần chạy', 'Token', 'Công cụ lỗi'],
      rep.agents
        .filter((k) => k.calls || k.subtasks)
        .map((k) => [k.agentId, k.department, `${k.score} ${grade(k.grade)}`, String(k.scores.quality ?? '—'), String(k.scores.efficiency ?? '—'), String(k.scores.reliability ?? '—'), String(k.scores.compliance ?? '—'), String(k.subtasks), String(k.attemptsAvg || '—'), fmtNum(k.tokens.total), k.tools.calls ? `${k.tools.failed}/${k.tools.calls}` : '—']),
    ),
  );
  console.log(c.gray('CL = chất lượng · HQ = hiệu quả · TC = tin cậy · TT = tuân thủ mẫu đầu ra/bằng chứng\n'));
  for (const k of rep.agents.filter((x) => x.findings.length)) {
    console.log(`${c.bold(k.agentId)} (${k.score} ${grade(k.grade)})`);
    for (const f of k.findings) console.log(`  - ${f}`);
  }
}

function cmdAgents(args: string[]): void {
  const { values } = parseArgs({ args, options: { dept: { type: 'string' } } });
  const registry = new Registry(config.agentsDir, config.departmentsDir);
  for (const e of registry.errors) console.log(c.yellow(`⚠ ${e}`));
  const groups = [...registry.departments.values()].map((d) => ({ id: d.id, name: d.name, color: d.color, members: registry.members(d.id) }));
  const router = registry.router();
  if (router && !values.dept) groups.unshift({ id: 'office', name: 'Văn phòng điều phối', color: '#991b1b', members: [router] });
  for (const g of groups.filter((x) => !values.dept || x.id === values.dept)) {
    console.log(`\n${hexColor(g.color, '██')} ${c.bold(g.name)} ${c.gray(`(${g.id})`)}`);
    console.log(
      table(
        ['ID', 'Vị trí', 'Vai trò', 'Model', 'Kỹ năng'],
        g.members.map((a) => [hexColor(a.look.shirt, a.id), a.title.slice(0, 48), a.role, a.model, a.skills.slice(0, 5).join(', ')]),
      ),
    );
  }
}

async function cmdProjects(args: string[]): Promise<void> {
  const logs = new LogStore(config.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
  const store = new Store(config.dataDir, logs);
  const sub = args[0];
  if (sub === 'add') {
    const { values, positionals } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      options: { name: { type: 'string' }, dept: { type: 'string' }, class: { type: 'string' }, path: { type: 'string' }, runtime: { type: 'string' }, desc: { type: 'string' }, budget: { type: 'string' } },
    });
    const id = positionals[0];
    if (!id) throw new Error('Cần id dự án');
    const body = { id, name: values.name ?? id, department: values.dept ?? 'auto', classification: values.class ?? config.dataProtection.defaultClassification, workspace: values.path, runtime: values.runtime, description: values.desc, budgetTokens: values.budget ? Number(values.budget) : undefined };
    if (await serverUp()) await api('/api/projects', { method: 'POST', body: JSON.stringify(body) });
    else store.saveProject({ ...body, classification: body.classification as any, createdAt: new Date().toISOString() });
    console.log(`${c.green('✓')} Đã lưu dự án ${id}`);
    return;
  }
  if (sub === 'rm') {
    if (!args[1]) throw new Error('Cần id dự án');
    console.log(store.removeProject(args[1]) ? `${c.green('✓')} Đã xóa ${args[1]}` : c.yellow('Không có dự án đó'));
    return;
  }
  console.log(
    table(
      ['ID', 'Tên', 'Phòng', 'Phân loại', 'Runtime', 'Workspace'],
      store.projects().map((p) => [p.id, p.name, p.department ?? 'auto', p.classification, p.runtime ?? '(mặc định)', p.workspace ?? `workspaces/${p.id}`]),
    ),
  );
}

async function cmdDoctor(): Promise<void> {
  const ok = (b: boolean) => (b ? c.green('✓') : c.red('✗'));
  const major = Number(process.versions.node.split('.')[0]);
  console.log(`${ok(major >= 22)} Node.js ${process.versions.node} ${major >= 22 ? '' : c.red('(cần ≥ 22)')}`);
  console.log(`${ok(fs.existsSync(path.join(config.root, 'ccoding.config.json')))} Cấu hình: ${path.join(config.root, 'ccoding.config.json')}${fs.existsSync(path.join(config.root, 'ccoding.local.json')) ? ' + ccoding.local.json' : ''}`);
  const registry = new Registry(config.agentsDir, config.departmentsDir);
  console.log(`${ok(registry.errors.length === 0)} ${registry.agents.size} agent · ${registry.departments.size} phòng ban${registry.errors.length ? c.yellow(` · ${registry.errors.length} cảnh báo`) : ''}`);
  for (const e of registry.errors) console.log(c.yellow(`   ⚠ ${e}`));
  const rm = new RuntimeManager(config);
  console.log(c.bold('\nRuntime (thứ tự auto: ') + config.runtime.order.join(' → ') + c.bold(')'));
  for (const r of await rm.status(true)) {
    const allow = (['public', 'internal', 'confidential', 'restricted'] as const).filter((cl) => rm.allowed(r.id, cl)).join(',');
    console.log(`  ${r.ok ? c.green('●') : c.gray('○')} ${r.id.padEnd(14)} ${r.label.padEnd(24)} ${c.gray(r.detail)} ${c.gray(`[${r.local ? 'cục bộ' : 'gửi ra ngoài'} · cho phép: ${allow}]`)}`);
  }
  const h = new Herdr(config);
  const v = await h.version();
  console.log(c.bold('\nherdr'));
  console.log(`  ${ok(!!v)} ${v ?? 'chưa cài — xem docs/HERDR.md'}`);
  if (v) console.log(`  ${ok(await h.serverRunning())} server phiên "${config.herdr.session}"`);
  console.log(c.bold('\nServer'));
  console.log(`  ${ok(await serverUp())} ${base}`);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.accessSync(config.dataDir, fs.constants.W_OK);
    console.log(`  ${ok(true)} Thư mục dữ liệu ghi được: ${config.dataDir}`);
  } catch {
    console.log(`  ${ok(false)} Không ghi được ${config.dataDir}`);
  }
}

async function cmdHerdr(args: string[]): Promise<void> {
  const h = new Herdr(config);
  const sub = args[0] ?? 'status';
  if (!(await h.version())) throw new Error('Chưa cài herdr. Windows: powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"');
  if (sub === 'up') {
    if (!fs.existsSync(path.join(config.root, 'dist', 'cli.js'))) throw new Error('Chưa build — chạy `npm install` (hoặc `npm run build`) trước');
    const registry = new Registry(config.agentsDir, config.departmentsDir);
    const running = await serverUp();
    const notes = await h.up([...registry.departments.values()], { startServer: !running });
    for (const n of notes) console.log(`${c.green('✓')} ${n}`);
    if (running) console.log(c.gray('Server CCoding đang chạy — giữ nguyên.'));
    else if (h.state.serverPaneId && !notes.some((n) => n.startsWith('Tạo workspace'))) {
      await h.exec(['pane', 'run', h.state.serverPaneId, `node "${path.join(config.root, 'dist', 'cli.js')}" serve`]).catch(() => undefined);
      console.log(`${c.green('✓')} Khởi động lại server trong pane ${h.state.serverPaneId}`);
    }
    for (let i = 0; i < 20 && !(await serverUp()); i++) await sleep(500);
    console.log(`\n${c.bold('Xong.')} Giao diện: ${c.cyan(base)}`);
    console.log(`Vào văn phòng trong terminal: ${c.bold(`herdr --session ${config.herdr.session}`)}  ·  thoát nhưng vẫn chạy nền: ${c.bold('ctrl+b q')}`);
    return;
  }
  if (sub === 'down') {
    await h.down();
    console.log(`${c.green('✓')} Đã đóng workspace CCoding trong herdr`);
    return;
  }
  console.log(`herdr ${await h.version()} · phiên ${config.herdr.session} · server ${(await h.serverRunning()) ? c.green('đang chạy') : c.gray('tắt')}`);
  console.log(JSON.stringify(h.state, null, 2));
  if (await h.serverRunning()) {
    const a = await h.listAgents().catch(() => undefined);
    if (a) console.log(JSON.stringify(a.result?.agents?.map((x: any) => ({ agent: x.agent, status: x.agent_status, pane: x.pane_id, tokens: x.tokens })) ?? a, null, 2));
  }
}

/** Chạy một lượt làm việc của agent bên trong pane herdr (do bộ điều phối gọi). */
async function cmdAgentExec(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { job: { type: 'string' } } });
  if (!values.job) throw new Error('--job bắt buộc');
  const job = readJsonFile<{ runtime: string; request: RunRequest; resultFile: string; paneId?: string } | null>(values.job, null);
  if (!job) throw new Error(`Không đọc được job ${values.job}`);
  const rm = new RuntimeManager(config);
  const rt = rm.get(job.runtime);
  const req = job.request;
  const a = req.agent;
  const h = new Herdr(config);
  const pane = process.env.HERDR_PANE_ID ?? job.paneId;
  console.log(`\n${hexColor(a.look.shirt, '██')} ${c.bold(a.title)}`);
  console.log(c.gray(`${req.meta.taskId}${req.meta.subtaskId ? ` · ${req.meta.subtaskId}` : ''} · pha ${req.phase} · ${job.runtime}/${req.model} · ${req.cwd}`));
  console.log(c.gray('─'.repeat(60)));
  if (pane) await h.reportAgent(pane, a, 'working', `${req.phase}${req.meta.subtaskId ? ` ${req.meta.subtaskId}` : ''}`);
  let result: RunResult;
  try {
    if (!rt) throw new Error(`Runtime ${job.runtime} không tồn tại`);
    result = await rt.run(req, {
      onText: (t) => process.stdout.write(t),
      onActivity: (t) => process.stdout.write(`\n${c.gray(`  ⚙ ${t}`)}\n`),
    });
    result = rm.applyPricing(result);
  } catch (e) {
    const re = toRuntimeError(e);
    const pu = re.partial;
    result = {
      text: '',
      usage: { input: pu?.input ?? 0, output: pu?.output ?? 0, cacheRead: pu?.cacheRead ?? 0, cacheWrite: 0, costUsd: 0 },
      estimated: false,
      model: pu?.model ?? req.model,
      runtime: job.runtime,
      durationMs: 0,
      error: re.message,
      errorKind: re.kind,
      retryAt: re.retryAt,
      turns: pu?.turns,
      toolCalls: pu?.toolCalls,
    };
  }
  writeJsonAtomic(job.resultFile, result);
  console.log(c.gray('─'.repeat(60)));
  console.log(`${result.error ? c.red(`✗ ${result.error}`) : c.green('✓ xong')} · in ${fmtNum(result.usage.input)} · out ${fmtNum(result.usage.output)} · ${fmtDuration(result.durationMs)}`);
  if (pane) await h.reportAgent(pane, a, 'idle');
}

async function cmdPause(args: string[]): Promise<void> {
  if (!args[0]) throw new Error('Cần taskId');
  if (!(await serverUp())) throw new Error('Server không chạy');
  await api(`/api/tasks/${args[0]}/pause`, { method: 'POST', body: '{}' });
  console.log(`${c.green('✓')} Đã yêu cầu tạm dừng ${args[0]} (các lượt đang chạy sẽ làm nốt)`);
}

async function cmdResume(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { add: { type: 'string' }, budget: { type: 'string' }, 'budget-mode': { type: 'string' }, from: { type: 'string' }, rerun: { type: 'string' } } });
  if (!positionals[0]) throw new Error('Cần taskId');
  if (!(await serverUp())) throw new Error('Server không chạy');
  const body = {
    addBudget: values.add ? Number(values.add) : undefined,
    budgetTokens: values.budget ? Number(values.budget) : undefined,
    budgetMode: values['budget-mode'],
    from: values.from,
    rerun: values.rerun ? (values.rerun === 'all' ? 'all' : values.rerun.split(',')) : undefined,
  };
  const t = await api<Task>(`/api/tasks/${positionals[0]}/resume`, { method: 'POST', body: JSON.stringify(body) });
  console.log(`${c.green('✓')} Tiếp tục ${t.id} — ngân sách ${fmtNum(t.options.budgetTokens)} · ${t.options.budgetMode === 'complete' ? 'chạy tới khi hoàn thành' : 'dừng khi chạm trần'}`);
}

async function cmdSplit(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { only: { type: 'string' }, budget: { type: 'string' }, 'budget-mode': { type: 'string' } } });
  if (!positionals[0]) throw new Error('Cần taskId');
  if (!(await serverUp())) throw new Error('Server không chạy');
  const body = { subtasks: values.only ? values.only.split(',') : undefined, budgetTokens: values.budget ? Number(values.budget) : undefined, budgetMode: values['budget-mode'] };
  const r = await api<{ task: Task; created: Task[] }>(`/api/tasks/${positionals[0]}/split`, { method: 'POST', body: JSON.stringify(body) });
  console.log(`${c.green('✓')} Đã tách ${r.created.length} nhiệm vụ từ ${r.task.id}:`);
  for (const t of r.created) console.log(`  ${t.id}  ${t.title}  · ngân sách ${fmtNum(t.options.budgetTokens)}${t.after?.length ? c.dim(` · chờ ${t.after.join(', ')}`) : ''}`);
}

async function cmdCancel(args: string[]): Promise<void> {
  if (!args[0]) throw new Error('Cần taskId');
  if (!(await serverUp())) throw new Error('Server không chạy');
  await api(`/api/tasks/${args[0]}/cancel`, { method: 'POST', body: '{}' });
  console.log(`${c.green('✓')} Đã gửi lệnh hủy ${args[0]}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'serve':
    case 'start':
      return cmdServe(rest);
    case 'task':
      return cmdTask(rest);
    case 'status':
    case 'tasks':
      return cmdStatus();
    case 'show':
      return cmdShow(rest);
    case 'logs':
    case 'log':
      return cmdLogs(rest);
    case 'usage':
    case 'tokens':
      return cmdUsage(rest);
    case 'kpi':
      return cmdKpi(rest);
    case 'agents':
      return cmdAgents(rest);
    case 'projects':
      return cmdProjects([]);
    case 'project':
      return cmdProjects(rest);
    case 'doctor':
      return cmdDoctor();
    case 'herdr':
      return cmdHerdr(rest);
    case 'agent-exec':
      return cmdAgentExec(rest);
    case 'cancel':
      return cmdCancel(rest);
    case 'pause':
      return cmdPause(rest);
    case 'resume':
      return cmdResume(rest);
    case 'split':
      return cmdSplit(rest);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    default:
      console.error(c.red(`Lệnh không rõ: ${cmd}`));
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e: Error) => {
  console.error(c.red(`✗ ${e.message}`));
  process.exitCode = 1;
});

