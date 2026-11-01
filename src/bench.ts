// Benchtest biến thể tối ưu token: chạy CÙNG một đề bài trên cùng dự án với từng biến thể tùy chọn nhiệm vụ (cắt đầu ra shell,
// bản đồ repo gọn, bỏ họp, model theo pha…), xen kẽ, lặp ≥ 2 lần, chỉ chạy khi máy không có nhiệm vụ thật — rồi so thời gian,
// token quy đổi, số thao tác công cụ và chất lượng (review, lệnh kiểm tra của dự án, lệnh nghiệm thu) với biến thể gốc.
// Chỉ đổi mặc định khi báo cáo cho thấy biến thể tốt hơn mà chất lượng không kém.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.js';
import type { CallRow } from './kpi.js';
import { shellReadsOnly, shellWrites } from './tools/shell-policy.js';
import type { NewTaskInput, Task, TaskMode, TaskOptions, TaskStatus } from './types.js';
import { readJsonFile, writeJsonAtomic, writeText } from './util/fsx.js';

export interface BenchVariant {
  id: string;
  label?: string;
  /** Tùy chọn nhiệm vụ riêng của biến thể (ghép đè lên `options` chung). */
  options: Partial<TaskOptions>;
}

export interface BenchSpec {
  name: string;
  projectId: string;
  brief: string;
  title?: string;
  mode?: TaskMode;
  /** Tùy chọn chung cho mọi lượt (vd. maxParallel, budgetMode). */
  options?: Partial<TaskOptions>;
  /** Biến thể đầu tiên là gốc để so sánh. */
  variants: BenchVariant[];
  repeats?: number;
  /** Lệnh nghiệm thu chạy trong worktree của nhiệm vụ sau mỗi lượt (do người soạn spec viết — tin cậy). */
  accept?: string[];
  /** quietSec: số giây liên tục không có nhiệm vụ thật mới bắt đầu một lượt · pollSec · maxWaitMin: chờ quá lâu thì dừng (chạy tiếp bằng resume). */
  idle?: { quietSec?: number; pollSec?: number; maxWaitMin?: number };
  /** Lượt chạy quá thời gian này thì hủy và ghi là hỏng. */
  runTimeoutMin?: number;
  /** Nghỉ giữa hai lượt (giây) — vd. > 300 để cache prompt của lượt trước hết hạn. */
  gapSec?: number;
  /**
   * Cách ly lượt (mặc định bật): xong lượt thì lưu nhánh nhiệm vụ thành bundle + patch trong thư mục bench rồi gỡ worktree + nhánh khỏi
   * repo dự án — lượt sau không thấy lời giải của lượt trước qua `git log --all`/`git branch`.
   */
  isolate?: boolean;
}

export type BenchRunStatus = 'pending' | 'running' | 'done' | 'failed';

export interface RunMetrics {
  status: TaskStatus;
  wallSec: number;
  calls: number;
  failedCalls: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; weighted: number };
  costUsd: number;
  /** Theo pha: số lượt, giây gọi cộng dồn (lượt song song cộng cả), token quy đổi, token đầu ra. */
  byPhase: Record<string, { calls: number; sec: number; weighted: number; output: number }>;
  /** read: đọc/tìm (kể cả git chỉ đọc, lệnh shell chỉ đọc) · write: ghi/sửa tệp · shell: lệnh khác (test, build…). */
  tools: { total: number; read: number; write: number; shell: number; other: number; failed: number; resultChars: number; resentChars: number };
  turns: number;
  quality: {
    subtasks: number;
    subtasksDone: number;
    /** Mọi phòng được duyệt ở review cuối (undefined: không review). */
    approved?: boolean;
    reviewRounds: number;
    attention?: string;
    checksOk?: number;
    checksTotal?: number;
    acceptOk?: number;
    acceptTotal?: number;
  };
  models: string[];
}

export interface BenchRun {
  key: string;
  variant: string;
  repeat: number;
  status: BenchRunStatus;
  taskId?: string;
  submittedAt?: string;
  finishedAt?: string;
  /** Nhiệm vụ thật chạy cùng lúc (số đo thời gian không còn sạch). */
  overlap: string[];
  /** Có lúc tạm dừng (vd. chờ hạn mức) — thời gian không so được. */
  paused?: boolean;
  note?: string;
  accept?: Array<{ command: string; code: number | null; ms: number; tail: string }>;
  metrics?: RunMetrics;
  /** Kết quả lượt đã lưu ra thư mục bench (khi cách ly): tệp bundle/patch tương đối thư mục bench, ghi chú nếu gỡ chưa hết. */
  archived?: { bundle?: string; patch?: string; note?: string };
}

