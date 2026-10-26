import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { EventBus } from './events.js';
import { addWorktree, changeSummary, commitAll, copyUntracked, currentBranch, headCommit, isGitRepo } from './git.js';
import type { Herdr } from './herdr.js';
import type { LogStore } from './logger.js';
import { blockedSubtasks, keywordRoute, orderJoint, parsePlan, parseReview, parseRoute, readySubtasks } from './planner.js';
import * as P from './prompts.js';
import type { Registry } from './registry.js';
import { classifyError, RuntimeError, shouldFailover, toRuntimeError } from './runtimes/errors.js';
import type { Candidate, RuntimeManager } from './runtimes/index.js';
import type { Store } from './store.js';
import { toolsFor } from './tools/workspace.js';
import type { Uploads } from './uploads.js';
import type { UsageLedger } from './usage.js';
import { ensureDir, readJsonFile, safeName, writeJsonAtomic, writeText } from './util/fsx.js';
import { newTaskId, nowIso, shortId } from './util/ids.js';
import { redact } from './util/redact.js';
import { estimateTokens } from './util/tokens.js';
import { fmtNum } from './util/format.js';
import {
  addUsage,
  emptyUsage,
  totalTokens,
  type AgentDef,
  type AgentState,
  type AgentStatus,
  type Alert,
  type Attachment,
  type BudgetMode,
  type ChatMessage,
  type Classification,
  type DepartmentDef,
  type DeptRun,
  type ErrorKind,
  type NewTaskInput,
  type PauseInfo,
  type Phase,
  type ProjectDef,
  type RunRequest,
  type RunResult,
  type RunStage,
  type Subtask,
  type Task,
  type ToolAccess,
  type ToolName,
} from './types.js';

export interface OrchestratorDeps {
  config: Config;
  registry: Registry;
  runtimes: RuntimeManager;
  logs: LogStore;
  usage: UsageLedger;
  store: Store;
  bus: EventBus;
  herdr?: Herdr;
  uploads?: Uploads;
}

/** Dừng nhiệm vụ nhưng giữ nguyên tiến độ để tiếp tục sau (chạm trần ngân sách, hết tài nguyên, yêu cầu thủ công). */
export class PauseSignal extends Error {
  constructor(public reason: PauseInfo['reason'], message: string, public resumeAt?: number) {
    super(message);
  }
}
class CancelledError extends Error {}

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'LS']);
const STAGES: RunStage[] = ['planned', 'finalized', 'executed', 'reviewed', 'done'];
const CONTINUE_PHASES = new Set<Phase>(['execute', 'revise', 'synthesize']);
const CAPACITY_KINDS = new Set<ErrorKind>(['quota', 'rate', 'auth', 'transient', 'timeout', 'model', 'empty']);

const STATUS_BY_PHASE: Record<Phase, AgentStatus> = {
  route: 'thinking',
  plan: 'thinking',
  discuss: 'discussing',
  finalize: 'thinking',
  execute: 'working',
  review: 'reviewing',
  revise: 'working',
  synthesize: 'thinking',
};

const ACTIVITY_BY_PHASE: Record<Phase, string> = {
  route: 'Định tuyến nhiệm vụ',
  plan: 'Lập kế hoạch',
  discuss: 'Phát biểu trong họp',
  finalize: 'Chốt kế hoạch',
  execute: 'Đang làm',
  review: 'Review sản phẩm',
  revise: 'Sửa theo review',
  synthesize: 'Viết báo cáo tổng hợp',
};

const OFFICE: DepartmentDef = {
  id: 'office',
  name: 'Văn phòng điều phối',
  short: 'Điều phối',
  purpose: 'routing',
  lead: '',
  reviewer: '',
  members: [],
  color: '#991b1b',
  keywords: [],
  body: '',
  file: '',
};

interface CallCtx {
  task: Task;
  dept?: DepartmentDef;
  run?: DeptRun;
  project?: ProjectDef;
  subtask?: Subtask;
  cwd: string;
  hints?: Record<string, unknown>;
  activity?: string;
}

type Builder = (tools: ToolName[]) => P.Built;

export interface ResumeOptions {
  addBudget?: number;
  budgetTokens?: number;
  budgetMode?: BudgetMode;
  runtime?: string;
  /** Chạy lại các hạng mục đã xong (vd. để áp dụng thật vào repo sau khi có workspace): id hoặc "all". */
  rerun?: string[] | 'all';
}

export interface PackageOptions extends ResumeOptions {
  projectId?: string;
  name?: string;
  description?: string;
  workspace?: string;
  toolAccess?: ToolAccess;
  isolation?: 'none' | 'worktree';
  resume?: boolean;
}

