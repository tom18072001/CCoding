import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile } from './util/fsx.js';
import type { LogEntry, Task, TaskStatus } from './types.js';

/** Thứ bậc mức log: `warn+` = warn và error. */
const RANK: Record<LogEntry['level'], number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Bộ lọc mức log cho `ccoding logs --level`:
 *  - `warn` → đúng mức warn; `warn+` → warn trở lên; `info,error` → danh sách.
 */
export function levelFilter(spec?: string): (e: Pick<LogEntry, 'level'>) => boolean {
  if (!spec) return () => true;
  const s = spec.trim().toLowerCase();
  if (s.endsWith('+')) {
    const min = RANK[s.slice(0, -1) as LogEntry['level']];
    if (min === undefined) throw new Error(`Mức log không hợp lệ: ${spec} (debug|info|warn|error, thêm "+" để lấy từ mức đó trở lên)`);
    return (e) => (RANK[e.level] ?? 0) >= min;
  }
  const set = new Set(s.split(',').map((x) => x.trim()).filter(Boolean));
  for (const x of set) if (!(x in RANK)) throw new Error(`Mức log không hợp lệ: ${x}`);
  return (e) => set.has(e.level);
}

export interface TaskRef {
  id: string;
  title: string;
  status: TaskStatus | 'unknown';
  /** Lần cuối có sự kiện (mtime events.jsonl, hoặc task.json). */
  activeAt: number;
}

const TERMINAL: Array<TaskRef['status']> = ['done', 'failed', 'cancelled', 'paused'];

/** Các nhiệm vụ trong data/runs, mới hoạt động nhất trước. */
export function recentTasks(dataDir: string, limit = 50): TaskRef[] {
  const dir = path.join(dataDir, 'runs');
  if (!fs.existsSync(dir)) return [];
  const out: TaskRef[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const runDir = path.join(dir, e.name);
    const taskFile = path.join(runDir, 'task.json');
    if (!fs.existsSync(taskFile)) continue;
    const ev = path.join(runDir, 'events.jsonl');
    const activeAt = Math.max(fs.statSync(taskFile).mtimeMs, fs.existsSync(ev) ? fs.statSync(ev).mtimeMs : 0);
    out.push({ id: e.name, title: '', status: 'unknown', activeAt });
  }
  out.sort((a, b) => b.activeAt - a.activeAt || (a.id < b.id ? 1 : -1));
  const top = out.slice(0, limit);
  for (const t of top) {
    const task = readJsonFile<Partial<Task> | null>(path.join(dir, t.id, 'task.json'), null);
    t.title = task?.title ?? '';
    t.status = (task?.status as TaskStatus) ?? 'unknown';
  }
  return top;
}

/**
 * Nhiệm vụ nên theo dõi cho `--task latest`: nhiệm vụ có sự kiện gần nhất.
 * Khi đang theo một nhiệm vụ (`current`), chỉ chuyển khi có nhiệm vụ MỚI tạo sau nó,
 * hoặc nhiệm vụ hiện tại đã dừng/xong mà nhiệm vụ khác đang hoạt động — tránh nhảy qua lại giữa hai nhiệm vụ chạy song song.
 */
export function pickLatestTask(dataDir: string, current?: string): TaskRef | undefined {
  const tasks = recentTasks(dataDir, 20);
  const top = tasks[0];
  if (!current || !top || top.id === current) return top;
  const cur = tasks.find((t) => t.id === current);
  if (!cur) return top;
  const newer = tasks.filter((t) => t.id > current).sort((a, b) => b.activeAt - a.activeAt)[0];
  if (newer) return newer;
  if (TERMINAL.includes(cur.status) && top.activeAt > cur.activeAt) return top;
  return cur;
}

export interface LogFileInfo {
  scope: 'system' | 'department' | 'agent' | 'task';
  id: string;
  file: string;
  bytes: number;
  modifiedAt: number;
}

/** Liệt kê các tệp log (hệ thống, phòng ban, agent, nhiệm vụ gần nhất) cho `ccoding logs ls`. */
export function logFiles(dataDir: string, taskLimit = 15): LogFileInfo[] {
  const out: LogFileInfo[] = [];
  const add = (scope: LogFileInfo['scope'], id: string, file: string) => {
    if (!fs.existsSync(file)) return;
    const st = fs.statSync(file);
    out.push({ scope, id, file, bytes: st.size, modifiedAt: st.mtimeMs });
  };
  add('system', 'system', path.join(dataDir, 'logs', 'system.jsonl'));
  for (const [scope, sub] of [['department', 'departments'], ['agent', 'agents']] as const) {
    const dir = path.join(dataDir, 'logs', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) add(scope, f.replace(/\.jsonl$/, ''), path.join(dir, f));
  }
  for (const t of recentTasks(dataDir, taskLimit)) add('task', t.id, path.join(dataDir, 'runs', t.id, 'events.jsonl'));
  return out;
}