export interface BenchState {
  version: 1;
  id: string;
  spec: BenchSpec;
  specHash: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'running' | 'waiting' | 'stopped' | 'done';
  runs: BenchRun[];
}

export interface BenchClient {
  list(): Promise<Task[]>;
  get(id: string): Promise<Task | undefined>;
  submit(input: NewTaskInput): Promise<Task>;
  cancel(id: string): Promise<void>;
  calls(taskId: string): CallRow[];
  /** Chạy lệnh nghiệm thu (mặc định: shell cục bộ trong worktree). */
  runCommand?(cwd: string, command: string, timeoutMs: number): { code: number | null; ms: number; tail: string };
}

export interface BenchDeps {
  sleep(ms: number): Promise<void>;
  now(): number;
  log(msg: string): void;
  signal?: AbortSignal;
}

const ID_RE = /^[\w.-]{1,24}$/;
const COMMON_KEYS = ['discussionRounds', 'review', 'maxParallel', 'maxRevisions', 'budgetTokens', 'budgetMode', 'runtime', 'subtaskBudgetTokens', 'bashMaxOutput', 'repoMapMode', 'phaseModels'] as const;
const ACTIVE: TaskStatus[] = ['running', 'queued'];
const FINISHED: TaskStatus[] = ['done', 'failed', 'cancelled'];

function pickOptions(o: unknown): Partial<TaskOptions> {
  if (!o || typeof o !== 'object') return {};
  const src = o as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of COMMON_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out as Partial<TaskOptions>;
}

/** Kiểm tra và chuẩn hóa spec (tệp JSON do người vận hành soạn). */
export function parseSpec(raw: unknown): BenchSpec {
  if (!raw || typeof raw !== 'object') throw new Error('Spec benchtest phải là đối tượng JSON');
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? '').trim();
  if (!ID_RE.test(name)) throw new Error('Spec: "name" bắt buộc, chỉ chữ/số/._- (≤ 24 ký tự)');
  if (typeof r.projectId !== 'string' || !r.projectId.trim()) throw new Error('Spec: thiếu "projectId" (benchtest chạy trên dự án có repo)');
  if (typeof r.brief !== 'string' || !r.brief.trim()) throw new Error('Spec: thiếu "brief" (đề bài)');
  if (!Array.isArray(r.variants) || r.variants.length < 2) throw new Error('Spec: cần ít nhất 2 biến thể (biến thể đầu là gốc)');
  const seen = new Set<string>();
  const variants = r.variants.map((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    if (!ID_RE.test(id)) throw new Error(`Spec: biến thể #${i + 1} thiếu "id" hợp lệ`);
    if (seen.has(id)) throw new Error(`Spec: trùng id biến thể "${id}"`);
    seen.add(id);
    return { id, label: typeof o.label === 'string' ? o.label.slice(0, 120) : undefined, options: pickOptions(o.options) };
  });
  const repeats = Math.min(10, Math.max(1, Math.floor(Number(r.repeats ?? 2)) || 2));
  const accept = Array.isArray(r.accept) ? r.accept.map(String).filter((c) => c.trim()).slice(0, 10) : undefined;
  const idle = (r.idle ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  return {
    name,
    projectId: r.projectId.trim(),
    brief: r.brief.trim(),
    title: typeof r.title === 'string' ? r.title.trim().slice(0, 80) || undefined : undefined,
    mode: r.mode === 'project' || r.mode === 'department' || r.mode === 'auto' || r.mode === 'joint' ? r.mode : undefined,
    options: pickOptions(r.options),
    variants,
    repeats,
    accept: accept?.length ? accept : undefined,
    idle: { quietSec: num(idle.quietSec, 120, 0, 3600), pollSec: num(idle.pollSec, 15, 1, 600), maxWaitMin: num(idle.maxWaitMin, 720, 1, 10_080) },
    runTimeoutMin: num(r.runTimeoutMin, 60, 1, 600),
    gapSec: num(r.gapSec, 0, 0, 3600),
    isolate: r.isolate !== false,
  };
}

/** Thứ tự xen kẽ: lần lặp r xoay danh sách biến thể r bước — mỗi biến thể lần lượt đứng ở mọi vị trí (bù trôi theo thời gian, cache ấm). */
export function schedule(spec: BenchSpec): BenchRun[] {
  const n = spec.variants.length;
  const out: BenchRun[] = [];
  for (let r = 0; r < (spec.repeats ?? 2); r++)
    for (let i = 0; i < n; i++) {
      const v = spec.variants[(i + r) % n];
      out.push({ key: `${v.id}#${r + 1}`, variant: v.id, repeat: r + 1, status: 'pending', overlap: [] });
    }
  return out;
}