export function extractSummary(text: string, max = 320): string {
  const m = /##\s*Tóm tắt[^\n]*\n+([\s\S]*?)(?:\n##\s|$)/i.exec(text);
  const body = (m ? m[1] : text.replace(/^#.*$/gm, '')).replace(/\s+/g, ' ').trim();
  return body.length > max ? `${body.slice(0, max)}…` : body;
}

const reached = (run: DeptRun, s: RunStage) => !!run.stage && STAGES.indexOf(run.stage) >= STAGES.indexOf(s);

/** Suy ra mốc đã xong cho nhiệm vụ cũ (trước khi có trường stage). */
function inferStage(run: DeptRun): RunStage | undefined {
  if (!run.subtasks.length) return undefined;
  if (run.finalPath && run.status === 'done') return 'done';
  if (run.review) return 'executed';
  if (run.decisions !== undefined || run.subtasks.some((s) => s.status !== 'pending' || s.attempts > 0)) return 'finalized';
  return 'planned';
}

/**
 * Bộ điều phối trung tâm: nhận nhiệm vụ → định tuyến → trưởng phòng lập kế hoạch →
 * họp thảo luận → chốt → thực thi song song theo phụ thuộc → review/sửa → báo cáo tổng hợp.
 * Mỗi mốc được lưu lại nên nhiệm vụ có thể tạm dừng (ngân sách, hết tài nguyên, thủ công) và tiếp tục từ checkpoint.
 */
export class Orchestrator {
  readonly agentStates = new Map<string, AgentState>();
  readonly runner: 'process' | 'herdr';
  readonly alerts: Alert[] = [];
  private controllers = new Map<string, AbortController>();
  private queue: string[] = [];
  private active = new Set<string>();
  private locks = new Map<string, Promise<void>>();
  private holds = new Map<string, Omit<AgentState, 'id' | 'since'>>();
  private pauseRequests = new Set<string>();
  private resumeTimers = new Map<string, NodeJS.Timeout>();
  /** Số thứ tự lượt gọi — khởi tạo theo thời gian để không trùng giữa các lần khởi động lại server (tên file job/prompt, callId). */
  private seq = Math.max(0, Math.floor(Date.now() / 1000) - 1_790_000_000);

  constructor(private d: OrchestratorDeps) {
    for (const a of d.registry.agents.values()) this.agentStates.set(a.id, { id: a.id, status: 'idle', since: nowIso() });
    const r = d.config.runner;
    this.runner = r === 'herdr' || (r === 'auto' && !!d.herdr?.insideHerdr()) ? 'herdr' : 'process';
    // nhiệm vụ đang chờ quota từ phiên trước: hẹn tự tiếp tục
    for (const t of d.store.list()) if (t.status === 'paused' && t.pause?.resumeAt) this.scheduleResume(t);
  }

  // ── API công khai ─────────────────────────────────────────────────────────

  submit(input: NewTaskInput): Task {
    const brief = (input.brief ?? '').trim();
    if (!brief) throw new Error('Thiếu nội dung nhiệm vụ (brief)');
    const { config, registry, store } = this.d;
    const project = input.projectId ? store.project(input.projectId) : undefined;
    if (input.projectId && !project) throw new Error(`Không có dự án "${input.projectId}"`);
    let mode = input.mode ?? (project ? 'project' : input.department ? 'department' : 'auto');
    if (mode === 'project' && !project) mode = 'auto';
    if (mode === 'department') {
      if (!input.department || !registry.departments.has(input.department)) throw new Error(`Phòng ban không hợp lệ: ${input.department ?? '(trống)'}`);
    }
    const o = input.options ?? {};
    const now = nowIso();
    const budgetMode: BudgetMode = o.budgetMode === 'pause' || o.budgetMode === 'complete' ? o.budgetMode : (project?.budgetMode ?? config.defaults.budgetMode ?? 'complete');
    const task: Task = {
      id: newTaskId(),
      title: (input.title ?? '').trim() || firstSentence(brief, 90),
      brief,
      mode,
      department: input.department,
      projectId: project?.id,
      classification: (project?.classification ?? config.dataProtection.defaultClassification) as Classification,
      status: 'queued',
      departments: [],
      runs: [],
      options: {
        discussionRounds: clamp(o.discussionRounds ?? config.defaults.discussionRounds, 0, 3),
        review: o.review ?? config.defaults.review,
        maxParallel: clamp(o.maxParallel ?? config.defaults.maxParallel, 1, 8),
        maxRevisions: clamp(o.maxRevisions ?? config.defaults.maxRevisions, 0, 3),
        budgetTokens: Math.max(1000, o.budgetTokens ?? project?.budgetTokens ?? config.defaults.budgetTokens),
        budgetMode,
        runtime: o.runtime || undefined,
      },
      usage: emptyUsage(),
      createdAt: now,
      updatedAt: now,
    };
    (task as Task & { autoTitle?: boolean }).autoTitle = !input.title;
    // tài liệu đính kèm → data/runs/<task>/inputs/
    const inputsDir = path.join(store.runDir(task.id), 'inputs');
    writeText(path.join(inputsDir, 'BRIEF.md'), brief);
    if (input.attachments?.length) {
      if (!this.d.uploads) throw new Error('Máy chủ chưa bật tải tệp');
      task.attachments = [];
      for (const id of input.attachments.slice(0, 20)) {
        const meta = this.d.uploads.get(String(id));
        if (!meta) throw new Error(`Không tìm thấy tệp đã tải lên: ${id}`);
        let file = meta.file;
        if (task.attachments.some((a) => a.path === `inputs/${file}`)) file = `${meta.id}-${file}`;
        fs.copyFileSync(this.d.uploads.originalPath(meta), path.join(inputsDir, file));
        writeText(path.join(inputsDir, `${file}.txt`), this.d.uploads.text(meta));
        task.attachments.push({ id: meta.id, name: meta.name, size: meta.size, kind: meta.kind, chars: meta.chars, path: `inputs/${file}`, textPath: `inputs/${file}.txt`, note: meta.note });
        // tệp đã thuộc về nhiệm vụ → xóa bản tạm (tối thiểu hóa số bản sao)
        this.d.uploads.remove(meta.id);
      }
    }
    store.put(task, true);
    this.d.logs.write({
      level: 'info',
      kind: 'task.created',
      msg: `Nhận nhiệm vụ: ${task.title}`,
      taskId: task.id,
      projectId: task.projectId,
      data: { mode, department: input.department, budgetTokens: task.options.budgetTokens, budgetMode, attachments: task.attachments?.map((a) => ({ name: a.name, kind: a.kind, chars: a.chars })) },
    });
    this.emitTask(task);
    this.queue.push(task.id);
    this.pump();
    return task;
  }

  cancel(id: string): boolean {
    const t = this.d.store.get(id);
    if (!t) return false;
    if (t.status === 'queued' || t.status === 'paused') {
      this.queue = this.queue.filter((q) => q !== id);
      this.clearResumeTimer(id);
      t.status = 'cancelled';
      t.pause = undefined;
      t.finishedAt = nowIso();
      this.d.logs.write({ level: 'warn', kind: 'task.cancelled', msg: `${t.id}: hủy theo yêu cầu`, taskId: t.id });
      this.save(t, true);
      return true;
    }
    const c = this.controllers.get(id);
    if (!c) return false;
    c.abort();
    return true;
  }

  /** Yêu cầu tạm dừng nhiệm vụ đang chạy: các lượt đang gọi chạy nốt, không bắt đầu lượt mới. */
  pause(id: string): boolean {
    const t = this.d.store.get(id);
    if (!t || (t.status !== 'running' && t.status !== 'queued')) return false;
    if (t.status === 'queued') {
      this.queue = this.queue.filter((q) => q !== id);
      t.status = 'paused';
      t.pause = { reason: 'manual', detail: 'Tạm dừng theo yêu cầu', at: nowIso() };
      this.save(t, true);
      return true;
    }
    this.pauseRequests.add(id);
    this.d.logs.write({ level: 'info', kind: 'task.pause.requested', msg: `${id}: yêu cầu tạm dừng — chờ các lượt đang chạy xong`, taskId: id });
    return true;
  }

  /** Đổi ngân sách / chế độ ngân sách khi nhiệm vụ đang chạy hoặc tạm dừng. */
  updateBudget(id: string, o: ResumeOptions): Task {
    const t = this.d.store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    this.applyBudget(t, o);
    this.save(t, true);
    return t;
  }

  /** Tiếp tục nhiệm vụ tạm dừng / lỗi / đã hủy từ checkpoint (bỏ qua phần đã xong). */
  resume(id: string, o: ResumeOptions = {}): Task {
    const { store, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    const hasRerun = o.rerun === 'all' || (Array.isArray(o.rerun) && o.rerun.length > 0);
    if (!['paused', 'failed', 'cancelled'].includes(t.status) && !(t.status === 'done' && hasRerun))
      throw new Error(`Nhiệm vụ đang ở trạng thái "${t.status}" — chỉ tiếp tục được khi tạm dừng, lỗi hoặc đã hủy (nhiệm vụ đã xong: chọn hạng mục cần chạy lại)`);
    this.applyBudget(t, o);
    t.options.budgetMode ??= this.d.config.defaults.budgetMode;
    if (t.options.budgetMode === 'pause' && totalTokens(t.usage) >= t.options.budgetTokens)
      throw new Error(`Đã dùng ${fmtNum(totalTokens(t.usage))}/${fmtNum(t.options.budgetTokens)} token — hãy tăng ngân sách hoặc chọn "Chạy tới khi hoàn thành"`);
    this.clearResumeTimer(id);
    const rerun = o.rerun === 'all' ? 'all' : new Set(o.rerun ?? []);
    for (const r of t.runs) {
      const again = r.subtasks.filter((s) => s.status === 'done' && (rerun === 'all' || rerun.has(s.id)));
      if (again.length) {
        for (const s of again) {
          s.status = 'pending';
          s.draft = s.output;
        }
        // làm lại thực thi → review & tổng hợp cũng chạy lại
        if (r.stage && STAGES.indexOf(r.stage) > STAGES.indexOf('finalized')) r.stage = 'finalized';
        r.stage ??= inferStage(r);
        if (r.stage && STAGES.indexOf(r.stage) > STAGES.indexOf('finalized')) r.stage = 'finalized';
        r.review = undefined;
        r.finalPath = undefined;
        r.status = 'pending';
        logs.write({ level: 'info', kind: 'task.rerun', msg: `${t.id}: chạy lại ${again.map((s) => s.id).join(', ')}`, taskId: t.id, department: r.department });
      }
      if (r.status !== 'done') r.status = 'pending';
      for (const s of r.subtasks)
        if (s.status === 'failed' || s.status === 'skipped' || s.status === 'running') {
          s.status = 'pending';
          s.error = undefined;
        }
    }
    const prev = t.pause?.reason ?? t.status;
    t.status = 'queued';
    t.pause = undefined;
    t.error = undefined;
    t.finishedAt = undefined;
    t.resumes = (t.resumes ?? 0) + 1;
    logs.write({ level: 'info', kind: 'task.resumed', msg: `Tiếp tục ${t.id} từ checkpoint (trước đó: ${prev}) — ngân sách ${fmtNum(t.options.budgetTokens)} · ${t.options.budgetMode === 'complete' ? 'chạy tới khi hoàn thành' : 'dừng khi chạm trần'}`, taskId: t.id, projectId: t.projectId });
    this.message(t, 'office', 'system', 'system', `▶ Tiếp tục nhiệm vụ từ checkpoint (lần ${t.resumes}) — các phần đã xong được giữ nguyên.`);
    this.save(t, true);
    this.queue.push(t.id);
    this.pump();
    return t;
  }

  /**
   * Đóng gói nhiệm vụ vào một dự án: tạo/cập nhật dự án (workspace, quyền công cụ…), chép sản phẩm đã có vào
   * <workspace>/.ccoding/<task>/ và gắn nhiệm vụ vào dự án; tùy chọn tiếp tục chạy ngay.
   */
  packageTask(id: string, o: PackageOptions = {}): { task: Task; project: ProjectDef } {
    const { store, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    if (t.status === 'running' || t.status === 'queued') throw new Error('Hãy tạm dừng nhiệm vụ trước khi đóng gói');
    const pid = (o.projectId ?? t.projectId ?? slugify(t.title)).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(pid)) throw new Error('Mã dự án: chữ thường, số, gạch ngang (2–41 ký tự)');
    const existing = store.project(pid);
    const project: ProjectDef = {
      ...(existing ?? {
        id: pid,
        name: t.title.slice(0, 120),
        description: t.brief.slice(0, 1500),
        department: t.departments.length > 1 ? 'joint' : (t.departments[0] ?? t.department ?? 'auto'),
        classification: t.classification,
        createdAt: nowIso(),
      }),
      ...(o.name ? { name: o.name.slice(0, 120) } : {}),
      ...(o.description ? { description: o.description.slice(0, 2000) } : {}),
      ...(o.workspace ? { workspace: o.workspace } : {}),
      ...(o.toolAccess ? { toolAccess: o.toolAccess } : {}),
      ...(o.isolation ? { isolation: o.isolation } : {}),
    } as ProjectDef;
    project.budgetTokens = Math.max(project.budgetTokens ?? 0, t.options.budgetTokens);
    project.budgetMode = o.budgetMode ?? project.budgetMode ?? t.options.budgetMode;
    store.saveProject(project);
    // chép sản phẩm sang workspace gốc của dự án
    const base = this.workspaceFor(t, project);
    const dest = path.join(base, '.ccoding', safeName(t.id));
    ensureDir(dest);
    ensureCcIgnore(base);
    const src = store.runDir(t.id);
    for (const sub of ['outputs', 'inputs']) {
      const from = path.join(src, sub);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, sub), { recursive: true });
    }
    for (const f of fs.existsSync(src) ? fs.readdirSync(src).filter((x) => x.endsWith('FINAL.md')) : []) fs.copyFileSync(path.join(src, f), path.join(dest, f));
    const movedWorkspace = t.projectId !== project.id;
    t.projectId = project.id;
    t.classification = project.classification;
    if (movedWorkspace) {
      t.workspace = undefined;
      t.branch = undefined;
      t.baseRef = undefined;
    }
    logs.write({ level: 'info', kind: 'task.packaged', msg: `Đóng gói ${t.id} vào dự án ${project.id} (${base})`, taskId: t.id, projectId: project.id });
    this.message(t, 'office', 'system', 'system', `📦 Đã đóng gói vào dự án **${project.name}** (${project.id}) — workspace \`${base}\`, sản phẩm đã có chép vào \`.ccoding/${safeName(t.id)}/\`.`);
    this.save(t, true);
    if (o.resume) this.resume(t.id, o);
    return { task: t, project };
  }

  /** Chờ một nhiệm vụ kết thúc hoặc tạm dừng (dùng cho CLI chế độ độc lập & kiểm thử). */
  waitFor(id: string): Promise<Task> {
    return new Promise((resolve) => {
      const check = () => {
        const t = this.d.store.get(id);
        if (t && ['done', 'failed', 'cancelled', 'paused'].includes(t.status) && !this.active.has(id)) {
          off();
          resolve(t);
        }
      };
      const off = this.d.bus.subscribe((ev) => {
        if (ev.type === 'task' && ev.task.id === id) setImmediate(check);
      });
      check();
    });
  }

  states(): AgentState[] {
    return [...this.agentStates.values()];
  }

  // ── Cảnh báo ──────────────────────────────────────────────────────────────

  alert(a: Omit<Alert, 'id' | 'ts'>): Alert {
    const full: Alert = { ...a, id: shortId('a'), ts: nowIso() };
    this.alerts.push(full);
    if (this.alerts.length > 100) this.alerts.splice(0, this.alerts.length - 100);
    this.d.bus.publish({ type: 'alert', alert: full });
    this.d.logs.write({ level: a.level, kind: `alert.${a.kind}`, msg: `${a.title} — ${a.msg}`, taskId: a.taskId, data: { runtime: a.runtime } });
    if (a.level !== 'info') void this.d.herdr?.notify(`CCoding: ${a.title}`, a.msg);
    return full;
  }

  // ── Hàng đợi ──────────────────────────────────────────────────────────────

  private pump(): void {
    while (this.active.size < this.d.config.maxConcurrentTasks && this.queue.length) {
      const id = this.queue.shift()!;
      const t = this.d.store.get(id);
      if (!t || t.status !== 'queued') continue;
      this.active.add(id);
      void this.runTask(t).finally(() => {
        this.active.delete(id);
        const cur = this.d.store.get(id);
        if (cur) this.emitTask(cur);
        this.pump();
      });
    }
  }

  private scheduleResume(t: Task): void {
    if (!t.pause?.resumeAt) return;
    this.clearResumeTimer(t.id);
    const delay = Math.max(5_000, Date.parse(t.pause.resumeAt) - Date.now());
    const timer = setTimeout(() => {
      this.resumeTimers.delete(t.id);
      const cur = this.d.store.get(t.id);
      if (cur?.status !== 'paused' || cur.pause?.reason !== 'quota') return;
      try {
        this.resume(cur.id);
      } catch (e) {
        this.d.logs.write({ level: 'warn', kind: 'task.autoresume', msg: `${cur.id}: không tự tiếp tục được — ${(e as Error).message}`, taskId: cur.id });
      }
    }, Math.min(delay, 2 ** 31 - 1));
    timer.unref?.();
    this.resumeTimers.set(t.id, timer);
  }

  private clearResumeTimer(id: string): void {
    const t = this.resumeTimers.get(id);
    if (t) clearTimeout(t);
    this.resumeTimers.delete(id);
  }

  // ── Một nhiệm vụ ──────────────────────────────────────────────────────────

  private async runTask(task: Task): Promise<void> {
    const { store, logs, registry } = this.d;
    const ctrl = new AbortController();
    this.controllers.set(task.id, ctrl);
    this.pauseRequests.delete(task.id);
    task.status = 'running';
    task.startedAt ??= nowIso();
    this.save(task, true);
    logs.write({ level: 'info', kind: 'task.start', msg: `${task.resumes ? 'Tiếp tục' : 'Bắt đầu'} ${task.id} (${task.mode})`, taskId: task.id, projectId: task.projectId });
    const project = task.projectId ? store.project(task.projectId) : undefined;
    try {
      this.prepareWorkspace(task, project);
      if (!task.runs.length) {
        let depts: string[];
        if (task.mode === 'department') depts = [task.department!];
        else if (task.mode === 'joint') depts = orderJoint([...registry.departments.keys()].filter((k) => k === 'research' || k === 'dev'));
        else if (task.mode === 'project' && project?.department && project.department !== 'auto') {
          depts = project.department === 'joint' ? orderJoint(['research', 'dev']) : [project.department];
        } else depts = await this.route(task, project);
        depts = depts.filter((d) => registry.departments.has(d));
        if (!depts.length) depts = [[...registry.departments.keys()][0]];
        task.departments = depts;
        task.runs = depts.map((d) => ({ department: d, status: 'pending', subtasks: [], usage: emptyUsage() }));
        this.save(task);
      }

      let prior: string | undefined;
      for (const run of task.runs) {
        this.checkAbort(task);
        let final: string;
        if (run.status === 'done' && run.finalPath) final = store.readRunFile(task.id, run.finalPath) ?? '';
        else final = await this.runDepartment(task, run, project, prior);
        prior = `# Từ ${registry.department(run.department).name}\n\n${final}`;
      }
      this.finishWorkspace(task);
      this.writeFinal(task);
      task.status = 'done';
      task.phase = undefined;
      logs.write({ level: 'info', kind: 'task.done', msg: `Hoàn thành ${task.id} — ${fmtNum(totalTokens(task.usage))} token`, taskId: task.id, projectId: task.projectId, data: { usage: task.usage } });
      void this.d.herdr?.notify(`CCoding: xong ${task.id}`, task.title);
    } catch (e) {
      if (e instanceof PauseSignal && !ctrl.signal.aborted) {
        task.status = 'paused';
        task.pause = { reason: e.reason, detail: e.message, at: nowIso(), resumeAt: e.resumeAt ? new Date(e.resumeAt).toISOString() : undefined };
        for (const r of task.runs) if (r.status === 'running' || r.status === 'pending') r.status = r.subtasks.length || r.status === 'running' ? 'paused' : r.status;
        for (const r of task.runs) for (const s of r.subtasks) if (s.status === 'running') s.status = 'pending';
        logs.write({ level: 'warn', kind: 'task.paused', msg: `${task.id} tạm dừng (${e.reason}): ${e.message}`, taskId: task.id, projectId: task.projectId, data: { resumeAt: task.pause.resumeAt } });
        this.message(task, 'office', 'system', 'system', `⏸ Tạm dừng: ${e.message}${task.pause.resumeAt ? `\nSẽ tự tiếp tục lúc ${new Date(task.pause.resumeAt).toLocaleString('vi-VN')}.` : ''}`);
        this.alert({
          level: e.reason === 'manual' ? 'info' : 'warn',
          kind: `task.paused.${e.reason}`,
          title: e.reason === 'budget' ? 'Chạm trần ngân sách — đã tạm dừng' : e.reason === 'quota' ? 'Hết tài nguyên token — đã tạm dừng' : 'Đã tạm dừng',
          msg: `${task.title}: ${e.message}`,
          taskId: task.id,
        });
        if (task.runs.some((r) => r.subtasks.some((s) => s.output))) this.writeFinal(task);
        if (task.pause.resumeAt) this.scheduleResume(task);
      } else {
        const cancelled = ctrl.signal.aborted || e instanceof CancelledError;
        task.status = cancelled ? 'cancelled' : 'failed';
        task.error = cancelled ? 'Đã hủy theo yêu cầu' : (e as Error).message;
        for (const r of task.runs) if (r.status === 'running' || r.status === 'pending') r.status = cancelled ? 'cancelled' : 'failed';
        for (const r of task.runs) for (const s of r.subtasks) if (s.status === 'running' || s.status === 'pending') s.status = 'skipped';
        logs.write({ level: cancelled ? 'warn' : 'error', kind: cancelled ? 'task.cancelled' : 'task.failed', msg: `${task.id}: ${task.error}`, taskId: task.id, projectId: task.projectId });
        if (!cancelled) this.alert({ level: 'error', kind: 'task.failed', title: 'Nhiệm vụ lỗi', msg: `${task.title}: ${task.error} — có thể bấm "Tiếp tục" để chạy lại phần chưa xong`, taskId: task.id });
        if (!cancelled && task.runs.some((r) => r.subtasks.some((s) => s.output))) this.writeFinal(task);
      }
    } finally {
      task.finishedAt = task.status === 'paused' ? undefined : nowIso();
      this.controllers.delete(task.id);
      this.pauseRequests.delete(task.id);
      for (const [id, st] of this.agentStates)
        if (st.taskId === task.id) this.setAgent(id, { status: 'idle', activity: undefined, taskId: undefined, subtaskId: undefined, phase: undefined });
      for (const [id, h] of this.holds) if (h.taskId === task.id) this.holds.delete(id);
      this.save(task, true);
    }
  }

  private async route(task: Task, project?: ProjectDef): Promise<string[]> {
    const { registry } = this.d;
    const depts = [...registry.departments.values()];
    const router = registry.router();
    task.phase = 'route';
    this.save(task);
    let result = undefined as ReturnType<typeof parseRoute>;
    let by = 'keywords';
    if (router) {
      const res = await this.call(router, 'route', () => ({ context: '', prompt: P.routePrompt(task, depts, project) }), {
        task,
        project,
        cwd: task.workspace ?? this.workspaceFor(task, project),
        hints: { brief: task.brief, departments: depts.map((d) => ({ id: d.id, name: d.name, keywords: d.keywords })) },
      });
      result = parseRoute(res.text, depts.map((d) => d.id));
      if (result) by = router.id;
    }
    result ??= keywordRoute(task.brief, depts);
    task.routing = { departments: result.departments, reason: result.reason, by };
    if ((task as Task & { autoTitle?: boolean }).autoTitle && result.title) task.title = result.title.slice(0, 90);
    this.message(task, 'office', router?.id ?? 'system', 'decision', `Định tuyến → ${result.departments.map((d) => registry.department(d).name).join(' → ')}. ${result.reason}`);
    return result.departments;
  }

  private pctx(task: Task, dept: DepartmentDef, project: ProjectDef | undefined, roster: AgentDef[]): P.Ctx {
    const access = this.toolAccess(task, project);
    const ccDir = `.ccoding/${safeName(task.id)}`;
    const attachments: P.AttachmentText[] = (task.attachments ?? []).map((a) => ({
      name: a.name,
      kind: a.kind,
      chars: a.chars,
      note: a.note,
      text: a.textPath ? (this.d.store.readRunFile(task.id, a.textPath) ?? '') : '',
      wsPath: a.textPath ? `${ccDir}/${a.textPath}` : undefined,
    }));
    return { task, dept, project, cwd: task.workspace ?? this.workspaceFor(task, project), roster, attachments, filesAccessible: access !== 'none', ccDir, branch: task.branch };
  }

  private async runDepartment(task: Task, run: DeptRun, project: ProjectDef | undefined, prior?: string): Promise<string> {
    const { registry } = this.d;
    const dept = registry.department(run.department);
    const roster = registry.members(dept.id, project?.agents);
    const lead = registry.agent(dept.lead);
    const reviewer = dept.reviewer ? registry.agents.get(dept.reviewer) : undefined;
    const pctx = this.pctx(task, dept, project, roster);
    const base: CallCtx = { task, dept, run, project, cwd: pctx.cwd };
    const names = new Map([...registry.agents.values()].map((a) => [a.id, a.name]));
    const rosterHints = roster.map((a) => ({ id: a.id, name: a.name, title: a.title, role: a.role, skills: a.skills }));
    run.status = 'running';
    run.startedAt ??= nowIso();
    run.stage ??= inferStage(run);
    if (run.stage && task.resumes) this.d.logs.write({ level: 'info', kind: 'checkpoint', msg: `${dept.short}: tiếp tục sau mốc "${run.stage}"`, taskId: task.id, department: dept.id });

    // 1) Lập kế hoạch
    let plan: ReturnType<typeof parsePlan> | undefined;
    if (!reached(run, 'planned')) {
      this.setPhase(task, run, 'plan');
      const planRes = await this.call(lead, 'plan', (tools) => P.planPrompt(pctx, prior, tools), { ...base, hints: { brief: task.brief, roster: rosterHints, department: dept.name } });
      plan = parsePlan(planRes.text, roster, lead, task.brief);
      run.subtasks = plan.subtasks;
      run.planSummary = plan.summary;
      run.stage = 'planned';
      this.message(task, dept.id, lead.id, 'plan', `${plan.summary || 'Kế hoạch dự thảo'}\n${P.planText(plan.subtasks)}${plan.parsed ? '' : '\n(_kế hoạch dự phòng — trả lời của trưởng phòng không đúng định dạng_)'}`);
      this.save(task);
    }

    // 2) Họp thảo luận + chốt (tự bỏ qua khi kế hoạch nhỏ)
    if (!reached(run, 'finalized')) {
      const rounds = task.options.discussionRounds;
      const assignees = [...new Set(run.subtasks.map((s) => s.assignee))].filter((x) => x !== lead.id);
      const participantIds = [...new Set([...assignees, task.options.review ? reviewer?.id : undefined].filter((x): x is string => !!x && x !== lead.id))].slice(0, 5);
      const small = run.subtasks.length <= 2 || participantIds.length < 2;
      if (rounds > 0 && !small) {
        this.setPhase(task, run, 'discuss');
        const participants = participantIds.map((id) => registry.agent(id));
        const meeting = [lead, ...participants];
        for (const a of meeting) this.hold(a.id, { status: 'discussing', activity: 'Đang họp phòng', taskId: task.id, phase: 'discuss' });
        try {
          for (let r = 1; r <= rounds; r++) {
            for (const a of participants) {
              this.checkAbort(task);
              const transcript = P.transcriptText(this.d.store.transcript(task.id).filter((m) => m.department === dept.id && m.kind !== 'final'), names, 6000);
              const res = await this.call(a, 'discuss', () => P.discussPrompt(pctx, a, run.planSummary ?? '', run.subtasks, transcript, r, rounds), { ...base, hints: { brief: task.brief } });
              if (res.text) this.message(task, dept.id, a.id, 'discussion', res.text.slice(0, 1500), { round: r });
            }
          }
          this.setPhase(task, run, 'finalize');
          const transcript = P.transcriptText(this.d.store.transcript(task.id).filter((m) => m.department === dept.id), names, 8000);
          const fin = await this.call(lead, 'finalize', () => P.finalizePrompt(pctx, run.planSummary ?? '', run.subtasks, transcript), {
            ...base,
            hints: { brief: task.brief, planSummary: run.planSummary, subtasks: run.subtasks.map(stHint) },
          });
          const revised = parsePlan(fin.text, roster, lead, task.brief);
          if (revised.parsed) {
            plan = revised;
            run.subtasks = revised.subtasks;
            run.planSummary = revised.summary || run.planSummary;
          }
          run.decisions = (plan?.decisions ?? []).join('; ');
          this.message(task, dept.id, lead.id, 'decision', `Chốt kế hoạch${plan?.decisions.length ? `:\n${plan.decisions.map((x) => `- ${x}`).join('\n')}` : '.'}\n${P.planText(run.subtasks)}`);
        } finally {
          for (const a of meeting) this.release(a.id, task.id);
        }
      } else if (rounds > 0) {
        this.message(task, dept.id, 'system', 'system', `Bỏ qua họp: kế hoạch nhỏ (${run.subtasks.length} hạng mục, ${participantIds.length} người) — vào thực thi luôn để tiết kiệm token.`);
        run.decisions ??= '';
      }
      run.stage = 'finalized';
      this.save(task);
    }

    // 3) Thực thi
    if (!reached(run, 'executed')) {
      this.setPhase(task, run, 'execute');
      await this.executeAll(task, run, pctx, base, prior);
      run.stage = 'executed';
      this.save(task);
    }

    // 4) Review & sửa
    const done = () => run.subtasks.filter((s) => s.status === 'done' && s.output);
    if (!reached(run, 'reviewed')) {
      if (task.options.review && reviewer && done().length) {
        for (let attempt = 0; attempt <= task.options.maxRevisions; attempt++) {
          this.checkAbort(task);
          this.setPhase(task, run, 'review');
          const items = done().map((st) => this.depInput(task, st));
          const changes = this.workspaceChanges(task);
          const res = await this.call(reviewer, 'review', (tools) => P.reviewPrompt(pctx, items, tools, changes), {
            ...base,
            hints: { brief: task.brief, subtasks: items.map((i) => stHint(i.st)), attempt },
          });
          const review = parseReview(res.text, items.map((i) => i.st.id));
          run.review = { approved: review.approved, summary: review.summary, issues: review.issues };
          this.message(
            task,
            dept.id,
            reviewer.id,
            'review',
            `${review.approved ? '✅ Duyệt' : '⚠️ Cần sửa'} — ${review.summary}${review.issues.length ? `\n${review.issues.map((i) => `- [${i.severity}] ${i.subtask}: ${i.comment}`).join('\n')}` : ''}`,
          );
          const targets = run.subtasks.filter((s) => s.status === 'done' && review.issues.some((i) => i.subtask === s.id && i.severity !== 'minor'));
          if (review.approved || !targets.length || attempt === task.options.maxRevisions) break;
          this.setPhase(task, run, 'revise');
          const results = await Promise.allSettled(
            targets.map(async (st) => {
              const agent = registry.agent(st.assignee);
              const issues = review.issues.filter((i) => i.subtask === st.id).map((i) => `- [${i.severity}] ${i.comment}`).join('\n');
              const prev = this.depInput(task, st);
              const r = await this.call(agent, 'revise', (tools) => P.revisePrompt(pctx, st, prev.text, issues, tools, prev.wsPath), {
                ...base,
                subtask: st,
                activity: `Sửa ${st.id} theo review`,
                hints: { brief: task.brief, subtask: stHint(st) },
              });
              if (r.text) {
                st.attempts++;
                this.writeOutput(task, run, st, agent, r);
                this.message(task, dept.id, agent.id, 'handoff', `Đã sửa ${st.id} theo review: ${extractSummary(r.text, 200)}`, { subtaskId: st.id });
              }
            }),
          );
          const stop = results.find((x): x is PromiseRejectedResult => x.status === 'rejected');
          if (stop) throw stop.reason;
        }
      }
      run.stage = 'reviewed';
      this.save(task);
    }

    // 5) Báo cáo tổng hợp
    this.checkAbort(task);
    this.setPhase(task, run, 'synthesize');
    const items = done().map((st) => this.depInput(task, st));
    const reviewText = run.review ? `${run.review.approved ? 'Đã duyệt' : 'Chưa duyệt hoàn toàn'}: ${run.review.summary}` : '';
    const changes = this.workspaceChanges(task);
    const fin = await this.call(lead, 'synthesize', (tools) => P.synthesizePrompt(pctx, run.planSummary ?? '', run.decisions ?? '', items, reviewText, prior, changes, tools), {
      ...base,
      hints: { brief: task.brief, subtasks: run.subtasks.map(stHint), departmentName: dept.name },
    });
    const finalText = fin.text || `# ${dept.name}\n\n(Trưởng phòng không trả về báo cáo — xem các file đầu ra.)`;
    const rel = `${safeName(dept.id)}-FINAL.md`;
    writeText(path.join(this.d.store.runDir(task.id), rel), finalText);
    run.finalPath = rel;
    run.status = run.subtasks.some((s) => s.status === 'failed') ? 'failed' : 'done';
    run.stage = 'done';
    run.finishedAt = nowIso();
    run.phase = undefined;
    this.message(task, dept.id, lead.id, 'final', `Báo cáo tổng hợp đã xong: ${extractSummary(finalText, 240)}`);
    this.save(task);
    return finalText;
  }

  private async executeAll(task: Task, run: DeptRun, pctx: P.Ctx, base: CallCtx, prior?: string): Promise<void> {
    const busy = new Set<string>();
    const inflight = new Map<string, Promise<void>>();
    let stop: unknown;
    for (;;) {
      if (!stop) {
        try {
          this.checkAbort(task);
        } catch (e) {
          stop = e;
        }
      }
      if (!stop) {
        for (const st of blockedSubtasks(run.subtasks)) {
          st.status = 'skipped';
          st.error = 'Phụ thuộc thất bại';
        }
        const slots = task.options.maxParallel - inflight.size;
        const ready = slots > 0 ? readySubtasks(run.subtasks, busy).slice(0, slots) : [];
        for (const st of ready) {
          st.status = 'running';
          busy.add(st.assignee);
          const p = this.runSubtask(task, run, st, pctx, base, prior)
            .catch((e) => {
              stop ??= e;
              if (st.status === 'running') st.status = 'pending';
            })
            .finally(() => {
              busy.delete(st.assignee);
              inflight.delete(st.id);
            });
          inflight.set(st.id, p);
        }
      }
      this.save(task);
      if (!inflight.size) break;
      // tạm dừng: chờ các hạng mục đang chạy làm xong để không mất công; hủy/lỗi khác: thoát ngay
      if (stop && !(stop instanceof PauseSignal)) break;
      await Promise.race(inflight.values());
    }
    if (stop) throw stop;
  }

  private depInput(task: Task, st: Subtask): P.DepInput {
    const ws = st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined;
    return { st, text: this.readOutput(task, st), wsPath: ws };
  }

  private async runSubtask(task: Task, run: DeptRun, st: Subtask, pctx: P.Ctx, base: CallCtx, prior?: string): Promise<void> {
    const { registry } = this.d;
    const agent = registry.agent(st.assignee);
    st.startedAt = nowIso();
    const deps = st.dependsOn
      .map((id) => run.subtasks.find((s) => s.id === id))
      .filter((s): s is Subtask => !!s && !!s.output)
      .map((s) => this.depInput(task, s));
    const draft = st.draft ? { text: (this.d.store.readRunFile(task.id, st.draft) ?? '').replace(/^<!--[\s\S]*?-->\s*/, ''), wsPath: `.ccoding/${safeName(task.id)}/${st.draft}` } : undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.call(agent, 'execute', (tools) => P.executePrompt(pctx, agent, st, run.planSummary ?? '', run.decisions ?? '', deps, tools, prior, run.subtasks, draft), {
        ...base,
        subtask: st,
        activity: `${st.id}: ${st.title}`,
        hints: { brief: task.brief, subtask: stHint(st) },
      });
      st.attempts++;
      if (res.text && !res.error) {
        this.writeOutput(task, run, st, agent, res);
        st.status = 'done';
        st.error = undefined;
        st.draft = undefined;
        st.finishedAt = nowIso();
        const next = run.subtasks.filter((s) => s.dependsOn.includes(st.id)).map((s) => `@${s.assignee}`);
        const tools = res.toolCalls?.length ? ` · ${res.toolCalls.length} thao tác công cụ` : '';
        this.message(task, run.department, agent.id, 'handoff', `Xong ${st.id} — ${st.summary}${tools}${next.length ? `\n→ Bàn giao cho ${[...new Set(next)].join(', ')}` : ''}`, { subtaskId: st.id });
        return;
      }
      st.error = res.error ?? `Không có nội dung trả về${res.diag ? ` (${res.diag})` : ''}`;
      this.d.logs.write({ level: 'warn', kind: 'subtask.retry', msg: `${st.id} lỗi lần ${attempt}: ${st.error}`, taskId: task.id, agentId: agent.id, department: run.department, subtaskId: st.id });
    }
    st.status = 'failed';
    st.finishedAt = nowIso();
    this.message(task, run.department, 'system', 'system', `${st.id} (@${st.assignee}) thất bại: ${st.error}`, { subtaskId: st.id });
  }

  // ── Ngân sách ─────────────────────────────────────────────────────────────

  private applyBudget(t: Task, o: ResumeOptions): void {
    const used = totalTokens(t.usage);
    const before = t.options.budgetTokens;
    if (o.budgetTokens && o.budgetTokens > 0) t.options.budgetTokens = Math.max(1000, Math.floor(o.budgetTokens));
    if (o.addBudget && o.addBudget > 0) t.options.budgetTokens = Math.max(t.options.budgetTokens, used) + Math.floor(o.addBudget);
    if (o.budgetMode === 'pause' || o.budgetMode === 'complete') t.options.budgetMode = o.budgetMode;
    if (o.runtime !== undefined) t.options.runtime = o.runtime || undefined;
    // ngân sách mới → các mốc cảnh báo tính lại
    const pct = (used / t.options.budgetTokens) * 100;
    if (pct < 80) t.budgetAlerted = 0;
    else if (pct < 100) t.budgetAlerted = Math.min(t.budgetAlerted ?? 0, 80);
    if (before !== t.options.budgetTokens || o.budgetMode)
      this.d.logs.write({ level: 'info', kind: 'budget.update', msg: `${t.id}: ngân sách ${fmtNum(before)} → ${fmtNum(t.options.budgetTokens)} · chế độ ${t.options.budgetMode}`, taskId: t.id });
  }

  /** Cảnh báo 80% / 100% / mỗi +50% vượt trần; chế độ "pause" thì tạm dừng khi chạm trần. */
  private checkBudget(task: Task): void {
    const budget = task.options.budgetTokens;
    if (!budget) return;
    const used = totalTokens(task.usage);
    const pct = (used / budget) * 100;
    const mode = task.options.budgetMode ?? this.d.config.defaults.budgetMode ?? 'complete';
    const level = pct >= 100 ? 100 + Math.floor((pct - 100) / 50) * 50 : pct >= 80 ? 80 : 0;
    if (level > (task.budgetAlerted ?? 0)) {
      const first100 = level >= 100 && (task.budgetAlerted ?? 0) < 100;
      task.budgetAlerted = level;
      const over = level >= 100;
      this.alert({
        level: over && mode === 'pause' ? 'error' : 'warn',
        kind: first100 ? 'budget.100' : over ? 'budget.over' : 'budget.80',
        title: over ? (mode === 'pause' ? 'Chạm trần ngân sách token' : `Vượt ngân sách${level > 100 ? ` (≥ ${level}%)` : ''} — vẫn chạy tiếp tới khi xong`) : 'Đã dùng 80% ngân sách token',
        msg: `${task.title}: ${fmtNum(used)}/${fmtNum(budget)} token (${Math.round(pct)}%)${over && mode === 'complete' ? ' — chế độ "chạy tới khi hoàn thành"' : ''}`,
        taskId: task.id,
      });
    }
    if (pct >= 100 && mode === 'pause') throw new PauseSignal('budget', `Đã dùng ${fmtNum(used)}/${fmtNum(budget)} token (chạm trần ngân sách)`);
  }

  // ── Workspace, công cụ, git ─────────────────────────────────────────────

  private toolAccess(task: Task, project?: ProjectDef): ToolAccess {
    const t = this.d.config.tools;
    return project ? (project.toolAccess ?? t.projectAccess) : t.defaultAccess;
  }

  /** Chuẩn bị thư mục làm việc: worktree git riêng (nếu dự án là repo) + .ccoding/<task>/inputs cho agent đọc. */
  private prepareWorkspace(task: Task, project?: ProjectDef): void {
    const { config, logs } = this.d;
    if (!task.workspace || !fs.existsSync(task.workspace)) {
      const base = this.workspaceFor(task, project);
      task.workspace = base;
      if (project?.workspace && (project.isolation ?? 'worktree') === 'worktree' && isGitRepo(base)) {
        const wt = path.join(config.workspacesDir, safeName(project.id), `wt-${safeName(task.id)}`);
        const branch = `ccoding/${task.id.toLowerCase()}`;
        const r = addWorktree(base, wt, branch);
        if (r.ok) {
          const copied = copyUntracked(base, wt, project.worktreeCopy ?? config.tools.worktreeCopy);
          task.workspace = wt;
          task.branch = branch;
          task.baseRef = headCommit(wt);
          logs.write({ level: 'info', kind: 'workspace.worktree', msg: `Worktree ${wt} (nhánh ${branch})${copied.length ? ` · chép ${copied.join(', ')}` : ''}`, taskId: task.id, projectId: project.id });
          this.message(task, 'office', 'system', 'system', `🌿 Làm việc trên git worktree riêng \`${wt}\` (nhánh \`${branch}\`) — nhánh chính của repo không bị đụng tới.`);
        } else {
          logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `Không tạo được worktree: ${r.out.slice(0, 300)} — làm trực tiếp trong ${base}`, taskId: task.id, projectId: project.id });
          this.alert({ level: 'warn', kind: 'workspace', title: 'Không tạo được git worktree', msg: `${r.out.slice(0, 200)} — agent làm trực tiếp trong ${base} (không commit)`, taskId: task.id });
        }
      }
    }
    ensureDir(task.workspace);
    if (this.toolAccess(task, project) === 'none') return;
    // tài liệu đầu vào cho agent đọc bằng công cụ
    const cc = path.join(task.workspace, '.ccoding', safeName(task.id));
    ensureCcIgnore(task.workspace);
    const src = path.join(this.d.store.runDir(task.id), 'inputs');
    if (fs.existsSync(src)) fs.cpSync(src, path.join(cc, 'inputs'), { recursive: true });
    const outs = path.join(this.d.store.runDir(task.id), 'outputs');
    if (fs.existsSync(outs)) fs.cpSync(outs, path.join(cc, 'outputs'), { recursive: true });
  }

  private workspaceChanges(task: Task): string {
    if (!task.branch || !task.workspace) return '';
    try {
      return changeSummary(task.workspace, task.baseRef);
    } catch {
      return '';
    }
  }

  /** Kết thúc: commit thay đổi của agent trên nhánh nhiệm vụ (không push). */
  private finishWorkspace(task: Task): void {
    if (!task.branch || !task.workspace) return;
    // agent có thể đã chuyển worktree sang nhánh khác (vd. theo quy ước nhánh của repo) → báo đúng nhánh thực tế
    const cur = currentBranch(task.workspace);
    if (cur && cur !== 'HEAD' && cur !== task.branch) {
      this.d.logs.write({ level: 'warn', kind: 'workspace.branch', msg: `Worktree đang ở nhánh ${cur} (tạo ban đầu: ${task.branch})`, taskId: task.id, projectId: task.projectId });
      this.message(task, 'office', 'system', 'system', `🌿 Agent đã làm việc trên nhánh \`${cur}\` (worktree tạo với nhánh \`${task.branch}\`). Báo cáo dùng nhánh thực tế.`);
      task.branch = cur;
    }
    task.changes = this.workspaceChanges(task);
    const r = commitAll(task.workspace, `CCoding ${task.id}: ${task.title}`.slice(0, 200));
    task.commit = r.ok ? (r.out.split('\n')[0] ?? 'ok').slice(0, 200) : `chưa commit: ${r.out.slice(0, 200)}`;
    this.d.logs.write({ level: r.ok ? 'info' : 'warn', kind: 'workspace.commit', msg: `${task.branch}: ${task.commit}`, taskId: task.id, projectId: task.projectId });
  }

  // ── Một lượt gọi agent ─────────────────────────────────────────────────────

  private async call(agent: AgentDef, phase: Phase, build: Builder, ctx: CallCtx): Promise<RunResult> {
    const { config, runtimes, logs, usage, store } = this.d;
    const task = ctx.task;
    const signal = this.controllers.get(task.id)?.signal;
    const release = await this.acquire(agent.id, signal);
    const deptId = ctx.dept?.id ?? 'office';
    const callNo = ++this.seq;
    const callId = `${task.id}#${callNo}`;
    let result: RunResult | undefined;
    let req: RunRequest | undefined;
    let cand: Candidate | undefined;
    const attempts: Array<{ runtime: string; model: string; kind: ErrorKind; error: string }> = [];
    try {
      this.checkAbort(task);
      if (this.pauseRequests.has(task.id)) throw new PauseSignal('manual', 'Tạm dừng theo yêu cầu');
      this.checkBudget(task);
      const cls = task.classification;
      const want = ctx.project?.models?.[agent.id] ?? config.phases?.models?.[phase] ?? agent.model;
      const prefs = [task.options.runtime, ctx.project?.runtime, agent.runtime, config.runtime.default];
      const { list, notes, skipped } = await runtimes.candidates(prefs, cls, want);
      if (notes.length) logs.write({ level: 'warn', kind: 'runtime.fallback', msg: `${notes.join('; ')}${list[0] ? ` → dùng ${list[0].label}` : ''}`, taskId: task.id, agentId: agent.id, department: deptId });
      if (!list.length) {
        const at = runtimes.earliestRecovery();
        throw new PauseSignal('quota', `Không còn runtime/model khả dụng${skipped.length ? `: ${skipped.join('; ')}` : ' (chưa cấu hình hoặc không kết nối được)'}`, at ?? Date.now() + 5 * 60_000);
      }
      const maxTry = Math.min(list.length, Math.max(1, config.runtime.maxFailover));
      const access = this.toolAccess(task, ctx.project);
      for (let i = 0; i < maxTry; i++) {
        cand = list[i];
        const rt = cand.runtime;
        const allow = rt.supportsTools && rt.id !== 'mock' ? toolsFor(agent.tools, access, phase) : [];
        const built = build(allow);
        const system = P.systemFor(agent, ctx.dept, cls, phase);
        const piiOut = cls === 'confidential' || cls === 'restricted';
        const outbound = (s: string) => (rt.local ? s : redact(s, { secrets: config.dataProtection.redactSecrets, pii: piiOut }));
        ensureDir(ctx.cwd);
        req = {
          agent,
          phase,
          system: outbound(system),
          context: built.context ? outbound(built.context) : undefined,
          prompt: outbound(built.prompt),
          model: cand.model,
          cwd: ctx.cwd,
          tools: cliTools(agent.tools, access, phase),
          allowTools: allow.length > 0 || (rt.supportsTools && cliTools(agent.tools, access, phase).length > 0),
          timeoutMs: config.defaults.timeoutMs,
          maxTokens: config.phases?.maxTokens?.[phase],
          toolPolicy: allow.length
            ? {
                root: ctx.cwd,
                allow,
                maxTurns: config.phases?.toolTurns?.[phase] ?? 8,
                maxInputTokens: config.phases?.toolInputBudget?.[phase],
                commandTimeoutSec: config.tools.commandTimeoutSec,
                maxOutputChars: config.tools.maxOutputChars,
                denyCommands: [...config.tools.denyCommands, ...(ctx.project?.denyCommands ?? [])],
                allowGitCommit: !!task.branch,
              }
            : undefined,
          redact: rt.local ? undefined : { secrets: config.dataProtection.redactSecrets, pii: piiOut },
          meta: { taskId: task.id, subtaskId: ctx.subtask?.id, department: deptId, projectId: task.projectId, callId: `${safeName(task.id)}-${callNo}${i ? `-r${i}` : ''}` },
          hints: ctx.hints,
        };
        const held = this.holds.get(agent.id);
        this.setAgent(agent.id, {
          // đang trong cuộc họp thì vẫn ở phòng họp (không chạy về bàn giữa các lượt)
          status: held && held.taskId === task.id ? 'discussing' : STATUS_BY_PHASE[phase],
          activity: ctx.activity ?? ACTIVITY_BY_PHASE[phase],
          taskId: task.id,
          subtaskId: ctx.subtask?.id,
          phase,
          runtime: rt.id,
        });
        const sizes = { system: req.system.length, context: req.context?.length ?? 0, prompt: req.prompt.length };
        logs.write({
          level: 'info',
          kind: 'call.start',
          msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]}${ctx.subtask ? ` ${ctx.subtask.id}` : ''} [${cand.label}]${i ? ` (thử lần ${i + 1})` : ''}`,
          taskId: task.id,
          agentId: agent.id,
          department: deptId,
          projectId: task.projectId,
          subtaskId: ctx.subtask?.id,
          phase,
          data: { callId, runtime: rt.id, model: cand.model, sizes, estTokens: estimateTokens(req.system + (req.context ?? '') + req.prompt), maxTokens: req.maxTokens, tools: allow },
        });
        if (config.dataProtection.logPrompts && i === 0) {
          const f = path.join(store.runDir(task.id), 'prompts', `${String(callNo).padStart(4, '0')}-${safeName(agent.id)}-${phase}.md`);
          writeText(f, redact(`<!-- context -->\n${req.context ?? ''}\n\n<!-- system -->\n${req.system}\n\n<!-- prompt -->\n${req.prompt}`, { secrets: true, pii: config.dataProtection.redactPii }));
        }
        let lastAct = 0;
        const hooks = {
          signal,
          onActivity: (text: string) => {
            this.d.bus.publish({ type: 'output', taskId: task.id, agentId: agent.id, chunk: `⚙ ${text.slice(0, 200)}` });
            if (Date.now() - lastAct < 700) return;
            lastAct = Date.now();
            this.setAgent(agent.id, { activity: text.slice(0, 80) });
          },
          onText: (chunk: string) => this.d.bus.publish({ type: 'output', taskId: task.id, agentId: agent.id, chunk: chunk.slice(0, 600) }),
        };
        try {
          let r: RunResult;
          if (this.runner === 'herdr' && this.d.herdr && config.herdr.agentPanes) {
            try {
              r = await this.runInHerdr(rt.id, req, agent, ctx.dept ?? OFFICE, signal);
            } catch (e) {
              if (signal?.aborted) throw e;
              logs.write({ level: 'warn', kind: 'herdr.fallback', msg: `herdr lỗi, chạy trực tiếp: ${(e as Error).message}`, taskId: task.id, agentId: agent.id, department: deptId });
              r = await rt.run(req, hooks);
            }
          } else {
            r = await rt.run(req, hooks);
          }
          if (r.error && !r.text) throw new RuntimeError(r.error, r.errorKind ?? classifyError(undefined, r.error), undefined, r.retryAt);
          if (r.truncated && r.text && CONTINUE_PHASES.has(phase)) r = await this.continueTruncated(rt, req, r, hooks, task, agent);
          result = runtimes.applyPricing(r);
          runtimes.markOk(cand.key);
          break;
        } catch (e) {
          if (signal?.aborted) throw new CancelledError('Đã hủy');
          const re = toRuntimeError(e);
          attempts.push({ runtime: rt.id, model: cand.model, kind: re.kind, error: re.message.slice(0, 300) });
          const h = runtimes.markFailure(rt.id, cand.model, re.kind, re.message, re.retryAt);
          logs.write({
            level: 'warn',
            kind: 'runtime.error',
            msg: `${agent.name} · ${cand.label}: [${re.kind}] ${re.message.slice(0, 200)}`,
            taskId: task.id,
            agentId: agent.id,
            department: deptId,
            subtaskId: ctx.subtask?.id,
            phase,
            data: { callId, kind: re.kind, status: re.status, until: h.until ? new Date(h.until).toISOString() : undefined },
          });
          if (re.kind === 'quota' || re.kind === 'auth')
            this.alert({
              level: 'warn',
              kind: `runtime.${re.kind}`,
              title: `${cand.label} ${re.kind === 'quota' ? 'hết hạn mức token' : 'lỗi xác thực'}`,
              msg: `${re.message.slice(0, 180)}${h.until ? ` — tạm ngừng tới ${new Date(h.until).toLocaleTimeString('vi-VN')}` : ''}; tự chuyển sang tài nguyên tiếp theo`,
              taskId: task.id,
              runtime: rt.id,
            });
          result = { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }, estimated: false, model: cand.model, runtime: 'n/a', durationMs: 0, error: re.message, errorKind: re.kind };
          if (!shouldFailover(re.kind)) break;
          if (this.pauseRequests.has(task.id)) throw new PauseSignal('manual', 'Tạm dừng theo yêu cầu');
          if (i + 1 < maxTry) logs.write({ level: 'warn', kind: 'runtime.failover', msg: `${agent.name}: chuyển ${cand.label} → ${list[i + 1].label}`, taskId: task.id, agentId: agent.id, department: deptId });
        }
      }
      // mọi tài nguyên đều lỗi do hạn mức/kết nối → tạm dừng nhiệm vụ và hẹn tự tiếp tục
      if (result?.error && !result.text && attempts.length && attempts.every((a) => CAPACITY_KINDS.has(a.kind))) {
        const onlyNet = attempts.every((a) => a.kind === 'transient' || a.kind === 'timeout' || a.kind === 'empty');
        const at = onlyNet ? Date.now() + 2 * 60_000 : (runtimes.earliestRecovery() ?? Date.now() + config.runtime.quotaCooldownMs);
        throw new PauseSignal('quota', `Tất cả tài nguyên đã thử đều lỗi/hết hạn mức (${attempts.map((a) => `${a.runtime}/${a.model}: ${a.kind}`).join('; ')})`, at);
      }
    } catch (e) {
      if (signal?.aborted) throw new CancelledError('Đã hủy');
      if (e instanceof PauseSignal || e instanceof CancelledError) throw e;
      result = { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }, estimated: false, model: agent.model, runtime: 'n/a', durationMs: 0, error: (e as Error).message };
    } finally {
      release();
      const hold = this.holds.get(agent.id);
      if (hold && hold.taskId === task.id) this.setAgent(agent.id, hold);
      else if (this.agentStates.get(agent.id)?.taskId === task.id) this.setAgent(agent.id, { status: result?.error ? 'error' : 'idle', activity: result?.error?.slice(0, 80), taskId: undefined, subtaskId: undefined, phase: undefined });
    }

    if (!result) throw new Error('Lượt gọi không có kết quả');
    // Sổ cái token
    const rec = {
      ts: nowIso(),
      callId,
      taskId: task.id,
      subtaskId: ctx.subtask?.id,
      projectId: task.projectId,
      department: deptId,
      agentId: agent.id,
      phase,
      runtime: result.runtime,
      model: result.model,
      requestedModel: cand?.model,
      input: result.usage.input,
      output: result.usage.output,
      cacheRead: result.usage.cacheRead,
      cacheWrite: result.usage.cacheWrite,
      costUsd: result.usage.costUsd,
      durationMs: result.durationMs,
      estimated: result.estimated,
      toolCalls: result.toolCalls?.length,
      finishReason: result.finishReason,
      error: result.error,
    };
    if (result.runtime !== 'n/a') usage.record(rec);
    const delta = { ...result.usage, estimated: result.estimated };
    if (result.runtime !== 'n/a') {
      addUsage(task.usage, delta);
      if (ctx.run) addUsage(ctx.run.usage, delta);
      if (ctx.subtask) addUsage(ctx.subtask.usage, delta);
    }
    for (const tc of result.toolCalls ?? [])
      logs.write({
        level: tc.ok ? 'info' : 'warn',
        kind: 'tool.call',
        msg: `${agent.name} · ${tc.name} ${tc.args.slice(0, 160)} ${tc.ok ? '✓' : '✗'} (${tc.ms} ms)`,
        taskId: task.id,
        agentId: agent.id,
        department: deptId,
        subtaskId: ctx.subtask?.id,
        phase,
        data: { callId, ...tc },
      });
    if (result.diag) logs.write({ level: 'warn', kind: 'call.diag', msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]}: ${result.diag}`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId } });
    if (result.truncated) logs.write({ level: 'warn', kind: 'call.truncated', msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]}: đầu ra chạm giới hạn ${req?.maxTokens ?? '?'} token`, taskId: task.id, agentId: agent.id, department: deptId, phase });
    logs.write({
      level: result.error ? 'error' : 'info',
      kind: 'call.end',
      msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]} ${result.error ? `LỖI: ${result.error.slice(0, 200)}` : 'xong'} — in ${fmtNum(result.usage.input)} / out ${fmtNum(result.usage.output)}${result.estimated ? ' (ước lượng)' : ''}${result.toolCalls?.length ? ` · ${result.toolCalls.length} công cụ` : ''}`,
      taskId: task.id,
      agentId: agent.id,
      department: deptId,
      projectId: task.projectId,
      subtaskId: ctx.subtask?.id,
      phase,
      data: { ...rec, turns: result.turns, truncated: result.truncated, preview: result.text.slice(0, 400) },
    });
    // Bản ghi đầy đủ của lượt gọi (phản hồi thô, công cụ, các lần chuyển runtime) — che bí mật/PII, chuỗi băm
    logs.record(store.callsFile(task.id), {
      ...rec,
      attempts,
      sizes: req ? { system: req.system.length, context: req.context?.length ?? 0, prompt: req.prompt.length } : undefined,
      maxTokens: req?.maxTokens,
      turns: result.turns,
      truncated: result.truncated,
      errorKind: result.errorKind,
      diag: result.diag,
      tools: result.toolCalls,
      text: result.text.slice(0, 200_000),
    });
    this.save(task);
    if (result.error && !result.text) this.setAgent(agent.id, { status: 'error', activity: result.error.slice(0, 80) });
    return result;
  }

  /** Đầu ra bị cắt do max_tokens → gọi tiếp tối đa 2 lần, nối văn bản và cộng usage. */
  private async continueTruncated(rt: Candidate['runtime'], req: RunRequest, first: RunResult, hooks: Parameters<Candidate['runtime']['run']>[1], task: Task, agent: AgentDef): Promise<RunResult> {
    let res = first;
    let text = first.text;
    const usage = { ...first.usage };
    for (let k = 1; k <= 2 && res.truncated; k++) {
      this.d.logs.write({ level: 'info', kind: 'call.continue', msg: `${agent.name}: đầu ra bị cắt — viết tiếp (lần ${k})`, taskId: task.id, agentId: agent.id });
      const r2 = await rt.run({ ...req, prompt: P.continuePrompt(req.prompt, text), toolPolicy: undefined, allowTools: false, tools: [], meta: { ...req.meta, callId: `${req.meta.callId}-c${k}` } }, hooks);
      if (!r2.text) break;
      text += r2.text;
      usage.input += r2.usage.input;
      usage.output += r2.usage.output;
      usage.cacheRead += r2.usage.cacheRead;
      usage.cacheWrite += r2.usage.cacheWrite;
      res = { ...r2, text, usage: { ...usage }, toolCalls: first.toolCalls, turns: (res.turns ?? 1) + (r2.turns ?? 1) };
    }
    return res;
  }

  private async runInHerdr(runtimeId: string, req: RunRequest, agent: AgentDef, dept: DepartmentDef, signal?: AbortSignal): Promise<RunResult> {
    const herdr = this.d.herdr!;
    const pane = await herdr.ensureAgentPane(agent, dept);
    const dir = path.join(this.d.store.runDir(req.meta.taskId), 'jobs');
    const jobFile = path.join(dir, `${req.meta.callId}.json`);
    const resultFile = path.join(dir, `${req.meta.callId}.result.json`);
    writeJsonAtomic(jobFile, { runtime: runtimeId, request: req, resultFile, paneId: pane });
    // vòng lặp công cụ (cài dependency, chạy test…) có thể dài hơn nhiều so với một lượt trả lời
    await herdr.runJob(pane, jobFile, resultFile, req.toolPolicy ? req.timeoutMs * 3 : req.timeoutMs, signal);
    const res = readJsonFile<RunResult | null>(resultFile, null);
    if (!res) throw new Error('Không đọc được kết quả từ pane herdr');
    const agentUsage = this.d.usage.total({ agent: agent.id });
    addUsage(agentUsage, { ...res.usage, estimated: res.estimated });
    void herdr.reportTokens(pane, agent, `${agent.title} · ${req.meta.taskId}`, agentUsage);
    return res;
  }

  // ── Tiện ích ──────────────────────────────────────────────────────────────

  private acquire(agentId: string, signal?: AbortSignal): Promise<() => void> {
    const prev = this.locks.get(agentId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const chained = prev.then(() => next);
    this.locks.set(agentId, chained);
    return prev.then(() => {
      if (signal?.aborted) {
        release();
        throw new CancelledError('Đã hủy');
      }
      return () => {
        release();
        if (this.locks.get(agentId) === chained) this.locks.delete(agentId);
      };
    });
  }

  private hold(agentId: string, s: Omit<AgentState, 'id' | 'since'>): void {
    this.holds.set(agentId, s);
    const cur = this.agentStates.get(agentId);
    if (!cur || cur.status === 'idle' || cur.status === 'error' || cur.taskId === s.taskId) this.setAgent(agentId, s);
  }

  private release(agentId: string, taskId: string): void {
    const h = this.holds.get(agentId);
    if (h?.taskId === taskId) this.holds.delete(agentId);
    if (this.agentStates.get(agentId)?.taskId === taskId) this.setAgent(agentId, { status: 'idle', activity: undefined, taskId: undefined, phase: undefined, subtaskId: undefined });
  }

  private setAgent(id: string, patch: Partial<AgentState>): void {
    const cur = this.agentStates.get(id) ?? { id, status: 'idle' as AgentStatus, since: nowIso() };
    const next: AgentState = { ...cur, ...patch, id };
    if (patch.status && patch.status !== cur.status) next.since = nowIso();
    this.agentStates.set(id, next);
    this.d.bus.publish({ type: 'agent', agent: next });
  }

  private setPhase(task: Task, run: DeptRun, phase: Phase): void {
    task.phase = phase;
    run.phase = phase;
    this.d.logs.write({ level: 'info', kind: 'phase', msg: `${this.d.registry.department(run.department).short}: ${ACTIVITY_BY_PHASE[phase]}`, taskId: task.id, department: run.department, phase });
    this.save(task);
  }

  private message(task: Task, department: string, from: string, kind: ChatMessage['kind'], text: string, extra: Partial<ChatMessage> = {}): void {
    const msg: ChatMessage = {
      id: shortId('m'),
      ts: nowIso(),
      taskId: task.id,
      department,
      from,
      kind,
      text: redact(text, { secrets: true, pii: this.d.config.dataProtection.redactPii }),
      ...extra,
    };
    this.d.store.addMessage(msg);
    this.d.bus.publish({ type: 'message', message: msg });
    this.d.logs.write({ level: 'info', kind: `msg.${kind}`, msg: `${from}: ${text.slice(0, 200)}`, taskId: task.id, agentId: from !== 'system' ? from : undefined, department });
  }

  private workspaceFor(task: Task, project?: ProjectDef): string {
    const { config } = this.d;
    if (project?.workspace) return path.isAbsolute(project.workspace) ? project.workspace : path.join(config.root, project.workspace);
    return path.join(config.workspacesDir, project ? safeName(project.id) : safeName(task.id));
  }

  private writeOutput(task: Task, run: DeptRun, st: Subtask, agent: AgentDef, res: RunResult): void {
    const rel = path.join('outputs', `${safeName(run.department)}-${safeName(st.id)}-${safeName(agent.id)}.md`);
    const head = `<!-- ${task.id} · ${st.id} · ${agent.id} (${agent.title}) · ${res.runtime}/${res.model} · in ${res.usage.input} / out ${res.usage.output}${res.estimated ? ' (ước lượng)' : ''}${res.toolCalls?.length ? ` · ${res.toolCalls.length} công cụ` : ''} -->\n\n`;
    writeText(path.join(this.d.store.runDir(task.id), rel), head + res.text);
    st.output = rel.replace(/\\/g, '/');
    st.summary = extractSummary(res.text);
    // bản sao trong workspace để agent khác đọc bằng công cụ
    if (task.workspace && this.toolAccess(task, task.projectId ? this.d.store.project(task.projectId) : undefined) !== 'none') {
      try {
        writeText(path.join(task.workspace, '.ccoding', safeName(task.id), rel), res.text);
      } catch {
        /* workspace chỉ đọc: bỏ qua */
      }
    }
  }

  private readOutput(task: Task, st: Subtask): string {
    if (!st.output) return '';
    const t = this.d.store.readRunFile(task.id, st.output) ?? '';
    return t.replace(/^<!--[\s\S]*?-->\s*/, '');
  }

  private writeFinal(task: Task): void {
    const { registry, usage, store } = this.d;
    const parts: string[] = [];
    for (const r of task.runs) {
      const body = r.finalPath ? store.readRunFile(task.id, r.finalPath) : undefined;
      if (body) parts.push(task.runs.length > 1 ? `<!-- ${r.department} -->\n${body}` : body);
    }
    const paused = task.status === 'paused';
    if (!parts.length) parts.push(`# ${task.title}\n\n(${paused ? 'Nhiệm vụ đang tạm dừng — chưa có báo cáo tổng hợp' : 'Chưa có báo cáo tổng hợp'}; xem các file trong outputs/.)`);
    const rows = usage
      .summary('agent', { task: task.id })
      .map((r) => `| ${registry.agents.get(r.key)?.name ?? r.key} (@${r.key}) | ${registry.agents.get(r.key)?.department ?? 'office'} | ${r.input} | ${r.output} | ${r.cacheRead} | ${r.calls} |`)
      .join('\n');
    const outputs = task.runs.flatMap((r) => r.subtasks.filter((s) => s.output).map((s) => `- \`${s.output}\` — ${s.id} ${s.title} (@${s.assignee})`));
    const git = task.branch
      ? `\n### Thay đổi trong repo\n- Worktree: \`${task.workspace}\` · nhánh: \`${task.branch}\`${task.commit ? ` · commit: ${task.commit}` : ''}\n- Xem thay đổi: \`git diff ${task.baseRef ? task.baseRef.slice(0, 10) : 'main'}..${task.branch}\` · gộp sau khi review: \`git merge ${task.branch}\` · dọn worktree: \`git worktree remove "${task.workspace}"\`\n${task.changes ? `\n\`\`\`\n${task.changes.slice(0, 3000)}\n\`\`\`\n` : ''}`
      : '';
    const appendix = `\n\n---\n\n## Phụ lục: token & sản phẩm (CCoding)\n\n- Nhiệm vụ: \`${task.id}\` · chế độ: ${task.mode} · phòng: ${task.departments.join(' → ')} · phân loại dữ liệu: ${task.classification}${paused ? ' · **đang tạm dừng**' : ''}\n- Tổng: **${fmtNum(task.usage.input)} in / ${fmtNum(task.usage.output)} out**, cache đọc ${fmtNum(task.usage.cacheRead)}, ${task.usage.calls} lượt gọi${task.usage.estimatedCalls ? ` (${task.usage.estimatedCalls} lượt ước lượng)` : ''} · ngân sách ${fmtNum(task.options.budgetTokens)} (${task.options.budgetMode === 'pause' ? 'dừng khi chạm trần' : 'chạy tới khi hoàn thành'})\n\n| Agent | Phòng | Input | Output | Cache đọc | Lượt |\n|---|---|---:|---:|---:|---:|\n${rows}\n\n### File đầu ra\n${outputs.join('\n') || '(không có)'}\n${git}`;
    writeText(path.join(store.runDir(task.id), 'FINAL.md'), (task.runs.length > 1 ? `# Báo cáo liên phòng — ${task.title}\n\n` : '') + parts.join('\n\n---\n\n') + appendix);
    task.finalPath = 'FINAL.md';
  }

  private checkAbort(task: Task): void {
    if (this.controllers.get(task.id)?.signal.aborted) throw new CancelledError('Đã hủy');
  }

  private save(task: Task, immediate = false): void {
    task.updatedAt = nowIso();
    this.d.store.put(task, immediate);
    this.emitTask(task);
  }

  private emitTask(task: Task): void {
    this.d.bus.publish({ type: 'task', task });
  }
}

