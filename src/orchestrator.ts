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
import { kpiMarkdown, kpiReport } from './kpi.js';
import { subtaskHistory, type AgentHistory } from './estimate.js';
import { buildRepoMap } from './repomap.js';
import { cappedDone } from './runtimes/api.js';
import { isCheckCommand, runCheckCommand, toolsFor } from './tools/workspace.js';
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
  type CheckResult,
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
  constructor(public reason: PauseInfo['reason'], message: string, public resumeAt?: number, public title?: string) {
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

const WAIT_PHASE_LABEL: Partial<Record<Phase, string>> = { execute: 'thực thi', revise: 'sửa theo review', review: 'review' };

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
  /** Làm lại từ pha review (review → sửa → tổng hợp) hoặc chỉ báo cáo tổng hợp. */
  from?: 'review' | 'synthesize';
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

export interface SplitOptions {
  /** Hạng mục cần tách (mặc định: mọi hạng mục chưa xong). */
  subtasks?: string[];
  /** Ngân sách mỗi nhiệm vụ mới (mặc định: ước lượng cho hạng mục × 1,5, tối thiểu 400k). */
  budgetTokens?: number;
  budgetMode?: BudgetMode;
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
    return this.createTask(input);
  }

  private createTask(input: NewTaskInput, extra: { after?: string[]; splitFrom?: Task['splitFrom']; prepareInputs?: (inputsDir: string, task: Task) => void } = {}): Task {
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
        subtaskBudgetTokens: o.subtaskBudgetTokens && o.subtaskBudgetTokens > 0 ? Math.floor(o.subtaskBudgetTokens) : undefined,
      },
      after: extra.after?.length ? extra.after : undefined,
      splitFrom: extra.splitFrom,
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
    extra.prepareInputs?.(inputsDir, task);
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
    const hasFailed = t.runs.some((r) => r.subtasks.some((x) => !x.splitTo && (x.status === 'failed' || x.status === 'skipped')));
    const hasRerun = o.rerun === 'all' || (Array.isArray(o.rerun) && o.rerun.length > 0) || !!o.from || hasFailed;
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
      // còn hạng mục lỗi/bỏ qua → làm lại thực thi các hạng mục đó rồi review/tổng hợp lại
      if (r.subtasks.some((x) => !x.splitTo && (x.status === 'failed' || x.status === 'skipped'))) {
        r.stage ??= inferStage(r);
        if (r.stage && STAGES.indexOf(r.stage) > STAGES.indexOf('finalized')) {
          r.stage = 'finalized';
          r.review = undefined;
          r.finalPath = undefined;
        }
      }
      if (o.from && r.subtasks.length) {
        const back: RunStage = o.from === 'review' ? 'executed' : 'reviewed';
        r.stage ??= inferStage(r);
        if (!r.stage || STAGES.indexOf(r.stage) > STAGES.indexOf(back)) r.stage = back;
        if (o.from === 'review') r.review = undefined;
        r.finalPath = undefined;
        r.status = 'pending';
        logs.write({ level: 'info', kind: 'task.rerun', msg: `${t.id}: làm lại từ ${o.from === 'review' ? 'review' : 'báo cáo tổng hợp'} (${r.department})`, taskId: t.id, department: r.department });
      }
      if (r.status !== 'done') r.status = 'pending';
      for (const s of r.subtasks)
        if (!s.splitTo && (s.status === 'failed' || s.status === 'skipped' || s.status === 'running')) {
          s.status = 'pending';
          s.error = undefined;
        }
    }
    const prev = t.pause?.reason ?? t.status;
    // người dùng chủ động tiếp tục: bỏ điều kiện chờ các nhiệm vụ trước đã lỗi/hủy/không còn
    if (t.after?.some((a) => ['failed', 'cancelled', undefined].includes(store.get(a)?.status))) t.after = undefined;
    t.status = 'queued';
    t.pause = undefined;
    t.error = undefined;
    t.attention = undefined;
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
    let i = 0;
    while (this.active.size < this.d.config.maxConcurrentTasks && i < this.queue.length) {
      const id = this.queue[i];
      const t = this.d.store.get(id);
      if (!t || t.status !== 'queued') {
        this.queue.splice(i, 1);
        continue;
      }
      // nhiệm vụ tách ra theo thứ tự phụ thuộc: chờ nhiệm vụ trước xong
      const wait = this.waitingOn(t);
      if (wait === 'wait') {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      if (wait === 'blocked') {
        t.status = 'paused';
        t.pause = { reason: 'manual', detail: `Chờ nhiệm vụ trước (${t.after!.join(', ')}) nhưng nhiệm vụ đó lỗi/đã hủy — bấm "Tiếp tục" để vẫn chạy`, at: nowIso() };
        this.d.logs.write({ level: 'warn', kind: 'task.blocked', msg: `${t.id}: ${t.pause.detail}`, taskId: t.id });
        this.save(t, true);
        continue;
      }
      this.active.add(id);
      void this.runTask(t).finally(() => {
        this.active.delete(id);
        const cur = this.d.store.get(id);
        if (cur) this.emitTask(cur);
        this.pump();
      });
    }
  }

  /** Trạng thái chờ của nhiệm vụ có điều kiện "after": chạy được / còn chờ / bị chặn (nhiệm vụ trước lỗi, hủy, không còn). */
  private waitingOn(t: Task): undefined | 'wait' | 'blocked' {
    if (!t.after?.length) return undefined;
    const st = t.after.map((a) => this.d.store.get(a)?.status);
    if (st.every((s) => s === 'done')) return undefined;
    if (st.some((s) => s === undefined || s === 'failed' || s === 'cancelled')) return 'blocked';
    return 'wait';
  }

  /**
   * Tách hạng mục chưa xong thành các nhiệm vụ riêng ("mỗi nhiệm vụ một gói việc"): mỗi nhiệm vụ mới có yêu cầu riêng
   * (mô tả hạng mục + bối cảnh gốc + kết quả đã có), ngân sách riêng, cùng dự án/phòng; thứ tự phụ thuộc giữ bằng "after".
   */
  splitTask(id: string, o: SplitOptions = {}): { task: Task; created: Task[] } {
    const { store, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    if (t.status === 'running' || t.status === 'queued') throw new Error('Hãy tạm dừng nhiệm vụ trước khi tách');
    const want = o.subtasks?.length ? new Set(o.subtasks.map(String)) : undefined;
    const picks: Array<{ run: DeptRun; st: Subtask }> = [];
    for (const run of t.runs) for (const st of run.subtasks) if (!st.splitTo && (want ? want.has(st.id) : st.status !== 'done')) picks.push({ run, st });
    if (!picks.length) throw new Error(t.runs.some((r) => r.subtasks.length) ? 'Không còn hạng mục nào để tách (đã xong hoặc đã tách)' : 'Nhiệm vụ chưa có kế hoạch để tách');
    // tạo theo thứ tự phụ thuộc để biết id nhiệm vụ đi trước
    const ordered: typeof picks = [];
    const left = [...picks];
    while (left.length) {
      const k = left.findIndex((p) => p.st.dependsOn.every((d) => !left.some((q) => q.run === p.run && q.st.id === d)));
      ordered.push(...left.splice(k >= 0 ? k : 0, 1));
    }
    const project = t.projectId ? store.project(t.projectId) : undefined;
    const runDir = store.runDir(t.id);
    const created: Task[] = [];
    const newIds = new Map<Subtask, string>();
    for (const { run, st } of ordered) {
      const done = run.subtasks.filter((s) => s.status === 'done' && s.output);
      const deps = done.filter((s) => st.dependsOn.includes(s.id));
      const rest = done.filter((s) => !st.dependsOn.includes(s.id));
      const fromDir = `inputs/tu-${safeName(t.id)}`;
      const line = (s: Subtask) => `- **${s.id} — ${s.title}** (@${s.assignee}): ${s.summary ?? ''} — tệp: \`${fromDir}/${path.basename(s.output!)}\``;
      const brief = [
        `${st.title}`,
        '',
        `Nhiệm vụ này được tách từ hạng mục ${st.id} của nhiệm vụ ${t.id} ("${t.title}") để làm trọn một gói việc với ngân sách riêng.`,
        '',
        '## Việc cần làm',
        st.description,
        st.deliverable ? `\nSản phẩm bàn giao: ${st.deliverable}` : '',
        st.draft || st.output ? `\nĐã có bản làm dở/bản trước của hạng mục này: \`${fromDir}/${path.basename((st.output ?? st.draft)!)}\` — tận dụng phần đúng, không làm lại từ đầu.` : '',
        '',
        '## Bối cảnh — yêu cầu gốc (rút gọn)',
        t.brief.length > 6000 ? `${t.brief.slice(0, 6000)}…\n\n_(bản đầy đủ: \`inputs/YEU-CAU-GOC.md\`)_` : t.brief,
        deps.length ? `\n## Kết quả các hạng mục đi trước (đầu vào trực tiếp)\n${deps.map(line).join('\n')}` : '',
        rest.length ? `\n## Các hạng mục khác đã xong trong nhiệm vụ gốc (tham khảo)\n${rest.map(line).join('\n')}` : '',
      ]
        .filter((x) => x !== '')
        .join('\n');
      const after = st.dependsOn.map((d) => [...newIds.entries()].find(([s]) => s.id === d && run.subtasks.includes(s))?.[1]).filter((x): x is string => !!x);
      const est = this.estimatePlan(t, { ...run, subtasks: [{ ...st, status: 'pending' }] }, project);
      const nt = this.createTask(
        {
          brief,
          title: `${st.title}`.slice(0, 90),
          mode: project ? 'project' : 'department',
          department: project ? undefined : run.department,
          projectId: project?.id,
          options: {
            discussionRounds: t.options.discussionRounds,
            review: t.options.review,
            maxParallel: t.options.maxParallel,
            maxRevisions: t.options.maxRevisions,
            runtime: t.options.runtime,
            budgetTokens: o.budgetTokens && o.budgetTokens > 0 ? o.budgetTokens : Math.max(400_000, Math.round(est * 1.5)),
            budgetMode: o.budgetMode ?? t.options.budgetMode,
          },
        },
        {
          after,
          splitFrom: { taskId: t.id, subtaskId: st.id },
          prepareInputs: (inputsDir, nt) => {
            // tài liệu gốc + sản phẩm đã có (bản sao trong inputs/ của nhiệm vụ mới)
            writeText(path.join(inputsDir, 'YEU-CAU-GOC.md'), t.brief);
            const src = path.join(runDir, 'inputs');
            if (fs.existsSync(src))
              for (const f of fs.readdirSync(src)) if (f !== 'BRIEF.md' && fs.statSync(path.join(src, f)).isFile()) fs.copyFileSync(path.join(src, f), path.join(inputsDir, f));
            if (t.attachments?.length) nt.attachments = t.attachments.map((a) => ({ ...a }));
            const to = path.join(inputsDir, `tu-${safeName(t.id)}`);
            for (const s of [...deps, ...rest, st]) {
              const rel = s === st ? (st.output ?? st.draft) : s.output;
              if (!rel) continue;
              const text = store.readRunFile(t.id, rel);
              if (text !== undefined) writeText(path.join(to, path.basename(rel)), text.replace(/^<!--[\s\S]*?-->\s*/, ''));
            }
          },
        },
      );
      newIds.set(st, nt.id);
      created.push(nt);
      st.splitTo = nt.id;
      if (st.status !== 'done') {
        st.status = 'skipped';
        st.error = `Đã tách thành nhiệm vụ ${nt.id}`;
      }
    }
    t.splitInto = [...(t.splitInto ?? []), ...created.map((c) => c.id)];
    this.clearResumeTimer(t.id);
    if (t.status === 'paused' || t.status === 'failed') {
      t.status = 'cancelled';
      t.pause = undefined;
      t.error = `Đã tách thành ${created.length} nhiệm vụ riêng`;
      t.finishedAt = nowIso();
    }
    logs.write({ level: 'info', kind: 'task.split', msg: `${t.id}: tách ${created.length} hạng mục → ${created.map((c) => c.id).join(', ')}`, taskId: t.id, projectId: t.projectId });
    this.message(
      t,
      'office',
      'system',
      'system',
      `✂ Đã tách thành ${created.length} nhiệm vụ riêng (mỗi nhiệm vụ một gói việc, ngân sách riêng):\n${ordered.map(({ st }) => `- ${st.id} ${st.title} → ${st.splitTo}${created.find((c) => c.id === st.splitTo)?.after?.length ? ` (chờ ${created.find((c) => c.id === st.splitTo)!.after!.join(', ')})` : ''}`).join('\n')}`,
    );
    this.save(t, true);
    return { task: t, created };
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
      task.phase = undefined;
      // còn hạng mục lỗi/bị bỏ qua → nhiệm vụ CHƯA xong (giữ để "Tiếp tục" chạy lại phần còn thiếu), không báo "Hoàn thành"
      const unfinished = task.runs.flatMap((r) => r.subtasks.filter((s) => !s.splitTo && (s.status === 'failed' || s.status === 'skipped')));
      if (unfinished.length) {
        task.status = 'failed';
        task.error = `Còn ${unfinished.length} hạng mục chưa xong: ${unfinished.map((s) => `${s.id} (${s.status === 'skipped' ? 'bỏ qua vì phụ thuộc' : s.incomplete ? 'dừng giữa chừng' : 'lỗi'})`).join(', ')} — bấm "Tiếp tục" để làm tiếp`;
        logs.write({ level: 'warn', kind: 'task.failed', msg: `${task.id}: ${task.error}`, taskId: task.id, projectId: task.projectId, data: { usage: task.usage } });
        this.alert({ level: 'warn', kind: 'task.unfinished', title: 'Nhiệm vụ chưa xong hết', msg: `${task.title}: ${task.error}`, taskId: task.id });
      } else {
        task.status = 'done';
        logs.write({ level: 'info', kind: 'task.done', msg: `Hoàn thành ${task.id} — ${fmtNum(totalTokens(task.usage))} token${task.attention ? ` · cần xem: ${task.attention.detail}` : ''}`, taskId: task.id, projectId: task.projectId, data: { usage: task.usage } });
        if (task.attention)
          this.alert({ level: 'warn', kind: 'task.attention', title: task.attention.reason === 'review' ? 'Xong nhưng review chưa duyệt' : 'Xong nhưng lệnh kiểm tra còn lỗi', msg: `${task.title}: ${task.attention.detail} — xem báo cáo, "Làm lại từ review" hoặc tách việc còn lại`, taskId: task.id });
        void this.d.herdr?.notify(`CCoding: xong ${task.id}${task.attention ? ' (cần xem)' : ''}`, task.title);
      }
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
          title: e.title ?? (e.reason === 'budget' ? 'Chạm trần ngân sách — đã tạm dừng' : e.reason === 'quota' ? 'Hết tài nguyên token — đã tạm dừng' : 'Đã tạm dừng'),
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
    return {
      task,
      dept,
      project,
      cwd: task.workspace ?? this.workspaceFor(task, project),
      roster,
      attachments,
      filesAccessible: access !== 'none',
      ccDir,
      branch: task.branch,
      scratch: !project?.workspace,
      serialWriters: this.exclusiveWrites(task, project),
      repoMap: this.repoMaps.get(task.id),
    };
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
      // lượt gọi lỗi → dừng (tiếp tục được) thay vì làm theo kế hoạch dự phòng đoán mò
      if (planRes.error && !planRes.text) throw new Error(`Trưởng phòng không lập được kế hoạch: ${planRes.error}`);
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
      // kế hoạch quá lớn so với ngân sách → cảnh báo (chế độ "pause": dừng để quyết định tách/tăng ngân sách)
      this.checkEstimate(task, run, project);
    }

    // 3) Thực thi — CCoding tự chạy lệnh kiểm tra của dự án trước khi sửa (baseline) và sau khi làm xong
    if (!reached(run, 'executed')) {
      this.setPhase(task, run, 'execute');
      const checkable = this.projectCheckable(task, project);
      if (checkable && !task.projectChecks?.baseline && !run.subtasks.some((s) => s.attempts > 0 || s.status === 'done')) await this.runProjectChecks(task, project, dept.id, 'baseline');
      await this.executeAll(task, run, pctx, base, prior);
      run.stage = 'executed';
      if (checkable && run.subtasks.some((s) => s.status === 'done')) await this.runProjectChecks(task, project, dept.id, 'execute');
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
          let reviewTools: ToolName[] = [];
          const res = await this.call(
            reviewer,
            'review',
            (tools) => {
              reviewTools = tools;
              return P.reviewPrompt(pctx, items, tools, changes);
            },
            { ...base, hints: { brief: task.brief, subtasks: items.map((i) => stHint(i.st)), attempt } },
          );
          // review lỗi KHÔNG được coi là "duyệt"
          if (res.error && !res.text) throw new Error(`Không review được: ${res.error}`);
          const review = parseReview(res.text, items.map((i) => i.st.id));
          // lệnh kiểm tra của dự án đạt trước khi sửa mà hỏng sau khi sửa → không duyệt, dù reviewer nói gì
          const regressed = this.checkRegressions(task);
          if (regressed.length) {
            if (review.approved) review.summary = `${review.summary} (CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt)`;
            review.approved = false;
            if (!review.issues.some((i) => i.severity !== 'minor')) {
              const target = [...done()].reverse().find((s) => this.isWriter(registry.agent(s.assignee), task, project)) ?? done().at(-1);
              if (target) review.issues.push({ subtask: target.id, severity: 'blocker', comment: `Lệnh ${regressed.map((c) => `\`${c}\``).join(', ')} đạt trước khi sửa nhưng lỗi sau khi sửa — sửa cho đạt lại (đầu ra ở mục "Lệnh kiểm tra của dự án").` });
            }
          }
          // bằng chứng: lệnh reviewer thực sự chạy qua công cụ (không chỉ lời khai trong JSON)
          const ran = (res.toolCalls ?? []).filter((tc) => tc.name === 'run_command');
          const sys = task.projectChecks?.latest ?? [];
          const checks = [
            ...sys.map((r) => ({ command: r.command, exitCode: r.code ?? undefined, ok: r.ok, note: `CCoding tự chạy${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}` })),
            ...ran.map((tc) => ({ command: tc.args.replace(/^command=/, '').slice(0, 300), ok: tc.ok, note: tc.ok ? 'chạy qua công cụ' : `lỗi: ${(tc.error ?? '').slice(0, 160)}` })),
            ...review.checks.filter((c) => !ran.some((tc) => tc.args.includes(c.command.slice(0, 40)))),
          ];
          // chỉ lệnh kiểm chứng thật (test/typecheck/lint/build/migration) mới là bằng chứng — git status, rg… là khảo sát
          // bằng chứng có sẵn khi CCoding đã tự chạy lệnh kiểm tra của dự án (không phụ thuộc reviewer/model)
          const verified = sys.length ? true : reviewTools.includes('run_command') ? ran.some((tc) => isCheckCommand(tc.args)) : undefined;
          run.review = { approved: review.approved, summary: review.summary, issues: review.issues, checks, verified };
          const evidence =
            verified === false
              ? `\n⚠️ Reviewer có quyền chạy lệnh nhưng KHÔNG chạy lệnh kiểm tra nào (test/typecheck/lint/build)${ran.length ? ` — chỉ chạy lệnh khảo sát: ${ran.map((tc) => `\`${tc.args.slice(0, 60)}\``).join(', ')}` : ''} — kết luận chưa có bằng chứng chạy thật.`
              : `${sys.length ? `\n🧪 Lệnh kiểm tra (CCoding tự chạy): ${sys.map((r) => `\`${r.command.slice(0, 80)}\` ${r.ok ? '✓' : '✗'}`).join(', ')}${regressed.length ? ' — có lệnh hỏng sau khi sửa' : ''}` : ''}${
                  ran.length ? `\nReviewer đã chạy: ${ran.map((tc) => `\`${tc.args.replace(/^command=/, '').slice(0, 80)}\` ${tc.ok ? '✓' : '✗'}`).join(', ')}` : ''
                }`;
          if (verified === false) this.d.logs.write({ level: 'warn', kind: 'review.unverified', msg: `${dept.short}: reviewer không chạy lệnh kiểm tra nào`, taskId: task.id, agentId: reviewer.id, department: dept.id });
          this.message(
            task,
            dept.id,
            reviewer.id,
            'review',
            `${review.approved ? '✅ Duyệt' : '⚠️ Cần sửa'} — ${review.summary}${review.issues.length ? `\n${review.issues.map((i) => `- [${i.severity}] ${i.subtask}: ${i.comment}`).join('\n')}` : ''}${evidence}`,
          );
          const targets = run.subtasks.filter((s) => s.status === 'done' && review.issues.some((i) => i.subtask === s.id && i.severity !== 'minor'));
          if (review.approved || !targets.length || attempt === task.options.maxRevisions) break;
          this.setPhase(task, run, 'revise');
          const reviseOne = async (st: Subtask) => {
              const agent = registry.agent(st.assignee);
              this.noteAttempt(task, run, st);
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
          };
          // workspace dự án dùng chung: hạng mục chạy lệnh làm lần lượt, hạng mục chỉ viết tài liệu vẫn song song
          const serial = pctx.serialWriters ? targets.filter((st) => this.isWriter(registry.agent(st.assignee), task, project)) : [];
          const parallel = targets.filter((st) => !serial.includes(st));
          const results = await Promise.allSettled([
            ...parallel.map(reviseOne),
            (async () => {
              for (const st of serial) await reviseOne(st);
            })(),
          ]);
          const stop = results.find((x): x is PromiseRejectedResult => x.status === 'rejected');
          if (stop) throw stop.reason;
          if (this.projectCheckable(task, project)) await this.runProjectChecks(task, project, dept.id, 'revise');
        }
      }
      run.stage = 'reviewed';
      // review cuối chưa duyệt / lệnh kiểm tra còn hỏng → nhiệm vụ vẫn chạy xong nhưng gắn cờ "cần xem"
      if (run.review && !run.review.approved) task.attention = { reason: 'review', detail: `${dept.short}: ${run.review.summary.slice(0, 280)}`, at: nowIso() };
      else if (task.projectChecks?.latest?.some((r) => !r.ok)) task.attention = { reason: 'checks', detail: `Lệnh kiểm tra còn lỗi: ${task.projectChecks.latest.filter((r) => !r.ok).map((r) => r.command).join(', ')}`, at: nowIso() };
      this.save(task);
    }

    // 5) Báo cáo tổng hợp
    this.checkAbort(task);
    this.setPhase(task, run, 'synthesize');
    const items = done().map((st) => this.depInput(task, st));
    const reviewText = run.review
      ? `${run.review.approved ? 'Đã duyệt' : 'Chưa duyệt hoàn toàn'}: ${run.review.summary}${run.review.verified === false ? '\n(Reviewer KHÔNG chạy lệnh kiểm tra nào — kết luận chưa có bằng chứng chạy thật; nêu rõ trong báo cáo.)' : run.review.checks?.length ? `\nLệnh kiểm tra reviewer đã chạy: ${run.review.checks.map((c) => `${c.command}${c.ok === false ? ' (lỗi)' : c.ok ? ' (đạt)' : ''}`).join('; ')}` : ''}`
      : '';
    const changes = this.workspaceChanges(task);
    const fin = await this.call(lead, 'synthesize', (tools) => P.synthesizePrompt(pctx, run.planSummary ?? '', run.decisions ?? '', items, reviewText, prior, changes, tools), {
      ...base,
      hints: { brief: task.brief, subtasks: run.subtasks.map(stHint), departmentName: dept.name },
    });
    if (!fin.text) throw new Error(`Trưởng phòng không viết được báo cáo tổng hợp${fin.error ? `: ${fin.error}` : ''}`);
    const finalText = fin.text;
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
    /** Hạng mục đang chạy có quyền chạy lệnh trong workspace dùng chung (tối đa 1). */
    const writing = new Set<string>();
    const writer = (st: Subtask) => !!pctx.serialWriters && this.isWriter(this.d.registry.agent(st.assignee), task, pctx.project);
    let toldSerial = false;
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
        const ready: Subtask[] = [];
        for (const st of slots > 0 ? readySubtasks(run.subtasks, busy) : []) {
          if (ready.length >= slots) break;
          if (writer(st) && (writing.size || ready.some(writer))) {
            if (!toldSerial) {
              toldSerial = true;
              this.message(task, run.department, 'system', 'system', `🔒 Các hạng mục chạy lệnh trong repo dự án (cài đặt, test, migration, git) làm lần lượt vì dùng chung một worktree; hạng mục chỉ viết tài liệu vẫn chạy song song.`);
            }
            continue;
          }
          ready.push(st);
        }
        for (const st of ready) {
          st.status = 'running';
          busy.add(st.assignee);
          if (writer(st)) writing.add(st.id);
          const p = this.runSubtask(task, run, st, pctx, base, prior)
            .catch((e) => {
              stop ??= e;
              if (st.status === 'running') st.status = 'pending';
            })
            .finally(() => {
              busy.delete(st.assignee);
              inflight.delete(st.id);
              writing.delete(st.id);
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
    if (pctx.project?.workspace && pctx.filesAccessible) this.writeRepoMap(task);
    const deps = st.dependsOn
      .map((id) => run.subtasks.find((s) => s.id === id))
      .filter((s): s is Subtask => !!s && !!s.output)
      .map((s) => this.depInput(task, s));
    const draft = st.draft ? { text: (this.d.store.readRunFile(task.id, st.draft) ?? '').replace(/^<!--[\s\S]*?-->\s*/, ''), wsPath: `.ccoding/${safeName(task.id)}/${st.draft}` } : undefined;
    const maxCont = Math.max(0, this.d.config.phases?.maxContinuations ?? 2);
    // lần trước dừng giữa chừng (vd. nhiệm vụ lỗi rồi được tiếp tục): làm tiếp từ bàn giao dở dang + thay đổi đã có trong workspace
    let cont: P.Continuation | undefined =
      (st.incomplete || (st.continuations ?? 0) > 0) && !st.draft && st.output ? { n: 1, max: maxCont + 1, previous: this.readOutput(task, st), changes: this.workspaceChanges(task), resumed: true } : undefined;
    let conts = 0; // tính riêng cho lần chạy này (chạy lại hạng mục khi tiếp tục nhiệm vụ thì đếm lại)
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.noteAttempt(task, run, st);
      const res = await this.call(agent, 'execute', (tools) => P.executePrompt(pctx, agent, st, run.planSummary ?? '', run.decisions ?? '', deps, tools, prior, run.subtasks, draft, cont), {
        ...base,
        subtask: st,
        activity: cont ? `${st.id}: chạy tiếp lần ${cont.n}` : `${st.id}: ${st.title}`,
        hints: { brief: task.brief, subtask: stHint(st) },
      });
      st.attempts++;
      if (res.text && !res.error && res.capped && !cappedDone(res.text)) {
        // chạm trần công cụ khi chưa xong: KHÔNG coi là xong (hạng mục sau sẽ dựa vào nó) — chạy tiếp với ngữ cảnh mới
        const n = ++conts;
        this.writeOutput(task, run, st, agent, res);
        if (n <= maxCont) {
          st.continuations = (st.continuations ?? 0) + 1;
          cont = { n: cont?.resumed ? n + 1 : n, max: cont?.resumed ? maxCont + 1 : maxCont, previous: res.text, changes: this.workspaceChanges(task) };
          const why = res.capped === 'input' ? 'hết trần token công cụ' : 'hết lượt công cụ';
          this.d.logs.write({ level: 'warn', kind: 'subtask.continue', msg: `${st.id} ${why} khi chưa xong — chạy tiếp lần ${n}/${maxCont}`, taskId: task.id, agentId: agent.id, department: run.department, subtaskId: st.id });
          this.message(task, run.department, 'system', 'system', `↻ ${st.id} (@${st.assignee}) ${why} khi chưa xong — chạy tiếp lần ${n}/${maxCont} với ngữ cảnh mới (giữ bàn giao dở dang + thay đổi đã ghi).`, { subtaskId: st.id });
          attempt--;
          continue;
        }
        st.status = 'failed';
        st.incomplete = true;
        st.error = `Chưa xong sau ${maxCont} lần chạy tiếp (vòng công cụ chạm trần) — tách nhỏ hạng mục hoặc tăng phases.toolInputBudget.execute`;
        st.finishedAt = nowIso();
        this.alert({ level: 'warn', kind: 'subtask.incomplete', title: `${st.id} chưa xong`, msg: `${task.title}: ${st.error}`, taskId: task.id });
        this.message(task, run.department, 'system', 'system', `${st.id} (@${st.assignee}) chưa xong: ${st.error}`, { subtaskId: st.id });
        return;
      }
      if (res.text && !res.error) {
        this.writeOutput(task, run, st, agent, res);
        st.status = 'done';
        st.error = undefined;
        st.draft = undefined;
        st.incomplete = undefined;
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

  /** Phần ngân sách của một hạng mục (cộng dồn mọi lần chạy/sửa): cố định theo tùy chọn, hoặc 2 × ngân sách / số hạng mục. */
  subtaskBudget(task: Task, run: DeptRun): number {
    const fixed = task.options.subtaskBudgetTokens ?? this.d.config.defaults.subtaskBudgetTokens ?? 0;
    if (fixed > 0) return fixed;
    return Math.max(100_000, Math.round((2 * task.options.budgetTokens) / Math.max(1, run.subtasks.length)));
  }

  /** Hạng mục vượt phần ngân sách của nó: cảnh báo ở mỗi mốc 100%; chế độ "pause" thì dừng (một lần mỗi mốc). */
  private checkSubtaskBudget(task: Task, run: DeptRun, st: Subtask): void {
    const cap = this.subtaskBudget(task, run);
    const used = totalTokens(st.usage);
    if (used < cap) return;
    const level = Math.floor(used / cap) * 100;
    if (level <= (st.budgetAlerted ?? 0)) return;
    st.budgetAlerted = level;
    const mode = task.options.budgetMode ?? this.d.config.defaults.budgetMode ?? 'complete';
    const msg = `${st.id} (${st.title}) đã dùng ${fmtNum(used)}/${fmtNum(cap)} token — vượt phần ngân sách của hạng mục${level > 100 ? ` (${level}%)` : ''}`;
    this.message(task, run.department, 'system', 'system', `💸 ${msg}. Cân nhắc tách hạng mục thành nhiệm vụ riêng.`, { subtaskId: st.id });
    this.alert({ level: 'warn', kind: 'budget.subtask', title: `Hạng mục ${st.id} vượt phần ngân sách`, msg: `${task.title}: ${msg}${mode === 'complete' ? ' — vẫn chạy tiếp' : ''}`, taskId: task.id });
    if (mode === 'pause') throw new PauseSignal('budget', msg);
  }

  /** Cảnh báo khi một hạng mục sắp chạy lần thứ 3, 5, 7… (thực thi + sửa): vòng sửa có thể không tiến triển. */
  private noteAttempt(task: Task, run: DeptRun, st: Subtask): void {
    const n = st.attempts + 1;
    if (n < 3 || n % 2 === 0 || (st.attemptAlerted ?? 0) >= n) return;
    st.attemptAlerted = n;
    const msg = `${st.id} (${st.title}) chạy lần thứ ${n} — đã dùng ${fmtNum(totalTokens(st.usage))} token`;
    this.d.logs.write({ level: 'warn', kind: 'subtask.attempts', msg, taskId: task.id, department: run.department, subtaskId: st.id });
    this.alert({ level: 'warn', kind: 'subtask.attempts', title: `${st.id} chạy lần thứ ${n}`, msg: `${task.title}: ${msg}. Kiểm tra vòng sửa có tiến triển không, hoặc tách thành nhiệm vụ riêng.`, taskId: task.id });
  }

  /** Ước lượng token cho phần còn lại của kế hoạch (theo quyền công cụ của từng hạng mục). */
  private histCache?: { at: number; map: Map<string, AgentHistory> };
  private readonly repoMaps = new Map<string, { rel: string; large: string[] }>();
  private readonly repoMapLogged = new Set<string>();
  /** Token thực tế mỗi hạng mục theo agent (trung vị các hạng mục gần nhất) — làm mới mỗi 10 phút. */
  private history(): Map<string, AgentHistory> {
    const days = this.d.config.estimate.historyDays ?? 30;
    if (!days) return new Map();
    if (!this.histCache || Date.now() - this.histCache.at > 10 * 60_000) this.histCache = { at: Date.now(), map: subtaskHistory(this.d.store.list(), { days }) };
    return this.histCache.map;
  }

  /** Cơ sở ước tính: agent nào dùng lịch sử thật (trung vị/hạng mục, số mẫu). */
  private estimateBasis(run: DeptRun): string {
    const min = this.d.config.estimate.minSamples ?? 2;
    const hist = this.history();
    const used = [...new Set(run.subtasks.filter((s) => s.status !== 'done').map((s) => s.assignee))]
      .map((a) => [a, hist.get(a)] as const)
      .filter((x): x is readonly [string, AgentHistory] => !!x[1] && x[1].samples >= min);
    return used.length ? `theo lịch sử: ${used.map(([a, h]) => `@${a} ~${fmtNum(h.median)}/hạng mục (${h.samples} mẫu)`).join(', ')}` : 'theo hằng số cấu hình (chưa đủ lịch sử)';
  }

  estimatePlan(task: Task, run: DeptRun, project?: ProjectDef): number {
    const e = this.d.config.estimate;
    const hist = this.history();
    const min = e.minSamples ?? 2;
    const access = this.toolAccess(task, project);
    const cls = task.classification;
    const web = this.d.config.tools.web !== false && (cls === 'public' || cls === 'internal');
    let total = e.base + (task.options.review ? e.perReview * (1 + task.options.maxRevisions) : 0);
    for (const st of run.subtasks) {
      if (st.status === 'done') continue;
      const agent = this.d.registry.agents.get(st.assignee);
      const tools = agent ? toolsFor(agent.tools, access, 'execute', web) : [];
      const lvl: ToolAccess = tools.includes('run_command') ? 'exec' : tools.includes('write_file') || tools.includes('edit_file') ? 'write' : tools.includes('read_file') ? 'read' : 'none';
      // có đủ lịch sử của agent → dùng token thực tế (đã gồm tra cứu web, sửa theo review); chưa có → hằng số theo quyền công cụ
      const h = hist.get(st.assignee);
      if (h && h.samples >= min) {
        total += h.median;
        continue;
      }
      total += e.perSubtask[lvl] ?? e.perSubtask.none;
      if (tools.some((t) => t === 'search_papers' || t === 'web_search' || t === 'fetch_url')) total += e.web;
    }
    return total;
  }

  /** Kế hoạch vừa chốt: ước lượng ≫ phần ngân sách còn lại → nhắn + cảnh báo; chế độ "pause" thì dừng chờ quyết định. */
  private checkEstimate(task: Task, run: DeptRun, project?: ProjectDef): void {
    const est = this.estimatePlan(task, run, project);
    const remaining = Math.max(0, task.options.budgetTokens - totalTokens(task.usage));
    const basis = this.estimateBasis(run);
    run.estimate = { tokens: est, budget: remaining, at: nowIso(), basis };
    this.save(task);
    if (est <= remaining * (this.d.config.estimate.warnRatio || 1)) return;
    const mode = task.options.budgetMode ?? this.d.config.defaults.budgetMode ?? 'complete';
    const msg = `Kế hoạch ${run.subtasks.length} hạng mục ước tính ~${fmtNum(est)} token (${basis}), ${remaining ? `gấp ${(est / remaining).toFixed(1).replace('.', ',')} lần phần ngân sách còn lại (${fmtNum(remaining)})` : 'trong khi ngân sách đã hết'}. Nên tách mỗi gói việc thành một nhiệm vụ riêng (nút "Tách thành nhiệm vụ") hoặc tăng ngân sách.`;
    this.d.logs.write({ level: 'warn', kind: 'budget.estimate', msg, taskId: task.id, department: run.department, data: { estimate: est, remaining } });
    this.message(task, run.department, 'system', 'system', `📏 ${msg}`);
    this.alert({ level: 'warn', kind: 'budget.estimate', title: 'Nhiệm vụ có thể quá lớn so với ngân sách', msg: `${task.title}: ${msg}`, taskId: task.id });
    if (mode === 'pause') throw new PauseSignal('budget', msg);
  }

  // ── Workspace, công cụ, git ─────────────────────────────────────────────

  private toolAccess(task: Task, project?: ProjectDef): ToolAccess {
    const t = this.d.config.tools;
    return project ? (project.toolAccess ?? t.projectAccess) : t.defaultAccess;
  }

  /**
   * Workspace dự án thật (repo của người dùng) dùng chung giữa các hạng mục, có quyền chạy lệnh → hạng mục chạy lệnh
   * (cài dependency, test, migration, git) làm LẦN LƯỢT để không giẫm chân nhau; hạng mục chỉ sửa tài liệu vẫn song song.
   */
  private exclusiveWrites(task: Task, project?: ProjectDef): boolean {
    if (this.d.config.tools.serializeWriters === false || !project?.workspace) return false;
    return this.toolAccess(task, project) === 'exec';
  }

  /** Agent có công cụ chạy lệnh ở pha thực thi với quyền hiện tại của nhiệm vụ. */
  private isWriter(agent: AgentDef, task: Task, project?: ProjectDef): boolean {
    return toolsFor(agent.tools, this.toolAccess(task, project), 'execute', false).includes('run_command');
  }

  /** Chuẩn bị thư mục làm việc: worktree git riêng (nếu dự án là repo) + .ccoding/<task>/inputs cho agent đọc. */
  private prepareWorkspace(task: Task, project?: ProjectDef): void {
    const { config, logs } = this.d;
    ensurePackageBoundary(config.workspacesDir);
    if (!task.workspace || !fs.existsSync(task.workspace)) {
      const base = this.workspaceFor(task, project);
      task.workspace = base;
      if (project?.workspace && (project.isolation ?? 'worktree') === 'worktree' && isGitRepo(base)) {
        const wt = path.join(config.workspacesDir, safeName(project.id), `wt-${safeName(task.id)}`);
        const branch = `ccoding/${task.id.toLowerCase()}`;
        const r = addWorktree(base, wt, branch, project.baseRef || 'HEAD');
        if (r.ok) {
          const copied = copyUntracked(base, wt, project.worktreeCopy ?? config.tools.worktreeCopy);
          task.workspace = wt;
          task.branch = branch;
          task.baseRef = headCommit(wt);
          logs.write({ level: 'info', kind: 'workspace.worktree', msg: `Worktree ${wt} (nhánh ${branch} từ ${project.baseRef || 'HEAD'})${copied.length ? ` · chép ${copied.join(', ')}` : ''}`, taskId: task.id, projectId: project.id });
          this.message(task, 'office', 'system', 'system', `🌿 Làm việc trên git worktree riêng \`${wt}\` (nhánh \`${branch}\`${project.baseRef ? ` tách từ \`${project.baseRef}\`` : ''}) — nhánh chính của repo không bị đụng tới.`);
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
    if (project?.workspace) this.writeRepoMap(task);
  }

  /** Bản đồ repo `.ccoding/<task>/repo-map.md` (tệp, số dòng, route, model, hàm) — tạo lại trước mỗi hạng mục vì số dòng đổi sau khi sửa. */
  private writeRepoMap(task: Task): void {
    if (!task.workspace || this.d.config.tools.repoMap === false) return;
    try {
      const t0 = Date.now();
      const map = buildRepoMap(task.workspace);
      const rel = `.ccoding/${safeName(task.id)}/repo-map.md`;
      writeText(path.join(task.workspace, rel), map.text);
      this.repoMaps.set(task.id, { rel, large: map.large.slice(0, 12).map((f) => `${f.path} (${f.lines.toLocaleString('vi-VN')} dòng)`) });
      if (!this.repoMapLogged.has(task.id)) {
        this.repoMapLogged.add(task.id);
        this.d.logs.write({ level: 'info', kind: 'workspace.repomap', msg: `Bản đồ repo ${rel}: ${map.files} tệp, ${map.large.length} tệp lớn, ${map.text.length} ký tự (${Date.now() - t0} ms)`, taskId: task.id });
      }
    } catch (e) {
      this.d.logs.write({ level: 'warn', kind: 'workspace.repomap', msg: `Không tạo được bản đồ repo: ${(e as Error).message}`, taskId: task.id });
    }
  }

  /** Dự án có lệnh kiểm tra và nhiệm vụ được chạy lệnh trong workspace (quyền exec). */
  private projectCheckable(task: Task, project?: ProjectDef): project is ProjectDef {
    return !!project?.workspace && !!project.checkCommands?.length && this.toolAccess(task, project) === 'exec' && !!task.workspace && fs.existsSync(task.workspace);
  }

  /** CCoding tự chạy lệnh chuẩn bị (một lần mỗi worktree) rồi lệnh kiểm tra của dự án — bằng chứng không phụ thuộc agent/model. */
  private async runProjectChecks(task: Task, project: ProjectDef, dept: string, when: 'baseline' | 'execute' | 'revise'): Promise<CheckResult[]> {
    const { config, logs } = this.d;
    const signal = this.controllers.get(task.id)?.signal;
    const opts = { denyCommands: [...config.tools.denyCommands, ...(project.denyCommands ?? [])], timeoutSec: config.tools.commandTimeoutSec, maxChars: config.tools.maxOutputChars, signal };
    const pc = (task.projectChecks ??= {});
    const cwd = task.workspace!;
    const mark = (r: CheckResult) => (r.ok ? '✓' : r.denied ? '⛔' : '✗');
    if (!pc.setupDone && project.setupCommands?.length) {
      pc.setup = [];
      for (const cmd of project.setupCommands) {
        this.checkAbort(task);
        pc.setup.push(await runCheckCommand(cmd, cwd, opts));
      }
      pc.setupDone = pc.setup.every((r) => r.ok);
      this.message(task, dept, 'system', 'system', `🔧 Lệnh chuẩn bị của dự án:\n${pc.setup.map((r) => `- \`${r.command}\` ${mark(r)} ${r.summary}`).join('\n')}`);
      if (!pc.setupDone) this.alert({ level: 'warn', kind: 'checks.setup', title: 'Lệnh chuẩn bị của dự án lỗi', msg: `${task.title}: ${pc.setup.filter((r) => !r.ok).map((r) => r.command).join(', ')}`, taskId: task.id });
    }
    const results: CheckResult[] = [];
    for (const cmd of project.checkCommands ?? []) {
      this.checkAbort(task);
      results.push(await runCheckCommand(cmd, cwd, opts));
    }
    if (when === 'baseline') {
      pc.baseline = results;
      pc.baselineAt = nowIso();
    } else {
      pc.latest = results;
      pc.latestAt = nowIso();
      pc.latestAfter = when;
    }
    const label = when === 'baseline' ? 'trước khi sửa' : when === 'execute' ? 'sau thực thi' : 'sau vòng sửa';
    this.message(task, dept, 'system', 'system', `🧪 Lệnh kiểm tra của dự án (${label}):\n${results.map((r) => `- \`${r.command}\` ${mark(r)} ${r.summary}`).join('\n')}`);
    logs.write({
      level: results.every((r) => r.ok) ? 'info' : 'warn',
      kind: 'checks.run',
      msg: `${task.id} ${label}: ${results.map((r) => `${r.command} → ${r.denied ? 'bị chặn' : r.timedOut ? 'timeout' : r.code}`).join('; ')}`,
      taskId: task.id,
      projectId: project.id,
      department: dept,
      data: { when, results: results.map((r) => ({ command: r.command, code: r.code, ok: r.ok, ms: r.ms, summary: r.summary, denied: r.denied })) },
    });
    const regressed = when === 'baseline' ? [] : this.checkRegressions(task);
    if (regressed.length) this.alert({ level: 'warn', kind: 'checks.regression', title: 'Lệnh kiểm tra hỏng sau khi sửa', msg: `${task.title}: ${regressed.join(', ')} đạt trước khi sửa nhưng lỗi sau khi sửa`, taskId: task.id });
    this.save(task);
    return results;
  }

  /** Lệnh kiểm tra đạt ở baseline nhưng lỗi ở lần chạy gần nhất (do thay đổi của nhiệm vụ này). */
  private checkRegressions(task: Task): string[] {
    const pc = task.projectChecks;
    if (!pc?.latest) return [];
    return pc.latest.filter((r) => !r.ok && !r.denied && pc.baseline?.find((b) => b.command === r.command)?.ok === true).map((r) => r.command);
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
    /** Lần thử trước đã sửa workspace rồi mới lỗi (vd. 429 ở lượt cuối) → lần thử sau phải làm tiếp, không làm lại từ đầu. */
    let handover = ctx.subtask?.handover ?? '';
    /** Giữ ghi chú bàn giao trên hạng mục khi tạm dừng — lần chạy sau (sau khi tiếp tục) làm tiếp thay vì làm lại. */
    const keepHandover = () => {
      if (ctx.subtask && handover) ctx.subtask.handover = handover.slice(0, 12_000);
    };
    const attempts: Array<{ runtime: string; model: string; kind: ErrorKind; error: string; ms: number }> = [];
    let failedMs = 0;
    try {
      this.checkAbort(task);
      if (this.pauseRequests.has(task.id)) throw new PauseSignal('manual', 'Tạm dừng theo yêu cầu');
      this.checkBudget(task);
      if (ctx.subtask && ctx.run) this.checkSubtaskBudget(task, ctx.run, ctx.subtask);
      const cls = task.classification;
      const want = ctx.project?.models?.[agent.id] ?? config.phases?.models?.[phase] ?? agent.model;
      const prefs = [task.options.runtime, ctx.project?.runtime, agent.runtime, config.runtime.default];
      const { list, notes, skipped, deferred } = await runtimes.candidates(prefs, cls, want);
      if (notes.length) logs.write({ level: 'warn', kind: 'runtime.fallback', msg: `${notes.join('; ')}${list[0] ? ` → dùng ${list[0].label}` : ''}`, taskId: task.id, agentId: agent.id, department: deptId });
      if (deferred?.length) logs.write({ level: 'info', kind: 'runtime.deferred', msg: `Xếp sau (vừa bị giới hạn tốc độ): ${deferred.join(', ')} → dùng ${list[0]?.label ?? '?'}`, taskId: task.id, agentId: agent.id, department: deptId });
      if (!list.length) {
        const at = runtimes.earliestRecovery();
        throw new PauseSignal('quota', `Không còn runtime/model khả dụng${skipped.length ? `: ${skipped.join('; ')}` : ' (chưa cấu hình hoặc không kết nối được)'}`, at ?? Date.now() + 5 * 60_000);
      }
      // pha nặng: model nhanh trước model chậm (kể cả khi model nhanh vừa bị 429 và đang bị xếp sau); nếu model nhanh chỉ tạm nghỉ
      // vì quota/giới hạn tốc độ và sắp mở lại thì tạm dừng chờ thay vì chạy bằng model chậm (P6)
      const waitMs = Math.max(0, config.runtime.waitForFastMs ?? 30 * 60_000);
      const waitFast = waitMs > 0 && !!config.runtime.slowModels?.length && (config.runtime.waitPhases ?? ['execute', 'revise', 'review']).includes(phase);
      if (waitFast) {
        const fast = list.filter((c) => !runtimes.isSlow(c));
        if (fast.length && fast.length < list.length) list.splice(0, list.length, ...fast, ...list.filter((c) => runtimes.isSlow(c)));
      }
      const maxTry = Math.min(list.length, Math.max(1, config.runtime.maxFailover));
      const access = this.toolAccess(task, ctx.project);
      for (let i = 0; i < maxTry; i++) {
        cand = list[i];
        const rt = cand.runtime;
        if (waitFast && runtimes.isSlow(cand)) {
          const fr = await runtimes.fastRecovery(prefs, cls, want);
          if (fr && fr.until - Date.now() <= waitMs) {
            keepHandover();
            const at = new Date(fr.until).toLocaleTimeString('vi-VN');
            logs.write({ level: 'info', kind: 'runtime.wait', msg: `${agent.name}: chờ ${fr.label} (${fr.reason ?? 'tạm nghỉ'}) mở lại lúc ${at} thay vì chạy ${phase} bằng ${cand.label}`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId, until: new Date(fr.until).toISOString(), slow: cand.label, fast: fr.label } });
            throw new PauseSignal('quota', `Chờ model nhanh ${fr.label} (${fr.reason ?? 'tạm nghỉ'}) mở lại lúc ${at} thay vì chạy bước ${WAIT_PHASE_LABEL[phase] ?? ACTIVITY_BY_PHASE[phase].toLowerCase()}${ctx.subtask ? ` ${ctx.subtask.id}` : ''} bằng model chậm ${cand.label}`, fr.until + 15_000, 'Chờ model nhanh — đã tạm dừng');
          }
        }
        // tra cứu web chỉ với dữ liệu Công khai/Nội bộ (truy vấn đi ra máy tìm kiếm bên ngoài)
        const web = config.tools.web !== false && (cls === 'public' || cls === 'internal');
        const allow = rt.supportsTools && rt.id !== 'mock' ? toolsFor(agent.tools, access, phase, web) : [];
        const built = build(allow);
        if (handover && allow.length) built.prompt = `${built.prompt}\n\n${handover}`;
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
                maxReadChars: config.tools.maxReadChars,
                denyCommands: [...config.tools.denyCommands, ...(ctx.project?.denyCommands ?? [])],
                allowGitCommit: !!task.branch,
                expectWrites: (phase === 'execute' || phase === 'revise') && allow.some((t) => t === 'write_file' || t === 'edit_file'),
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
        const t0 = Date.now();
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
          if (r.error && !r.text)
            throw new RuntimeError(
              r.error,
              r.errorKind ?? classifyError(undefined, r.error),
              undefined,
              r.retryAt,
              r.usage.input || r.usage.output ? { input: r.usage.input, output: r.usage.output, cacheRead: r.usage.cacheRead, turns: r.turns ?? 0, toolCalls: r.toolCalls, model: r.model } : undefined,
            );
          if (r.truncated && r.text && CONTINUE_PHASES.has(phase)) r = await this.continueTruncated(rt, req, r, hooks, task, agent);
          result = runtimes.applyPricing(r);
          runtimes.markOk(cand.key);
          if (ctx.subtask?.handover) ctx.subtask.handover = undefined;
          break;
        } catch (e) {
          if (signal?.aborted) throw new CancelledError('Đã hủy');
          const re = toRuntimeError(e);
          const ms = Date.now() - t0;
          failedMs += ms;
          attempts.push({ runtime: rt.id, model: cand.model, kind: re.kind, error: re.message.slice(0, 300), ms });
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
            data: { callId, kind: re.kind, status: re.status, ms, until: h.until ? new Date(h.until).toISOString() : undefined },
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
          // phần token đã tiêu trước khi lỗi vẫn ghi sổ (runtime thật), kèm các thao tác công cụ đã làm
          const pu = re.partial;
          if (pu?.toolCalls?.some((tc) => tc.ok && ['write_file', 'edit_file', 'run_command'].includes(tc.name)))
            handover = `${P.handoverNote(cand.label, re.kind, pu.toolCalls)}${handover ? `\n\n${handover.replace(/^## /, '### Trước đó — ')}` : ''}`.slice(0, 12_000);
          result = {
            text: '',
            usage: { input: pu?.input ?? 0, output: pu?.output ?? 0, cacheRead: pu?.cacheRead ?? 0, cacheWrite: 0, costUsd: 0 },
            estimated: false,
            model: pu?.model ?? cand.model,
            runtime: pu ? rt.id : 'n/a',
            durationMs: failedMs,
            error: re.message,
            errorKind: re.kind,
            turns: pu?.turns,
            toolCalls: pu?.toolCalls,
          };
          if (pu) {
            const partialRec = { ts: nowIso(), callId: `${callId}-p${i}`, taskId: task.id, subtaskId: ctx.subtask?.id, projectId: task.projectId, department: deptId, agentId: agent.id, phase, runtime: rt.id, model: pu.model ?? cand.model, requestedModel: cand.model, input: pu.input, output: pu.output, cacheRead: pu.cacheRead, cacheWrite: 0, costUsd: 0, durationMs: 0, estimated: false, toolCalls: pu.toolCalls?.length, error: re.message };
            usage.record(partialRec);
            addUsage(task.usage, { ...partialRec, calls: 1 });
            if (ctx.run) addUsage(ctx.run.usage, { ...partialRec, calls: 1 });
            if (ctx.subtask) addUsage(ctx.subtask.usage, { ...partialRec, calls: 1 });
            for (const tc of pu.toolCalls ?? []) logs.write({ level: tc.ok ? 'info' : 'warn', kind: 'tool.call', msg: `${agent.name} · ${tc.name} ${tc.args.slice(0, 160)} ${tc.ok ? '✓' : '✗'} (${tc.ms} ms)`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId, ...tc } });
            result = { ...result, runtime: 'n/a' }; // đã ghi sổ ở trên — tránh ghi lần hai bên dưới
          } else if (ms >= 60_000 && !rt.local && req) {
            // lượt gọi chạy lâu rồi mới lỗi (vd. 502 sau nhiều phút) mà nhà cung cấp không báo usage: ghi sổ ƯỚC LƯỢNG phần đầu vào
            // đã gửi đi để chi phí/hạn mức không "biến mất" khỏi thống kê
            const est = estimateTokens(req.system + (req.context ?? '') + req.prompt);
            const lostRec = { ts: nowIso(), callId: `${callId}-lost${i}`, taskId: task.id, subtaskId: ctx.subtask?.id, projectId: task.projectId, department: deptId, agentId: agent.id, phase, runtime: rt.id, model: cand.model, requestedModel: cand.model, input: est, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, durationMs: ms, estimated: true, error: re.message.slice(0, 300) };
            usage.record(lostRec);
            addUsage(task.usage, { ...lostRec, calls: 1 });
            if (ctx.run) addUsage(ctx.run.usage, { ...lostRec, calls: 1 });
            if (ctx.subtask) addUsage(ctx.subtask.usage, { ...lostRec, calls: 1 });
            logs.write({ level: 'warn', kind: 'call.lost', msg: `${agent.name} · ${cand.label}: lỗi sau ${Math.round(ms / 1000)} giây, không có usage — ghi sổ ước lượng ${fmtNum(est)} token đầu vào`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId, ms, estInput: est } });
          }
          if (!shouldFailover(re.kind)) break;
          if (this.pauseRequests.has(task.id)) {
            keepHandover();
            throw new PauseSignal('manual', 'Tạm dừng theo yêu cầu');
          }
          if (i + 1 < maxTry) logs.write({ level: 'warn', kind: 'runtime.failover', msg: `${agent.name}: chuyển ${cand.label} → ${list[i + 1].label}`, taskId: task.id, agentId: agent.id, department: deptId });
        }
      }
      // mọi tài nguyên đều lỗi do hạn mức/kết nối → tạm dừng nhiệm vụ và hẹn tự tiếp tục
      if (result?.error && !result.text && attempts.length && attempts.every((a) => CAPACITY_KINDS.has(a.kind))) {
        const onlyNet = attempts.every((a) => a.kind === 'transient' || a.kind === 'timeout' || a.kind === 'empty');
        const at = onlyNet ? Date.now() + 2 * 60_000 : (runtimes.earliestRecovery() ?? Date.now() + config.runtime.quotaCooldownMs);
        keepHandover();
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
      res = { ...r2, text, usage: { ...usage }, toolCalls: first.toolCalls, turns: (res.turns ?? 1) + (r2.turns ?? 1), capped: first.capped, diag: first.diag };
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
    const project = task.projectId ? store.project(task.projectId) : undefined;
    const files = !task.branch && task.workspace && !project?.workspace ? listWorkspaceFiles(task.workspace, 200) : [];
    const scratch = files.length ? `\n### Tệp trong thư mục làm việc của nhiệm vụ\n\`${task.workspace}\`\n${files.map((f) => `- \`${f.path}\` (${fmtNum(f.size)} byte)`).join('\n')}\n` : '';
    // KPI từng agent trong nhiệm vụ (chấm từ log) — lưu thêm kpi.json để theo dõi theo thời gian
    let kpi = '';
    try {
      const rep = kpiReport({ store, registry, config: this.d.config }, { tasks: [task.id] });
      writeJsonAtomic(path.join(store.runDir(task.id), 'kpi.json'), rep);
      if (rep.agents.some((a) => a.calls)) kpi = `\n### KPI agent trong nhiệm vụ\n${kpiMarkdown(rep, { findings: true })}\n`;
    } catch (e) {
      this.d.logs.write({ level: 'warn', kind: 'kpi.error', msg: `Không tính được KPI: ${(e as Error).message}`, taskId: task.id });
    }
    const pc = task.projectChecks;
    const ckRow = (when: string, r: CheckResult) => `| ${when} | \`${r.command.replace(/\|/g, '\\|')}\` | ${r.denied ? 'bị chặn' : r.timedOut ? 'timeout' : r.code} | ${r.summary.replace(/\|/g, '/').slice(0, 160)} |`;
    const checks =
      pc?.baseline?.length || pc?.latest?.length
        ? `\n### Lệnh kiểm tra của dự án (CCoding tự chạy)\n| Lúc | Lệnh | Exit | Tổng kết |\n|---|---|---|---|\n${[...(pc.baseline ?? []).map((r) => ckRow('trước khi sửa', r)), ...(pc.latest ?? []).map((r) => ckRow(pc.latestAfter === 'revise' ? 'sau vòng sửa' : 'sau thực thi', r))].join('\n')}\n`
        : '';
    const attention = task.attention ? `\n> ⚠ **Cần xem lại:** ${task.attention.detail}\n` : '';
    const appendix = `\n\n---\n${attention}\n## Phụ lục: token & sản phẩm (CCoding)\n\n- Nhiệm vụ: \`${task.id}\` · chế độ: ${task.mode} · phòng: ${task.departments.join(' → ')} · phân loại dữ liệu: ${task.classification}${paused ? ' · **đang tạm dừng**' : ''}\n- Tổng: **${fmtNum(task.usage.input)} in / ${fmtNum(task.usage.output)} out**, cache đọc ${fmtNum(task.usage.cacheRead)}, ${task.usage.calls} lượt gọi${task.usage.estimatedCalls ? ` (${task.usage.estimatedCalls} lượt ước lượng)` : ''} · ngân sách ${fmtNum(task.options.budgetTokens)} (${task.options.budgetMode === 'pause' ? 'dừng khi chạm trần' : 'chạy tới khi hoàn thành'})\n\n| Agent | Phòng | Input | Output | Cache đọc | Lượt |\n|---|---|---:|---:|---:|---:|\n${rows}\n\n### File đầu ra\n${outputs.join('\n') || '(không có)'}\n${scratch}${git}${checks}${kpi}`;
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

/** Tệp agent đã tạo trong thư mục làm việc riêng của nhiệm vụ (bỏ .ccoding, node_modules, .git). */
export function listWorkspaceFiles(root: string, max: number): Array<{ path: string; size: number }> {
  const out: Array<{ path: string; size: number }> = [];
  const skip = new Set(['.ccoding', 'node_modules', '.git', '.venv', '__pycache__']);
  const walk = (dir: string, rel: string, depth: number) => {
    if (out.length >= max || depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max) return;
      if (skip.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r, depth + 1);
      else if (e.isFile()) out.push({ path: r, size: fs.statSync(path.join(dir, e.name)).size });
    }
  };
  walk(root, '', 0);
  return out;
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

/**
 * CCoding là gói ESM (`"type": "module"`). Node quyết định CJS/ESM của tệp .js theo package.json GẦN NHẤT đi ngược lên thư mục cha,
 * nên repo/worktree đặt dưới `workspaces/` mà có thư mục không có package.json riêng (vd. `app/web/*.js` dạng UMD) sẽ bị nạp thành ESM
 * và mất `module.exports` — test của dự án đỏ dù trên máy dự án vẫn xanh. Đặt một package.json trung tính làm ranh giới.
 */
export function ensurePackageBoundary(dir: string): void {
  const f = path.join(dir, 'package.json');
  if (fs.existsSync(f)) return;
  ensureDir(dir);
  fs.writeFileSync(f, `${JSON.stringify({ private: true, description: 'Ranh giới package của CCoding: dự án trong workspaces/ không kế thừa "type": "module" của CCoding' }, null, 2)}\n`);
}