export function newState(spec: BenchSpec, now = new Date()): BenchState {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const iso = now.toISOString();
  return { version: 1, id: `${stamp}-${spec.name}`, spec, specHash: hashSpec(spec), createdAt: iso, updatedAt: iso, status: 'pending', runs: schedule(spec) };
}

export function hashSpec(spec: BenchSpec): string {
  return crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 12);
}

/** Tùy chọn gửi kèm một lượt: chung → biến thể → nhãn biến thể; ngân sách 'complete' để không tạm dừng giữa chừng. */
export function runInput(spec: BenchSpec, run: BenchRun): NewTaskInput {
  const v = spec.variants.find((x) => x.id === run.variant);
  if (!v) throw new Error(`Không có biến thể ${run.variant}`);
  const title = spec.title ?? spec.brief.split(/[.\n]/)[0].slice(0, 60);
  return {
    brief: spec.brief,
    title: `[bench ${spec.name} ${run.key}] ${title}`.slice(0, 120),
    mode: spec.mode ?? 'project',
    projectId: spec.projectId,
    options: { budgetMode: 'complete', ...spec.options, ...v.options, variant: `${spec.name}/${run.key}` },
  };
}

/** Token quy đổi theo giá API (đơn vị = token đầu vào): đầu vào 1 · ghi cache 1,25 · đọc cache 0,1 · đầu ra 5. */
export function weighted(u: { input: number; output: number; cacheRead: number; cacheWrite?: number }): number {
  return Math.round(u.input + 1.25 * (u.cacheWrite ?? 0) + 0.1 * u.cacheRead + 5 * u.output);
}

function toolClass(name: string, args: string): 'read' | 'write' | 'shell' | 'other' {
  if (/^(read_file|search|list_files|git_read|Read|Grep|Glob|LS)$/.test(name)) return 'read';
  if (/^(write_file|edit_file|Write|Edit|MultiEdit|NotebookEdit)$/.test(name)) return 'write';
  if (/^(run_command|Bash|PowerShell)$/.test(name)) return shellWrites(args) ? 'write' : shellReadsOnly(args) ? 'read' : 'shell';
  return 'other';
}

/** Số đo của một lượt từ task.json + calls.jsonl (đã ghi sẵn bởi CCoding). */
export function runMetrics(task: Task, calls: CallRow[], accept?: BenchRun['accept']): RunMetrics {
  const t0 = Date.parse(task.startedAt ?? task.createdAt);
  const t1 = Date.parse(task.finishedAt ?? task.updatedAt);
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, weighted: 0 };
  const byPhase: RunMetrics['byPhase'] = {};
  const tools = { total: 0, read: 0, write: 0, shell: 0, other: 0, failed: 0, resultChars: 0, resentChars: 0 };
  let cost = 0;
  let turns = 0;
  let failed = 0;
  const models = new Set<string>();
  for (const c of calls) {
    const u = { input: c.input ?? 0, output: c.output ?? 0, cacheRead: c.cacheRead ?? 0, cacheWrite: c.cacheWrite ?? 0 };
    tokens.input += u.input;
    tokens.output += u.output;
    tokens.cacheRead += u.cacheRead;
    tokens.cacheWrite += u.cacheWrite;
    const w = weighted(u);
    tokens.weighted += w;
    cost += Number((c as { costUsd?: number }).costUsd ?? 0) || 0;
    turns += c.turns ?? 0;
    if (c.error) failed++;
    if (c.model) models.add(c.model);
    const ph = (byPhase[c.phase] ??= { calls: 0, sec: 0, weighted: 0, output: 0 });
    ph.calls++;
    ph.sec += (c.durationMs ?? 0) / 1000;
    ph.weighted += w;
    ph.output += u.output;
    const list = c.tools ?? [];
    list.forEach((tc, i) => {
      tools.total++;
      tools[toolClass(tc.name, tc.args ?? '')]++;
      if (!tc.ok) tools.failed++;
      tools.resultChars += tc.outputChars ?? 0;
      // kết quả công cụ thứ i được gửi lại ở mọi lượt sau trong cùng lượt gọi (ước lượng: mỗi lượt một công cụ)
      tools.resentChars += (tc.outputChars ?? 0) * (list.length - 1 - i);
    });
  }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  for (const p of Object.values(byPhase)) p.sec = Math.round(p.sec);
  const subtasks = task.runs.flatMap((r) => r.subtasks);
  const reviewed = task.runs.filter((r) => r.review);
  const latest = task.projectChecks?.latest;
  return {
    status: task.status,
    wallSec: Number.isFinite(t1 - t0) ? Math.max(0, Math.round((t1 - t0) / 1000)) : 0,
    calls: calls.length,
    failedCalls: failed,
    tokens,
    costUsd: Math.round(cost * 10_000) / 10_000,
    byPhase,
    tools,
    turns,
    quality: {
      subtasks: subtasks.length,
      subtasksDone: subtasks.filter((s) => s.status === 'done').length,
      approved: reviewed.length ? reviewed.every((r) => r.review!.approved) : undefined,
      reviewRounds: task.runs.reduce((a, r) => a + (r.reviewRound ?? 0), 0),
      attention: task.attention?.reason,
      checksOk: latest ? latest.filter((c) => c.ok).length : undefined,
      checksTotal: latest ? latest.length : undefined,
      acceptOk: accept ? accept.filter((a) => a.code === 0).length : undefined,
      acceptTotal: accept ? accept.length : undefined,
    },
    models: [...models],
  };
}