/** Tên công cụ kiểu Claude Code cho runtime CLI (claude/codex/kimi) theo pha và quyền dự án. */
function cliTools(agentTools: string[], access: ToolAccess, phase: Phase): string[] {
  if (access === 'none' || phase === 'route' || phase === 'discuss') return [];
  let list = agentTools;
  if (access === 'read') list = list.filter((t) => READ_ONLY_TOOLS.has(t));
  if (access === 'write') list = list.filter((t) => t !== 'Bash');
  if (phase === 'execute' || phase === 'revise') return list;
  return list.filter((t) => READ_ONLY_TOOLS.has(t));
}

/** .ccoding/ trong workspace luôn bị git bỏ qua (chứa tài liệu đầu vào & sản phẩm trung gian). */
function ensureCcIgnore(workspace: string): void {
  const f = path.join(workspace, '.ccoding', '.gitignore');
  if (!fs.existsSync(f)) writeText(f, '# CCoding: tài liệu đầu vào & sản phẩm trung gian — không commit\n*\n');
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || `du-an-${Date.now().toString(36)}`
  );
}

/** Câu đầu tiên của yêu cầu (không cắt nhầm "Node.js", "v1.2"…). */
export function firstSentence(text: string, max: number): string {
  const line = text.trim().split('\n')[0];
  const m = /^(.+?[.!?])(\s|$)/.exec(line);
  const s = (m ? m[1].replace(/[.!?]$/, '') : line).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function stHint(s: Subtask) {
  return { id: s.id, title: s.title, assignee: s.assignee, description: s.description, dependsOn: s.dependsOn, deliverable: s.deliverable };
}

export function ensureDataDirs(dataDir: string): void {
  for (const d of ['logs', 'runs', 'usage', 'uploads']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });
}

export type { Attachment };