function defaultRunCommand(cwd: string, command: string, timeoutMs: number): { code: number | null; ms: number; tail: string } {
  const t0 = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const out = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim();
  return { code: r.error ? null : r.status, ms: Date.now() - t0, tail: out.slice(-600) };
}

/**
 * Lưu nhánh của lượt (`base..nhánh` thành bundle + patch) vào thư mục bench rồi gỡ worktree và nhánh khỏi repo dự án.
 * Xem lại: `git bundle unbundle <tệp>` hoặc `git fetch <tệp> <nhánh>` trong repo dự án; patch đọc trực tiếp.
 */
export function archiveRun(benchDir: string, run: Pick<BenchRun, 'key'>, task: Pick<Task, 'workspace' | 'branch' | 'baseRef'>): NonNullable<BenchRun['archived']> {
  const wt = task.workspace;
  if (!wt || !task.branch || !fs.existsSync(wt)) return { note: 'không có worktree/nhánh để lưu' };
  const common = git(wt, ['rev-parse', '--path-format=absolute', '--git-common-dir'], 30_000);
  if (!common.ok) return { note: `không đọc được repo: ${common.out.slice(0, 200)}` };
  const gitDir = common.out.trim().split('\n').pop()!.trim();
  const repo = path.basename(gitDir) === '.git' ? path.dirname(gitDir) : gitDir;
  const safe = run.key.replace(/[^\w.-]/g, '_');
  const out: NonNullable<BenchRun['archived']> = {};
  const notes: string[] = [];
  const range = task.baseRef ? `${task.baseRef}..${task.branch}` : task.branch;
  const bundle = path.join(benchDir, `${safe}.bundle`);
  const b = git(repo, ['bundle', 'create', bundle, range], 120_000);
  if (b.ok) out.bundle = path.basename(bundle);
  else notes.push(`bundle lỗi: ${b.out.slice(0, 160)}`);
  if (task.baseRef) {
    const patch = path.join(benchDir, `${safe}.patch`);
    const d = git(repo, ['diff', '--no-color', '--no-ext-diff', `--output=${patch}`, task.baseRef, task.branch], 120_000);
    if (d.ok) out.patch = path.basename(patch);
    else notes.push(`patch lỗi: ${d.out.slice(0, 160)}`);
  }
  // chỉ gỡ khi đã lưu được — không làm mất kết quả của lượt
  if (out.bundle) {
    const rm = git(repo, ['worktree', 'remove', '--force', wt], 120_000);
    if (!rm.ok) notes.push(`gỡ worktree chưa được: ${rm.out.slice(0, 160)}`);
    else {
      const br = git(repo, ['branch', '-D', task.branch], 30_000);
      if (!br.ok) notes.push(`xóa nhánh chưa được: ${br.out.slice(0, 160)}`);
    }
    git(repo, ['worktree', 'prune'], 30_000);
  }
  if (notes.length) out.note = notes.join('; ');
  return out;
}

export function stateFile(dir: string): string {
  return path.join(dir, 'state.json');
}

export function loadState(dir: string): BenchState {
  const st = readJsonFile<BenchState | undefined>(stateFile(dir), undefined);
  if (!st?.runs) throw new Error(`Không đọc được ${stateFile(dir)}`);
  return st;
}

function save(dir: string, st: BenchState): void {
  st.updatedAt = new Date().toISOString();
  writeJsonAtomic(stateFile(dir), st);
}

/** Các nhiệm vụ thật (không phải của benchtest này) đang chạy/chờ chạy. */
export function busyTasks(tasks: Task[], own: Set<string>): Task[] {
  return tasks.filter((t) => ACTIVE.includes(t.status) && !own.has(t.id));
}

/**
 * Chạy (hoặc chạy tiếp) benchtest: trước mỗi lượt chờ máy rảnh liên tục `quietSec` giây; giao nhiệm vụ; theo dõi tới khi xong
 * (ghi nhiệm vụ thật chạy chồng); chạy lệnh nghiệm thu; ghi số đo vào state.json sau mỗi lượt — dừng giữa chừng thì `resume` làm tiếp.
 */
export async function runBench(dir: string, client: BenchClient, deps: BenchDeps): Promise<BenchState> {
  const st = loadState(dir);
  const spec = st.spec;
  const idle = { quietSec: 120, pollSec: 15, maxWaitMin: 720, ...spec.idle };
  const poll = idle.pollSec * 1000;
  const own = new Set(st.runs.map((r) => r.taskId).filter((x): x is string => !!x));
  const exec = client.runCommand ?? defaultRunCommand;
  let first = true;
  for (const run of st.runs) {
    if (run.status === 'done' || run.status === 'failed') continue;
    if (deps.signal?.aborted) break;
    if (run.status === 'pending') {
      if (!first && spec.gapSec) await deps.sleep(spec.gapSec * 1000);
      // ── chờ máy rảnh: không có nhiệm vụ thật nào đang chạy/chờ trong quietSec giây liên tục
      const waitStart = deps.now();
      let quietSince: number | undefined;
      let announced = '';
      for (;;) {
        if (deps.signal?.aborted) break;
        const busy = busyTasks(await client.list(), own);
        if (busy.length) {
          quietSince = undefined;
          const ids = busy.map((t) => t.id).join(', ');
          if (ids !== announced) deps.log(`⏳ ${run.key}: chờ nhiệm vụ đang chạy xong (${ids})`);
          announced = ids;
          if (st.status !== 'waiting') {
            st.status = 'waiting';
            save(dir, st);
          }
        } else {
          quietSince ??= deps.now();
          if (deps.now() - quietSince >= idle.quietSec * 1000) break;
        }
        if (deps.now() - waitStart > idle.maxWaitMin * 60_000) {
          st.status = 'stopped';
          save(dir, st);
          deps.log(`⏹ Chờ máy rảnh quá ${idle.maxWaitMin} phút — dừng; chạy tiếp bằng: ccoding bench resume ${dir}`);
          return st;
        }
        await deps.sleep(poll);
      }
      if (deps.signal?.aborted) break;
      const t = await client.submit(runInput(spec, run));
      run.taskId = t.id;
      run.status = 'running';
      run.submittedAt = new Date(deps.now()).toISOString();
      own.add(t.id);
      st.status = 'running';
      save(dir, st);
      deps.log(`▶ ${run.key}: giao ${t.id}`);
    }
    first = false;
    // ── theo dõi tới khi nhiệm vụ kết thúc
    const t0 = run.submittedAt ? Date.parse(run.submittedAt) : deps.now();
    let task: Task | undefined;
    for (;;) {
      if (deps.signal?.aborted) break;
      task = run.taskId ? await client.get(run.taskId) : undefined;
      if (!task) {
        run.status = 'failed';
        run.note = 'Không còn nhiệm vụ trên server';
        break;
      }
      if (FINISHED.includes(task.status)) break;
      if (task.status === 'paused') run.paused = true;
      const others = busyTasks(await client.list(), own).map((x) => x.id);
      for (const id of others) if (!run.overlap.includes(id)) run.overlap.push(id);
      if (deps.now() - t0 > (spec.runTimeoutMin ?? 60) * 60_000) {
        await client.cancel(task.id).catch(() => undefined);
        run.note = `Quá ${spec.runTimeoutMin} phút — đã hủy`;
        deps.log(`⛔ ${run.key}: ${run.note}`);
        task = (await client.get(task.id)) ?? task;
        break;
      }
      await deps.sleep(poll);
    }
    if (deps.signal?.aborted) {
      save(dir, st);
      break;
    }
    if (task) {
      if (task.status === 'done' && spec.accept?.length && task.workspace && fs.existsSync(task.workspace))
        run.accept = spec.accept.map((command) => ({ command, ...exec(task!.workspace!, command, 10 * 60_000) }));
      run.metrics = runMetrics(task, client.calls(task.id), run.accept);
      run.status = task.status === 'done' && !run.note ? 'done' : 'failed';
      if (spec.isolate !== false && task.branch) {
        run.archived = archiveRun(dir, run, task);
        if (run.archived.note) deps.log(`⚠ ${run.key}: ${run.archived.note}`);
      }
      run.finishedAt = new Date(deps.now()).toISOString();
      const m = run.metrics;
      deps.log(`${run.status === 'done' ? '✓' : '✗'} ${run.key}: ${task.status} · ${m.wallSec}s · ${m.tokens.weighted.toLocaleString('vi-VN')} token quy đổi · ${m.tools.total} công cụ${run.overlap.length ? ` · chạy chồng ${run.overlap.join(', ')}` : ''}`);
    }
    save(dir, st);
  }
  if (st.runs.every((r) => r.status === 'done' || r.status === 'failed')) st.status = 'done';
  else if (st.status !== 'stopped') st.status = 'stopped';
  save(dir, st);
  if (st.status === 'done') writeReport(dir, st);
  return st;
}

// ── báo cáo ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface VariantSummary {
  id: string;
  label?: string;
  options: Partial<TaskOptions>;
  runs: number;
  /** Lượt hợp lệ để so thời gian: xong, không chạy chồng nhiệm vụ thật, không tạm dừng. */
  clean: number;
  done: number;
  mean: { wallSec?: number; weighted: number; output: number; cacheWrite: number; cacheRead: number; costUsd: number; tools: number; reads: number; resentChars: number; calls: number };
  range: { wallSec?: [number, number]; weighted: [number, number] };
  quality: { approved: number; reviewed: number; checksOk: number; checksTotal: number; acceptOk: number; acceptTotal: number; attention: number };
  byPhase: Record<string, { weighted: number; sec: number }>;
  delta?: { wallSec?: number; weighted: number; output: number; costUsd: number; tools: number };
  /** Kết luận sơ bộ so với gốc. */
  verdict?: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (v: number, b: number) => (b ? Math.round(((v - b) / b) * 1000) / 10 : 0);

export function summarize(st: BenchState): VariantSummary[] {
  const out = st.spec.variants.map((v): VariantSummary => {
    const runs = st.runs.filter((r) => r.variant === v.id && r.metrics);
    const ok = runs.filter((r) => r.status === 'done');
    const clean = ok.filter((r) => !r.overlap.length && !r.paused);
    const ms = ok.map((r) => r.metrics!);
    const w = ms.map((m) => m.tokens.weighted);
    const wall = clean.map((r) => r.metrics!.wallSec);
    const byPhase: VariantSummary['byPhase'] = {};
    for (const m of ms)
      for (const [p, x] of Object.entries(m.byPhase)) {
        const b = (byPhase[p] ??= { weighted: 0, sec: 0 });
        b.weighted += x.weighted / ms.length;
        b.sec += x.sec / ms.length;
      }
    for (const b of Object.values(byPhase)) {
      b.weighted = Math.round(b.weighted);
      b.sec = Math.round(b.sec);
    }
    const all = runs.map((r) => r.metrics!);
    return {
      id: v.id,
      label: v.label,
      options: v.options,
      runs: runs.length,
      clean: clean.length,
      done: ok.length,
      mean: {
        wallSec: wall.length ? Math.round(mean(wall)) : undefined,
        weighted: Math.round(mean(w)),
        output: Math.round(mean(ms.map((m) => m.tokens.output))),
        cacheWrite: Math.round(mean(ms.map((m) => m.tokens.cacheWrite))),
        cacheRead: Math.round(mean(ms.map((m) => m.tokens.cacheRead))),
        costUsd: Math.round(mean(ms.map((m) => m.costUsd)) * 100) / 100,
        tools: Math.round(mean(ms.map((m) => m.tools.total))),
        reads: Math.round(mean(ms.map((m) => m.tools.read))),
        resentChars: Math.round(mean(ms.map((m) => m.tools.resentChars))),
        calls: Math.round(mean(ms.map((m) => m.calls))),
      },
      range: { wallSec: wall.length ? [Math.min(...wall), Math.max(...wall)] : undefined, weighted: w.length ? [Math.min(...w), Math.max(...w)] : [0, 0] },
      quality: {
        approved: all.filter((m) => m.quality.approved === true).length,
        reviewed: all.filter((m) => m.quality.approved !== undefined).length,
        checksOk: all.reduce((a, m) => a + (m.quality.checksOk ?? 0), 0),
        checksTotal: all.reduce((a, m) => a + (m.quality.checksTotal ?? 0), 0),
        acceptOk: all.reduce((a, m) => a + (m.quality.acceptOk ?? 0), 0),
        acceptTotal: all.reduce((a, m) => a + (m.quality.acceptTotal ?? 0), 0),
        attention: all.filter((m) => m.quality.attention).length,
      },
      byPhase,
    };
  });
  const base = out[0];
  const rate = (a: number, b: number) => (b ? a / b : 1);
  for (const s of out.slice(1)) {
    s.delta = {
      wallSec: s.mean.wallSec !== undefined && base.mean.wallSec ? pct(s.mean.wallSec, base.mean.wallSec) : undefined,
      weighted: pct(s.mean.weighted, base.mean.weighted),
      output: pct(s.mean.output, base.mean.output),
      costUsd: pct(s.mean.costUsd, base.mean.costUsd),
      tools: pct(s.mean.tools, base.mean.tools),
    };
    if (!s.done || !base.done) {
      s.verdict = 'Chưa đủ lượt xong để so';
      continue;
    }
    const worse =
      s.done < s.runs ||
      rate(s.quality.approved, s.quality.reviewed) < rate(base.quality.approved, base.quality.reviewed) ||
      rate(s.quality.checksOk, s.quality.checksTotal) < rate(base.quality.checksOk, base.quality.checksTotal) ||
      rate(s.quality.acceptOk, s.quality.acceptTotal) < rate(base.quality.acceptOk, base.quality.acceptTotal) ||
      s.quality.attention / Math.max(1, s.runs) > base.quality.attention / Math.max(1, base.runs);
    // "rõ" khi dải min–max của hai bên không chồng nhau (ít lượt lặp nên không dùng kiểm định thống kê)
    const clearly = s.range.weighted[1] < base.range.weighted[0];
    if (worse) s.verdict = 'Chất lượng kém hơn gốc — không đổi mặc định';
    else if (s.delta.weighted <= -10 && clearly) s.verdict = `Tốt hơn rõ (token quy đổi ${s.delta.weighted}%, dải không chồng gốc), chất lượng không kém — có thể đổi mặc định`;
    else if (s.delta.weighted < 0) s.verdict = `Có xu hướng tốt hơn (${s.delta.weighted}%) nhưng nằm trong biên dao động — cần thêm lượt lặp`;
    else s.verdict = `Không tốt hơn (token quy đổi ${s.delta.weighted > 0 ? '+' : ''}${s.delta.weighted}%)`;
  }
  return out;
}

const n0 = (x: number) => Math.round(x).toLocaleString('vi-VN');
const sgn = (x?: number) => (x === undefined ? '—' : `${x > 0 ? '+' : ''}${x}%`);
const optText = (o: Partial<TaskOptions>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ') || '(như cấu hình hiện tại)';

export function reportMarkdown(st: BenchState): string {
  const sum = summarize(st);
  const s = st.spec;
  const L: string[] = [];
  L.push(`# Benchtest ${s.name} — ${st.id}`, '');
  L.push(`- Dự án: \`${s.projectId}\` · lặp ${s.repeats} lần · xen kẽ (xoay thứ tự mỗi lần lặp) · trạng thái: **${st.status}**`);
  L.push(`- Đề bài: ${s.brief.replace(/\s+/g, ' ').slice(0, 300)}${s.brief.length > 300 ? '…' : ''}`);
  if (s.options && Object.keys(s.options).length) L.push(`- Tùy chọn chung: ${optText(s.options)}`);
  if (s.accept?.length) L.push(`- Lệnh nghiệm thu: ${s.accept.map((c) => `\`${c}\``).join(', ')}`);
  L.push(`- Token quy đổi = đầu vào + 1,25 × ghi cache + 0,1 × đọc cache + 5 × đầu ra (tỉ lệ giá API, đơn vị token đầu vào). Thời gian chỉ tính lượt "sạch" (không chạy chồng nhiệm vụ thật, không tạm dừng).`, '');
  L.push('## Biến thể', '');
  for (const v of s.variants) L.push(`- **${v.id}**${v.id === s.variants[0].id ? ' (gốc)' : ''}${v.label ? ` — ${v.label}` : ''}: ${optText(v.options)}`);
  L.push('', '## Tổng hợp (trung bình mỗi lượt)', '');
  L.push('| Biến thể | Xong/lượt | Thời gian (s) | Token quy đổi | Δ | Đầu ra | Ghi cache | Đọc cache | USD* | Công cụ | Đọc/tìm | Ký tự gửi lại | Duyệt | Kiểm tra | Nghiệm thu |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const v of sum) {
    const q = v.quality;
    L.push(
      `| ${v.id} | ${v.done}/${v.runs} | ${v.mean.wallSec ?? '—'}${v.range.wallSec ? ` (${v.range.wallSec[0]}–${v.range.wallSec[1]})` : ''}${v.delta?.wallSec !== undefined ? ` ${sgn(v.delta.wallSec)}` : ''} | ${n0(v.mean.weighted)} (${n0(v.range.weighted[0])}–${n0(v.range.weighted[1])}) | ${v.delta ? sgn(v.delta.weighted) : 'gốc'} | ${n0(v.mean.output)} | ${n0(v.mean.cacheWrite)} | ${n0(v.mean.cacheRead)} | ${v.mean.costUsd} | ${v.mean.tools} | ${v.mean.reads} | ${n0(v.mean.resentChars)} | ${q.reviewed ? `${q.approved}/${q.reviewed}` : '—'} | ${q.checksTotal ? `${q.checksOk}/${q.checksTotal}` : '—'} | ${q.acceptTotal ? `${q.acceptOk}/${q.acceptTotal}` : '—'} |`,
    );
  }
  L.push('', '\\* USD: chi phí quy đổi theo giá API do runtime báo (gói đăng ký không trả tiền theo token — chỉ để so tương đối giữa các model).', '');
  L.push('## Kết luận sơ bộ', '');
  for (const v of sum.slice(1)) L.push(`- **${v.id}**: ${v.verdict}`);
  L.push('', '> Ít lượt lặp → kết luận chỉ là sơ bộ. Chỉ đổi mặc định khi biến thể tốt hơn rõ và chất lượng không kém; nếu nằm trong biên dao động thì chạy thêm lượt.', '');
  const phases = [...new Set(sum.flatMap((v) => Object.keys(v.byPhase)))];
  if (phases.length) {
    L.push('## Theo pha (token quy đổi · giây gọi cộng dồn)', '');
    L.push(`| Pha | ${sum.map((v) => v.id).join(' | ')} |`, `|---|${sum.map(() => '---').join('|')}|`);
    for (const p of phases) L.push(`| ${p} | ${sum.map((v) => (v.byPhase[p] ? `${n0(v.byPhase[p].weighted)} · ${v.byPhase[p].sec}s` : '—')).join(' | ')} |`);
    L.push('');
  }
  L.push('## Từng lượt', '');
  L.push('| Lượt | Nhiệm vụ | Kết quả | Thời gian (s) | Token quy đổi | Lượt gọi | Công cụ (đọc/ghi/lệnh) | Lỗi công cụ | Model | Ghi chú |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of st.runs) {
    const m = r.metrics;
    const note = [r.note, r.archived?.note ? `lưu/gỡ: ${r.archived.note}` : '', r.overlap.length ? `chạy chồng ${r.overlap.join(', ')}` : '', r.paused ? 'có tạm dừng' : '', m?.quality.attention ? `cần xem (${m.quality.attention})` : '', r.accept?.some((a) => a.code !== 0) ? `nghiệm thu lỗi: ${r.accept.filter((a) => a.code !== 0).map((a) => `\`${a.command}\``).join(', ')}` : '']
      .filter(Boolean)
      .join('; ');
    L.push(
      m
        ? `| ${r.key} | ${r.taskId ?? '—'} | ${m.status} | ${m.wallSec} | ${n0(m.tokens.weighted)} | ${m.calls} | ${m.tools.total} (${m.tools.read}/${m.tools.write}/${m.tools.shell}) | ${m.tools.failed} | ${m.models.join(', ').slice(0, 60)} | ${note.replace(/\|/g, '/')} |`
        : `| ${r.key} | ${r.taskId ?? '—'} | ${r.status} | — | — | — | — | — | — | ${note.replace(/\|/g, '/')} |`,
    );
  }
  return `${L.join('\n')}\n`;
}

export function writeReport(dir: string, st: BenchState): string {
  const file = path.join(dir, 'report.md');
  writeText(file, reportMarkdown(st));
  writeJsonAtomic(path.join(dir, 'report.json'), { id: st.id, status: st.status, specHash: st.specHash, variants: summarize(st), runs: st.runs });
  return file;
}

/** Tạo thư mục benchtest mới trong data/bench/ (spec + state). */
export function createBench(benchDir: string, spec: BenchSpec, now = new Date()): { dir: string; state: BenchState } {
  const state = newState(spec, now);
  const dir = path.join(benchDir, state.id);
  if (fs.existsSync(stateFile(dir))) throw new Error(`Đã có ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(path.join(dir, 'spec.json'), spec);
  writeJsonAtomic(stateFile(dir), state);
  return { dir, state };
}
