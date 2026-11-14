import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { EventBus } from './events.js';
import {
  addWorktree,
  changeSummary,
  commitAll,
  commitsAhead,
  copyUntracked,
  currentBranch,
  git,
  headCommit,
  isGitRepo,
  isMerged,
  isSafeRef,
  isWorktreeOf,
  resolveBase,
  BaseDivergedError,
  mergeBranch,
  mergeInProgress,
  manifestDiff,
  manifestFingerprint,
  completeMerge,
  isAncestor,
  mergeStart,
  removeWorktree,
  unmergedFiles,
} from './git.js';
import type { Herdr } from './herdr.js';
import { shipPush, shipStatus, ShipError, type ShipContext, type ShipStatus } from './ship.js';
import type { LogStore } from './logger.js';
import { assignStrayIssues, blockedSubtasks, keywordRoute, newSubtask, orderJoint, parseAcceptance, parsePlan, parseReview, parseRoute, readySubtasks, skillScore } from './planner.js';
import { historyText, selectHistory } from './history.js';
import * as P from './prompts.js';
import { planGate } from './plan-gate.js';
import type { Registry } from './registry.js';
import { classifyError, parseRetryAt, RuntimeError, shouldFailover, toRuntimeError } from './runtimes/errors.js';
import type { Candidate, RuntimeManager } from './runtimes/index.js';
import type { Store } from './store.js';
import { clearFixedFeedback, kpiMarkdown, kpiReport, templateHeadings } from './kpi.js';
import { changedFiles, classifyChecks, reviewerReasons, sensitivePaths, templateGate, type ClassifiedCheck, type QualityGateOptions, type QualityGateResult } from './quality-gate.js';
import { subtaskHistory, type AgentHistory } from './estimate.js';
import { buildRepoMap } from './repomap.js';
import { chooseLane, forcedLane, laneSignals, type LaneSignals } from './lane.js';
import { parseIncidentLog } from './incident.js';
import { collectGuardBlocks as selfImproveGuardBlocks, onLog as selfImproveOnLog, reviewIssueKey } from './selfimprove.js';
import { modelForDifficulty, scoreDifficulty } from './difficulty.js';
import { cappedDone } from './runtimes/api.js';
import { isCheckCommand, runCheckCommand, toolsFor } from './tools/workspace.js';
import type { Uploads } from './uploads.js';
import type { UsageLedger } from './usage.js';
import { ensureDir, readJsonFile, safeName, writeJsonAtomic, writeText } from './util/fsx.js';
import { newTaskId, nowIso, shortId } from './util/ids.js';
import { redact } from './util/redact.js';
import { estimateTokens } from './util/tokens.js';
import { fmtNum } from './util/format.js';
import { resolveSlim, sanitizeSlim, type AcceptMode } from './slim.js';

/** B-11(c): repo có ≤ ngần này tệp (git ls-files, không tính `.ccoding/`) thì làn đơn dùng danh sách tệp gọn thay bản đồ repo. */
const SMALL_REPO_FILES = 300;
import {
  addUsage,
  TASK_PRIORITIES,
  type TaskPriority,
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
  type TaskOptions,
  type ToolAccess,
  type ToolName,
} from './types.js';
import type { BudgetPolicies } from './budgets.js';

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
  /** UI-7: ngân sách theo dự án / agent (ngưỡng mềm + trần cứng). */
  budgets?: BudgetPolicies;
}

/** Dừng nhiệm vụ nhưng giữ nguyên tiến độ để tiếp tục sau (chạm trần ngân sách, hết tài nguyên, yêu cầu thủ công). */
export class PauseSignal extends Error {
  constructor(public reason: PauseInfo['reason'], message: string, public resumeAt?: number, public title?: string) {
    super(message);
  }
}
class CancelledError extends Error {}

const NO_RUNTIME_PREFIX = 'Không còn runtime/model khả dụng';
/** Số lần tự tiếp tục khi liên tiếp "không còn runtime" (5+10+20+40+60 phút ≈ 2 giờ 15) rồi dừng hẳn chờ người. */
const NO_RUNTIME_MAX_RETRIES = 5;

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
  accept: 'reviewing',
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
  accept: 'Nghiệm thu kết quả',
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
  /** B-02: lượt chỉ viết văn bản (sửa định dạng) — không cấp công cụ dù agent/quyền cho phép. */
  noTools?: boolean;
  /** B-11(a): trần token đầu ra riêng cho lượt này (ưu tiên hơn config.phases.maxTokens). */
  maxTokens?: number;
  /** K2: trần lượt công cụ riêng cho lượt này (ưu tiên hơn config.phases.toolTurns) — dùng khi chạy lại review với trần cao hơn. */
  maxTurns?: number;
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
  /** accept: chỉ chạy lại bước CTO nghiệm thu (báo cáo giữ nguyên). */
  from?: 'review' | 'synthesize' | 'accept';
  /** Tự tiếp tục theo hẹn (không phải người bấm) — giữ bộ đếm "không còn runtime". */
  auto?: boolean;
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
/**
 * B-11(a): trần token đầu ra của lượt `accept` ở chế độ brief. CTO được yêu cầu ≤ 600 token (bảng tiêu chí + khối JSON);
 * dư ~50 % cho khối JSON kết luận và dao động độ dài, để khối JSON mà parseAcceptance đọc không bị cắt cụt.
 */
export const ACCEPT_BRIEF_MAX_TOKENS = 950;

const CLASS_RANK: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
function maxClass(a: Classification, b?: Classification): Classification {
  return b && CLASS_RANK[b] > CLASS_RANK[a] ? b : a;
}

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
  /** Nhiệm vụ đang đẩy nhánh (chặn bấm hai lần). */
  private shipping = new Set<string>();
  /** Số thứ tự lượt gọi — khởi tạo theo thời gian để không trùng giữa các lần khởi động lại server (tên file job/prompt, callId). */
  private seq = Math.max(0, Math.floor(Date.now() / 1000) - 1_790_000_000);

  /** B-17: tín hiệu làn đã tính ở pickLane (trước pha plan) — chỉ đọc lại, không tính thêm. */
  private laneSigs = new Map<string, LaneSignals>();

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
    // giao việc tiếp nối: kế thừa chế độ / dự án / phòng / agent của nhiệm vụ trước (khi không chỉ định khác)
    const prev = input.followUp ? store.get(input.followUp) : undefined;
    if (input.followUp && !prev) throw new Error(`Không có nhiệm vụ "${input.followUp}" để tiếp nối`);
    if (prev) {
      input = { ...input, mode: input.mode ?? prev.mode, projectId: input.projectId ?? prev.projectId, agentId: input.agentId ?? prev.agentId, department: input.department ?? prev.department };
      if (input.mode === 'joint' || input.mode === 'auto') input = { ...input, department: undefined };
    }
    const project = input.projectId ? store.project(input.projectId) : undefined;
    if (input.projectId && !project) throw new Error(`Không có dự án "${input.projectId}"`);
    let mode = input.mode ?? (input.agentId ? 'agent' : project ? 'project' : input.department ? 'department' : 'auto');
    if (mode === 'project' && !project) mode = 'auto';
    if (mode === 'department') {
      if (!input.department || !registry.departments.has(input.department)) throw new Error(`Phòng ban không hợp lệ: ${input.department ?? '(trống)'}`);
    }
    let department = input.department;
    if (mode === 'agent') {
      const a = input.agentId ? registry.agents.get(input.agentId) : undefined;
      if (!a) throw new Error(`Agent không hợp lệ: ${input.agentId ?? '(trống)'}`);
      if (!registry.departments.has(a.department)) throw new Error(`${a.name} không thuộc phòng ban nào nhận việc (điều phối viên chỉ định tuyến)`);
      if (project?.agents?.length && !project.agents.includes(a.id)) throw new Error(`${a.name} không nằm trong nhân sự của dự án ${project.name}`);
      department = a.department;
    }
    const o = input.options ?? {};
    const now = nowIso();
    const budgetMode: BudgetMode = o.budgetMode === 'pause' || o.budgetMode === 'complete' ? o.budgetMode : (project?.budgetMode ?? config.defaults.budgetMode ?? 'complete');
    const task: Task = {
      id: newTaskId(),
      title: (input.title ?? '').trim() || firstSentence(brief, 90),
      brief,
      mode,
      department,
      projectId: project?.id,
      agentId: mode === 'agent' ? input.agentId : undefined,
      followUpOf: prev?.id,
      routineId: input.routineId,
      // tiếp nối: không hạ nhãn dữ liệu so với nhiệm vụ trước
      classification: maxClass((project?.classification ?? config.dataProtection.defaultClassification) as Classification, prev?.classification),
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
        ...variantOptions(o),
        planApproval: (o.planApproval ?? project?.planApproval ?? config.defaults.planApproval) ? true : undefined,
        // "false" dạng chuỗi (form/CLI) cũng là tắt
        acceptance: ![o.acceptance ?? config.defaults.acceptance ?? true].some((v) => v === false || String(v) === 'false'),
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
    // việc nối trong cùng dự án repo: mặc định làm tiếp trên NHÁNH của nhiệm vụ trước (chưa gộp vào nhánh xuất phát)
    if (prev?.branch && project && prev.projectId === project.id && input.continueBranch !== false && this.branchExists(project, prev.branch)) task.startFrom = prev.branch;
    if (prev) {
      const final = prev.finalPath ? store.readRunFile(prev.id, prev.finalPath) : undefined;
      writeText(
        path.join(inputsDir, 'NHIEM-VU-TRUOC.md'),
        `# Nhiệm vụ trước: ${prev.id} — ${prev.title}\n\nTrạng thái: ${prev.status}${prev.branch ? ` · nhánh \`${prev.branch}\`` : ''}\n\n## Yêu cầu trước\n${prev.brief}\n\n## Báo cáo của nhiệm vụ trước\n${final ?? '(chưa có báo cáo)'}\n`,
      );
      task.brief = `${brief}\n\n---\nTiếp nối nhiệm vụ ${prev.id} ("${prev.title}", ${prev.status}) — yêu cầu và báo cáo trước: \`inputs/NHIEM-VU-TRUOC.md\`. Làm tiếp trên kết quả đã có, không làm lại phần đã xong.${task.startFrom ? ` Worktree của nhiệm vụ này tách từ nhánh \`${task.startFrom}\` của nhiệm vụ trước — thay đổi của nhiệm vụ đó đã có sẵn trong thư mục làm việc.` : ''}`;
      writeText(path.join(inputsDir, 'BRIEF.md'), task.brief);
    }
    extra.prepareInputs?.(inputsDir, task);
    // cấp số thứ tự sau mọi bước có thể báo lỗi (tệp đính kèm…) để giao việc lỗi không làm nhảy số
    task.seq = store.nextSeq();
    store.put(task, true);
    this.d.logs.write({
      level: 'info',
      kind: 'task.created',
      msg: `Nhận nhiệm vụ: ${task.title}`,
      taskId: task.id,
      projectId: task.projectId,
      data: { mode, department: input.department, budgetTokens: task.options.budgetTokens, budgetMode, attachments: task.attachments?.map((a) => ({ name: a.name, kind: a.kind, chars: a.chars })), routineId: input.routineId, routineManual: input.routineId ? !!input.routineManual : undefined },
    });
    if (input.backlog) {
      task.status = 'paused';
      task.pause = { reason: 'backlog', detail: 'Trong backlog — chuyển sang "Chờ chạy" để bắt đầu', at: now };
      this.save(task, true);
      return task;
    }
    this.emitTask(task);
    this.queue.push(task.id);
    this.pump();
    return task;
  }

  /**
   * UI-8: đổi giai đoạn bằng tay — chỉ giữa "backlog" và "Chờ chạy" (nhiệm vụ chưa làm gì).
   * Các giai đoạn khác (đang làm, review, xong, bị chặn) do trạng thái thật quyết định.
   */
  setStage(id: string, stage: 'backlog' | 'todo'): Task {
    const t = this.d.store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    const untouched = t.runs.length === 0;
    if (stage === 'backlog') {
      if (t.status === 'paused' && t.pause?.reason === 'backlog') return t;
      if (t.status !== 'queued' || !untouched) throw new Error('Chỉ đưa vào backlog được nhiệm vụ đang chờ chạy và chưa bắt đầu');
      this.queue = this.queue.filter((q) => q !== id);
      t.status = 'paused';
      t.pause = { reason: 'backlog', detail: 'Trong backlog — chuyển sang "Chờ chạy" để bắt đầu', at: nowIso() };
      this.d.logs.write({ level: 'info', kind: 'task.backlog', msg: `${t.id}: chuyển vào backlog`, taskId: t.id, projectId: t.projectId });
      this.save(t, true);
      return t;
    }
    if (t.status === 'queued') return t;
    if (t.status !== 'paused' || t.pause?.reason !== 'backlog') throw new Error('Chỉ chuyển sang "Chờ chạy" được nhiệm vụ đang nằm trong backlog');
    this.d.logs.write({ level: 'info', kind: 'task.unbacklog', msg: `${t.id}: rời backlog → chờ chạy`, taskId: t.id, projectId: t.projectId });
    return this.resume(id, {});
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
  /** UI-7: sửa thuộc tính hiển thị từ bảng Thuộc tính — tiêu đề, ưu tiên. Không đụng phần đang chạy. */
  updateProps(id: string, o: { title?: string; priority?: TaskPriority | null; agentId?: string | null; projectId?: string | null }): Task {
    const t = this.d.store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    const changed: string[] = [];
    const { registry, store } = this.d;
    // người phụ trách / dự án chỉ đổi được khi nhiệm vụ chưa bắt đầu (chưa lập kế hoạch, chưa có workspace)
    const editable = (t.status === 'queued' || t.status === 'paused') && t.runs.length === 0;
    const lockMsg = (what: string) =>
      `Chỉ đổi ${what} khi nhiệm vụ chưa bắt đầu (đang chờ chạy hoặc trong backlog)${what === 'dự án' ? ' — nhiệm vụ đã chạy: tạm dừng rồi dùng "Đóng gói vào dự án"' : ' — nhiệm vụ đã chạy: dùng "Giao lại tương tự"'}`;
    // tính trước, kiểm tra hết rồi mới ghi (lỗi không để lại thay đổi dở)
    let nextProject = t.projectId ? store.project(t.projectId) : undefined;
    if (o.projectId !== undefined && (o.projectId || undefined) !== t.projectId) {
      if (!editable) throw new Error(lockMsg('dự án'));
      nextProject = o.projectId ? store.project(o.projectId) : undefined;
      if (o.projectId && !nextProject) throw new Error(`Không có dự án "${o.projectId}"`);
    }
    let nextAgent = t.mode === 'agent' ? t.agentId : undefined;
    if (o.agentId !== undefined && (o.agentId || undefined) !== nextAgent) {
      if (!editable) throw new Error(lockMsg('người phụ trách'));
      nextAgent = o.agentId || undefined;
      if (nextAgent) {
        const a = registry.agents.get(nextAgent);
        if (!a) throw new Error(`Agent không hợp lệ: ${nextAgent}`);
        if (!registry.departments.has(a.department)) throw new Error(`${a.name} không thuộc phòng ban nào nhận việc (điều phối viên chỉ định tuyến)`);
      }
    }
    if (nextAgent && nextProject?.agents?.length && !nextProject.agents.includes(nextAgent))
      throw new Error(`${registry.agents.get(nextAgent)?.name ?? nextAgent} không nằm trong nhân sự của dự án ${nextProject.name}`);
    if ((nextProject?.id ?? undefined) !== t.projectId) {
      changed.push(`dự án ${t.projectId ?? '—'} → ${nextProject?.id ?? '—'}`);
      t.projectId = nextProject?.id;
      // không bao giờ hạ nhãn dữ liệu: rời dự án Bảo mật thì giữ nhãn cũ
      const before = t.classification;
      t.classification = maxClass((nextProject?.classification ?? this.d.config.dataProtection.defaultClassification) as Classification, before);
      if (t.classification !== before) changed.push(`nhãn dữ liệu ${before} → ${t.classification}`);
      if (t.mode === 'project' && !nextProject) t.mode = 'auto';
    }
    if (nextAgent !== (t.mode === 'agent' ? t.agentId : undefined)) {
      changed.push(`người phụ trách ${t.mode === 'agent' ? `@${t.agentId}` : '— (điều phối)'} → ${nextAgent ? `@${nextAgent}` : '— (điều phối)'}`);
      if (nextAgent) {
        t.mode = 'agent';
        t.agentId = nextAgent;
        t.department = registry.agents.get(nextAgent)!.department;
      } else {
        t.mode = nextProject ? 'project' : 'auto';
        t.agentId = undefined;
        t.department = undefined;
      }
    }
    if (o.title !== undefined) {
      const title = o.title.replace(/\s+/g, ' ').trim();
      if (!title || title.length > 200) throw new Error('Tiêu đề phải có 1–200 ký tự');
      if (title !== t.title) {
        changed.push(`tiêu đề "${t.title}" → "${title}"`);
        t.title = title;
      }
    }
    if (o.priority !== undefined) {
      const p = o.priority ?? undefined;
      if (p !== undefined && !TASK_PRIORITIES.includes(p)) throw new Error('Ưu tiên không hợp lệ (urgent | high | medium | low)');
      if (p !== t.priority) {
        changed.push(`ưu tiên ${t.priority ?? '—'} → ${p ?? '—'}`);
        if (p) t.priority = p;
        else delete t.priority;
      }
    }
    if (changed.length) {
      this.d.logs.write({ level: 'info', kind: 'task.updated', msg: `Sửa ${t.id}: ${changed.join('; ')}`, taskId: t.id, projectId: t.projectId });
      this.save(t, true);
    }
    return t;
  }

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
        r.reviewRound = undefined;
        r.revising = undefined;
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
          r.reviewRound = undefined;
          r.revising = undefined;
          r.finalPath = undefined;
        }
      }
      if (o.from && o.from !== 'accept' && r.subtasks.length) {
        const back: RunStage = o.from === 'review' ? 'executed' : 'reviewed';
        r.stage ??= inferStage(r);
        if (!r.stage || STAGES.indexOf(r.stage) > STAGES.indexOf(back)) r.stage = back;
        if (o.from === 'review') {
          r.review = undefined;
          r.reviewRound = undefined;
          r.revising = undefined;
        }
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
    if (o.from === 'accept') {
      // nghiệm thu lại (lần trước lỗi, hết ngân sách, không đọc được kết luận…) — báo cáo không viết lại
      t.acceptance = undefined;
      if (t.attention?.reason === 'acceptance') t.attention = undefined;
      logs.write({ level: 'info', kind: 'task.rerun', msg: `${t.id}: làm lại bước CTO nghiệm thu`, taskId: t.id });
    }
    const prev = t.pause?.reason ?? t.status;
    // tiếp tục khi đang chờ duyệt kế hoạch = duyệt (bấm Tiếp tục) hoặc tự duyệt khi hết thời gian chờ
    if (t.pause?.reason === 'plan')
      for (const r of t.runs)
        if (r.planReview && !r.planReview.approvedAt) {
          r.planReview.approvedAt = nowIso();
          r.planReview.by = o.auto ? 'timeout' : 'director';
          if (o.auto) this.message(t, r.department, 'system', 'system', `⏱ Hết thời gian chờ duyệt — tự duyệt kế hoạch (${r.subtasks.length} hạng mục).`);
        }
    // người dùng chủ động tiếp tục: bỏ điều kiện chờ các nhiệm vụ trước đã lỗi/hủy/không còn
    if (t.after?.some((a) => ['failed', 'cancelled', undefined].includes(store.get(a)?.status))) t.after = undefined;
    t.status = 'queued';
    t.pause = undefined;
    // người bấm Tiếp tục → đếm lại; tự tiếp tục sau "không còn runtime" thì giữ để giãn/dừng hẳn
    if (!o.auto) t.noRuntimeStreak = undefined;
    t.error = undefined;
    t.attention = undefined;
    t.finishedAt = undefined;
    t.resumes = (t.resumes ?? 0) + 1;
    logs.write({ level: 'info', kind: 'task.resumed', msg: `Tiếp tục ${t.id} từ checkpoint (trước đó: ${prev}) — ngân sách ${fmtNum(t.options.budgetTokens)} · ${t.options.budgetMode === 'complete' ? 'chạy tới khi hoàn thành' : 'dừng khi chạm trần'}`, taskId: t.id, projectId: t.projectId, data: { auto: !!o.auto } });
    this.message(t, 'office', 'system', 'system', `▶ Tiếp tục nhiệm vụ từ checkpoint (lần ${t.resumes}) — các phần đã xong được giữ nguyên.`);
    this.save(t, true);
    this.queue.push(t.id);
    this.pump();
    return t;
  }

  /**
   * Giám đốc (người dùng) quyết review bằng tay khi nhiệm vụ không chạy:
   * - approve: coi kết quả là đạt (bỏ cờ "cần xem"), không gọi model;
   * - reject: ghi yêu cầu sửa thành lỗi [major] cho các hạng mục chọn (mặc định: hạng mục reviewer còn nêu lỗi, hoặc mọi hạng mục
   *   đã xong) → một vòng sửa theo yêu cầu → reviewer duyệt lại (nếu phòng có reviewer) → viết lại báo cáo tổng hợp.
   */
  reviewDecision(
    id: string,
    o: { decision: 'approve' | 'reject'; note?: string; subtasks?: string[]; department?: string; issues?: Array<{ subtask: string; comment: string; department?: string }> },
  ): Task {
    const { store, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    if (t.status === 'running' || t.status === 'queued') throw new Error('Nhiệm vụ đang chạy — chờ xong (hoặc tạm dừng) rồi duyệt / yêu cầu sửa');
    if (t.runs.some((r) => r.planReview && !r.planReview.approvedAt)) throw new Error('Còn kế hoạch chờ duyệt — duyệt (hoặc hủy) kế hoạch trước khi duyệt / yêu cầu sửa kết quả');
    if (o.decision !== 'approve' && o.decision !== 'reject') throw new Error('Quyết định phải là "approve" hoặc "reject"');
    const note = redact((o.note ?? '').trim().slice(0, 4000), { secrets: true, pii: false });
    const runs = t.runs.filter((r) => r.subtasks.some((s) => s.status === 'done') && (!o.department || r.department === o.department));
    if (!runs.length) throw new Error('Chưa có hạng mục nào xong để duyệt');
    const dept = runs[0].department;
    if (o.decision === 'approve') {
      for (const r of runs) {
        if (!r.review) r.review = { approved: true, summary: `Giám đốc duyệt${note ? `: ${note.slice(0, 300)}` : ''}`, issues: [], by: 'director' };
        else if (!r.review.approved) {
          r.review.approved = true;
          r.review.by = 'director';
          r.review.summary = `Giám đốc duyệt${note ? `: ${note.slice(0, 300)}` : ''} (reviewer: ${r.review.summary.slice(0, 200)})`;
        }
      }
      t.attention = undefined;
      this.message(t, dept, 'director', 'decision', `✅ Giám đốc duyệt kết quả${note ? `: ${note}` : ''}`);
      logs.write({ level: 'info', kind: 'review.director', msg: `${t.id}: giám đốc duyệt kết quả`, taskId: t.id, department: dept, data: { decision: 'approve', noteChars: note.length } });
      this.save(t, true);
      return t;
    }
    // bình luận theo dòng trên diff → lỗi riêng cho từng hạng mục (tệp:dòng + nội dung), che bí mật
    const lineIssues = (o.issues ?? [])
      .slice(0, 100)
      .map((i) => ({ subtask: String(i.subtask ?? ''), department: i.department ? String(i.department) : undefined, comment: redact(String(i.comment ?? '').trim().slice(0, 2000), { secrets: true, pii: false }) }))
      .filter((i) => i.subtask && i.comment);
    if (!note && !lineIssues.length) throw new Error('Ghi rõ cần sửa gì');
    // hạng mục chọn theo TỪNG phòng: bình luận gắn phòng chỉ nhắm hạng mục của phòng đó (nhiệm vụ liên phòng có S1 ở cả hai phòng)
    const wantFor = (dept: string) =>
      o.subtasks?.length || lineIssues.length ? new Set([...(o.subtasks ?? []).map(String), ...lineIssues.filter((i) => !i.department || i.department === dept).map((i) => i.subtask)]) : undefined;
    const want = o.subtasks?.length || lineIssues.length ? true : undefined;
    const picked: string[] = [];
    for (const r of runs) {
      const want = wantFor(r.department);
      const flagged = r.review && !r.review.approved ? r.review.issues.filter((i) => i.severity !== 'minor').map((i) => i.subtask) : [];
      const done = r.subtasks.filter((s) => s.status === 'done' && s.output && !s.splitTo);
      const mine = (s: Subtask) => lineIssues.filter((i) => i.subtask === s.id && (!i.department || i.department === r.department));
      const targets = done.filter((s) => (want ? want.has(s.id) : flagged.length ? flagged.includes(s.id) : true));
      if (!targets.length) continue;
      const keep = r.review && !r.review.approved ? r.review.issues.filter((i) => targets.some((s) => s.id === i.subtask)) : [];
      r.review = {
        approved: false,
        summary: `Giám đốc yêu cầu sửa: ${(note || `${lineIssues.length} bình luận trên diff`).slice(0, 300)}`,
        // Ghi chú ngắn/chung chung (vd. "sửa các bước đã tick" — 28/10 agent không biết "bước" nào nên không sửa gì):
        // nói rõ hạng mục được CHỌN trên giao diện và việc phải làm mặc định. Bình luận theo dòng: mỗi bình luận một lỗi.
        issues: [
          ...targets.flatMap((s) => {
            const lines = mine(s);
            if (lines.length)
              return lines.map((i) => ({
                subtask: s.id,
                severity: 'major' as const,
                comment: `[Giám đốc · bình luận trên diff] ${i.comment}${note ? ` — Ghi chú chung: ${note}` : ''} — sửa đúng chỗ được nêu (tệp:dòng), giữ nguyên phần khác; nếu thấy bình luận sai thì giải thích kèm bằng chứng.`,
              }));
            return [
              {
                subtask: s.id,
                severity: 'major' as const,
                comment:
                  `[Giám đốc] Hạng mục ${s.id} được giám đốc chọn để sửa. Ghi chú: ${note || '(không có)'}` +
                  (note.trim().length < 80
                    ? ` — Ghi chú ngắn nên hiểu là: rà lại ${s.id} theo tiêu chí xong trong kế hoạch, sửa mọi lỗi của lệnh kiểm tra dự án (test/typecheck/lint) và các lỗi review trước liên quan tới ${s.id}, xem thêm chỉ dẫn bổ sung của chủ dự án; không hỏi lại. Nếu đã đạt hết thì ghi rõ bằng chứng (lệnh đã chạy + kết quả).`
                    : ''),
              },
            ];
          }),
          ...keep,
        ],
        checks: r.review?.checks,
        verified: r.review?.verified,
        by: 'director',
      };
      r.revising = targets.map((s) => s.id);
      // một vòng sửa theo yêu cầu + một lần review lại (không cộng dồn vào số vòng của reviewer)
      t.options.maxRevisions = Math.max(1, t.options.maxRevisions);
      r.reviewRound = t.options.maxRevisions - 1;
      r.stage = 'executed';
      r.finalPath = undefined;
      r.status = 'pending';
      picked.push(...targets.map((s) => (runs.length > 1 ? `${r.department}:${s.id}` : s.id)));
    }
    if (!picked.length) throw new Error(want ? 'Hạng mục chọn chưa xong hoặc không tồn tại' : 'Không có hạng mục đã xong để sửa');
    t.status = 'queued';
    t.pause = undefined;
    t.error = undefined;
    t.attention = undefined;
    t.finishedAt = undefined;
    t.options.budgetMode = t.options.budgetMode ?? this.d.config.defaults.budgetMode;
    this.clearResumeTimer(id);
    const lineText = lineIssues.length ? `\n${lineIssues.map((i) => `- **${i.subtask}** ${i.comment}`).join('\n')}` : '';
    this.message(t, dept, 'director', 'decision', `✋ Giám đốc yêu cầu sửa ${picked.join(', ')}${note ? `: ${note}` : ` (${lineIssues.length} bình luận trên diff)`}${lineText}`);
    logs.write({ level: 'info', kind: 'review.director', msg: `${t.id}: giám đốc yêu cầu sửa ${picked.join(', ')}`, taskId: t.id, department: dept, data: { decision: 'reject', subtasks: picked, noteChars: note.length, lineComments: lineIssues.length } });
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
  /**
   * Chỉ dẫn bổ sung cho nhiệm vụ đang chạy/chờ/tạm dừng: lưu vào task.notes, hiện trong hội thoại và được đưa vào
   * bối cảnh (header) của mọi lượt gọi sau — lượt đang chạy làm nốt theo prompt cũ.
   */
  addNote(id: string, text: string): Task {
    const t = this.d.store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    const body = text.trim().slice(0, 4000);
    if (!body) throw new Error('Chỉ dẫn trống');
    if (!['running', 'queued', 'paused'].includes(t.status)) throw new Error('Nhiệm vụ đã kết thúc — dùng "Giao việc tiếp nối" để giao tiếp');
    t.notes ??= [];
    if (t.notes.length >= 30) throw new Error('Đã có 30 chỉ dẫn — hãy giao việc tiếp nối thay vì thêm nữa');
    t.notes.push({ id: shortId('n'), at: nowIso(), text: redact(body, { secrets: true, pii: false }) });
    this.message(t, t.departments[0] ?? 'office', 'director', 'note', body);
    this.save(t, true);
    return t;
  }

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
      if (cur?.status !== 'paused' || (cur.pause?.reason !== 'quota' && cur.pause?.reason !== 'plan')) return;
      try {
        this.resume(cur.id, { auto: true });
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
        if (task.mode === 'department' || task.mode === 'agent') depts = [task.department!];
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
        // CTO nghiệm thu (tạm dừng/hủy giữa chừng thì ném lên như mọi lượt gọi khác)
        await this.accept(task, project);
        task.phase = undefined;
        task.status = 'done';
        logs.write({ level: 'info', kind: 'task.done', msg: `Hoàn thành ${task.id} — ${fmtNum(totalTokens(task.usage))} token${task.attention ? ` · cần xem: ${task.attention.detail}` : ''}`, taskId: task.id, projectId: task.projectId, data: { usage: task.usage } });
        if (task.attention)
          this.alert({ level: 'warn', kind: 'task.attention', title: task.attention.reason === 'review' ? 'Xong nhưng review chưa duyệt' : task.attention.reason === 'acceptance' ? 'Xong nhưng CTO chưa nghiệm thu' : 'Xong nhưng lệnh kiểm tra còn lỗi', msg: `${task.title}: ${task.attention.detail} — xem báo cáo, "Làm lại từ review" hoặc tách việc còn lại`, taskId: task.id });
        void this.d.herdr?.notify(`CCoding: xong ${task.id}${task.attention ? ' (cần xem)' : ''}`, task.title);
      }
    } catch (e) {
      if (e instanceof PauseSignal && !ctrl.signal.aborted) {
        task.status = 'paused';
        // "Không còn runtime" lặp lại (vd. runtime cục bộ tắt, chưa có khóa) → giãn 5/10/20/40/60 phút rồi dừng hẳn,
        // thay vì tự tiếp tục mỗi 5 phút vô hạn (gói 2 ND57: 55 lần liên tiếp không làm gì).
        const noRuntime = e.reason === 'quota' && e.message.startsWith(NO_RUNTIME_PREFIX);
        const streak = noRuntime ? (task.noRuntimeStreak ?? 0) + 1 : undefined;
        task.noRuntimeStreak = streak;
        let resumeAt = e.resumeAt;
        if (streak) {
          if (streak > NO_RUNTIME_MAX_RETRIES) resumeAt = undefined;
          else resumeAt = Math.max(resumeAt ?? 0, Date.now() + Math.min(60, 5 * 2 ** (streak - 1)) * 60_000);
        }
        task.pause = { reason: e.reason, detail: e.message, at: nowIso(), resumeAt: resumeAt ? new Date(resumeAt).toISOString() : undefined, streak };
        if (streak && !resumeAt)
          this.alert({ level: 'error', kind: 'task.paused.no-runtime', title: 'Không có runtime cho nhãn dữ liệu này — đã dừng tự tiếp tục', msg: `${task.title}: ${streak - 1} lần liên tiếp không có runtime/model nào được phép cho nhãn "${task.classification}". Bật runtime (vd. mở Ollama, đặt khóa API) rồi bấm "Tiếp tục".`, taskId: task.id });
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

  /**
   * Pha nghiệm thu (UX-4c): sau khi mọi phòng tổng hợp xong, CTO đối chiếu đề bài với báo cáo, kết luận review và lệnh kiểm tra,
   * kết luận từng tiêu chí. Chưa đạt → "cần xem" (hộp Cần bạn). Báo cáo không đổi (cùng dấu vân tay) thì không nghiệm thu lại.
   * Lỗi gọi model không làm hỏng nhiệm vụ (ghi nhận và bỏ qua); tạm dừng/hủy thì ném lên như mọi lượt gọi.
   */
  private async accept(task: Task, project?: ProjectDef): Promise<void> {
    const { registry, store, logs } = this.d;
    const cto = registry.cto();
    if (!cto || task.mode === 'agent' || task.options.acceptance === false || !task.runs.length) return;
    const sig = task.runs.map((r) => `${r.department}:${r.finishedAt ?? ''}:${r.finalPath ?? ''}`).join('|');
    if (task.acceptance?.sig === sig) return;
    // báo cáo đã viết lại → kết luận nghiệm thu cũ hết hiệu lực
    if (task.attention?.reason === 'acceptance') task.attention = undefined;
    task.phase = 'accept';
    this.save(task);
    // mốc pha cho dòng thời gian (khép pha tổng hợp của phòng cuối)
    logs.write({ level: 'info', kind: 'phase', msg: `CTO: ${ACTIVITY_BY_PHASE.accept}`, taskId: task.id, department: 'office', agentId: cto.id, phase: 'accept' });
    const items: P.AcceptInput[] = task.runs.map((r) => ({
      department: registry.departments.get(r.department)?.name ?? r.department,
      final: r.finalPath ? (store.readRunFile(task.id, r.finalPath) ?? '') : '',
      review: r.review ? `${r.review.approved ? 'Đã duyệt' : 'Chưa duyệt'} — ${r.review.summary}${r.review.issues.length ? ` (${r.review.issues.length} góp ý)` : ''}` : undefined,
    }));
    // B-11(a): chế độ nghiệm thu chỉ áp ở làn đơn chưa nâng làn; mọi trường hợp khác giữ full
    const mode = this.acceptMode(task, project);
    const base = { by: cto.id, at: nowIso(), sig, criteria: [], risks: [], followUps: [], mode: mode.kind };
    if (mode.kind === 'skip') {
      const checks = task.projectChecks?.latest ?? [];
      const body = `## Tóm tắt\nBỏ qua nghiệm thu CTO (B-11, chế độ skip): mọi lệnh kiểm tra đạt, diff không chạm vùng bảo mật/dữ liệu, nhãn dữ liệu ${mode.classification}.\n\n## Tiêu chí nghiệm thu\n${checks.map((c) => `- \`${c.command}\` → đạt`).join('\n')}`;
      const rel = 'ACCEPTANCE.md';
      writeText(path.join(store.runDir(task.id), rel), `${body}\n`);
      task.acceptance = {
        ...base,
        accepted: true,
        parsed: true,
        summary: `Bỏ qua nghiệm thu CTO: ${checks.length} lệnh kiểm tra đều đạt, diff không chạm vùng nhạy cảm, nhãn ${mode.classification}.`,
        criteria: checks.map((c) => ({ name: `Lệnh \`${c.command}\` đạt`, result: 'pass' as const, evidence: c.summary || `exit ${c.code ?? 0}` })),
        path: rel,
      };
      logs.write({ level: 'info', kind: 'accept.skipped', msg: `${task.id}: bỏ qua nghiệm thu CTO (làn đơn, cổng xanh)`, taskId: task.id, projectId: task.projectId, agentId: cto.id, data: { gateGreen: true, sensitiveHit: false, classification: mode.classification, checks: checks.map((c) => ({ cmd: c.command, ok: c.ok })) } });
      this.message(task, 'office', cto.id, 'acceptance', body);
      this.save(task);
      return;
    }
    if (mode.kind === 'brief') logs.write({ level: 'info', kind: 'accept.brief', msg: `${task.id}: nghiệm thu CTO rút gọn (${mode.reason})`, taskId: task.id, projectId: task.projectId, agentId: cto.id, data: { reason: mode.reason } });
    let text = '';
    try {
      const res = await this.call(cto, 'accept', (tools) => (mode.kind === 'brief' ? P.acceptBriefPrompt(task, { changes: task.changes, tools, projectName: project?.name }) : P.acceptPrompt(task, items, { changes: task.changes, tools, projectName: project?.name })), {
        task,
        project,
        cwd: task.workspace ?? this.workspaceFor(task, project),
        activity: ACTIVITY_BY_PHASE.accept,
        hints: { brief: task.brief, subtasks: task.runs.flatMap((r) => r.subtasks.map(stHint)) },
        ...(mode.kind === 'brief' ? { maxTokens: ACCEPT_BRIEF_MAX_TOKENS } : {}),
      });
      // lỗi hạ tầng (res.error) không bao giờ vào parseAcceptance — nhảy xuống catch để ghi nghiệm thu lỗi, không ghi "không đọc được"
      if (res.error || !res.text) throw new Error(res.error || 'không có nội dung');
      text = res.text;
    } catch (e) {
      // chạm trần ngân sách (chế độ "tạm dừng") ở bước nghiệm thu: báo cáo đã xong — giao kết quả, ghi chưa nghiệm thu thay vì tạm dừng cả nhiệm vụ
      const budget = e instanceof PauseSignal && e.reason === 'budget';
      if (!budget && (e instanceof PauseSignal || e instanceof CancelledError)) throw e;
      const msg = budget ? 'hết ngân sách nhiệm vụ — tăng ngân sách rồi bấm "↻ Nghiệm thu lại"' : (e as Error).message.slice(0, 300);
      task.acceptance = { ...base, accepted: false, parsed: false, summary: '', error: msg };
      logs.write({ level: 'warn', kind: 'accept.error', msg: `${task.id}: CTO chưa nghiệm thu được — ${msg}`, taskId: task.id, projectId: task.projectId, agentId: cto.id });
      this.message(task, 'office', 'system', 'system', `⚠️ CTO chưa nghiệm thu được (${msg}) — kết quả vẫn được giao; xem báo cáo và tự đối chiếu.`);
      // lỗi hạ tầng ≠ "đã nghiệm thu": báo người dùng xem lại (không đè lý do cần xem sẵn có)
      if (!budget && !task.attention) task.attention = { reason: 'acceptance', detail: `CTO chưa nghiệm thu được do lỗi lượt gọi: ${msg.slice(0, 200)} — bấm "↻ Nghiệm thu lại"`, at: nowIso() };
      this.save(task);
      return;
    }
    const r = parseAcceptance(text);
    // phần hiển thị: bỏ đúng khối JSON kết luận (khối cuối có accepted/criteria), giữ JSON CTO trích dẫn làm bằng chứng
    const body = r.body || text.trim();
    const rel = 'ACCEPTANCE.md';
    writeText(path.join(store.runDir(task.id), rel), `${body}\n`);
    task.acceptance = { ...base, accepted: r.accepted, parsed: r.parsed, summary: r.summary || extractSummary(body, 240), criteria: r.criteria, risks: r.risks, followUps: r.followUps, path: rel };
    const fails = r.criteria.filter((c) => c.result !== 'pass').length;
    logs.write({ level: r.accepted ? 'info' : 'warn', kind: 'accept.done', msg: `${task.id}: CTO ${r.accepted ? 'nghiệm thu' : r.parsed ? `chưa nghiệm thu (${fails}/${r.criteria.length} tiêu chí chưa đạt)` : 'không ghi kết luận đọc được'}`, taskId: task.id, projectId: task.projectId, agentId: cto.id, data: { accepted: r.accepted, parsed: r.parsed, criteria: r.criteria.length, fails } });
    if (r.parsed) logs.write({ level: 'info', kind: 'gate.decision', msg: `${task.id}: cổng CTO ${r.accepted ? 'đạt' : 'chặn'}`, taskId: task.id, projectId: task.projectId, agentId: cto.id, data: { gate: 'cto', verdict: r.accepted ? 'pass' : 'block' } });
    this.message(task, 'office', cto.id, 'acceptance', body);
    const why = `CTO chưa nghiệm thu: ${fails ? `${fails}/${r.criteria.length} tiêu chí chưa đạt hoặc chưa kiểm được` : 'chưa có tiêu chí đạt'}`;
    if (r.parsed && !r.accepted) {
      if (!task.attention) task.attention = { reason: 'acceptance', detail: why, at: nowIso() };
      // đã "cần xem" vì review/lệnh kiểm tra → ghi thêm kết luận của CTO để cảnh báo và hộp Cần bạn nói đủ
      else if (!task.attention.detail.includes('CTO chưa nghiệm thu')) task.attention.detail = `${task.attention.detail} · ${why}`;
    }
    this.save(task);
  }

  /**
   * B-11(a): chọn chế độ nghiệm thu. Chỉ làn đơn chưa nâng làn mới theo `slim.accept`; còn lại luôn full.
   * skip cần đủ ba điều kiện (mọi lệnh kiểm tra xanh, diff không chạm vùng nhạy cảm, nhãn dữ liệu < Bảo mật); thiếu điều kiện nào thì lùi về brief.
   */
  private acceptMode(task: Task, project?: ProjectDef): { kind: 'full' } | { kind: 'brief'; reason: string } | { kind: 'skip'; classification: Classification } {
    if (task.lane !== 'single' || task.runs.some((r) => r.escalatedFrom === 'single')) return { kind: 'full' };
    const want: AcceptMode = resolveSlim(this.d.config, project, task.options).accept;
    if (want === 'full') return { kind: 'full' };
    if (want === 'brief') return { kind: 'brief', reason: 'configured' };
    const latest = task.projectChecks?.latest ?? [];
    const classification = maxClass((project?.classification ?? task.classification) as Classification, task.classification);
    const missing: string[] = [];
    if (!latest.length || latest.some((c) => !c.ok)) missing.push('cổng lệnh kiểm tra chưa xanh');
    if (sensitivePaths(changedFiles(task.workspace, task.baseRef).filter((f) => !f.startsWith('.ccoding/'))).length) missing.push('diff chạm vùng bảo mật/dữ liệu');
    if (CLASS_RANK[classification] >= CLASS_RANK.confidential) missing.push(`nhãn dữ liệu ${classification}`);
    return missing.length ? { kind: 'brief', reason: `fallback:${missing.join('; ')}` } : { kind: 'skip', classification };
  }

  private async route(task: Task, project?: ProjectDef): Promise<string[]> {
    const { registry } = this.d;
    const depts = [...registry.departments.values()];
    // B-01: ép làn đơn → định tuyến bằng từ khóa, không gọi LLM (làn đơn không có lượt route)
    const router = forcedLane(task.options.lane, project?.lane) === 'single' ? undefined : registry.router();
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
      // lượt route lỗi → không đọc text lỗi như kết quả định tuyến; lùi về định tuyến bằng từ khóa (có log)
      if (res.error) this.d.logs.write({ level: 'warn', kind: 'route.error', msg: `${task.id}: lượt định tuyến lỗi (${res.error.slice(0, 200)}) — dùng định tuyến từ khóa`, taskId: task.id, agentId: router.id });
      result = res.error ? undefined : parseRoute(res.text, depts.map((d) => d.id));
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
      parallelWriters: this.parallelWorktrees(task, project),
      repoMap: this.repoMaps.get(task.id),
      caps: access === 'none' ? undefined : this.capabilities(roster, access, this.gitReadable(task, project)),
      // B-09 (outputCap, stopSurveyHint: mặc định tắt), B-03 (incidentLog: mặc định bật)
      flags: { outputCap: !!this.d.config.phases.outputCap, stopSurvey: !!this.d.config.phases.stopSurveyHint, incidentLog: this.d.config.phases.incidentLog !== false },
    };
  }

  /**
   * Điều phối làn nhanh sau khi lập kế hoạch (luật cứng, không gọi model): (1) hạng mục giao cho người review: thuần kiểm thử (mọi tệp nêu
   * tên là tệp test) → trọng tâm review (benchtest 2/11: các hạng mục này dài nhất, nằm trên đường găng); có sửa mã nguồn → giao người khác
   * (C7 2/11: bỏ nhầm "sửa lỗi trong src/promotions.js" khiến lỗi không ai sửa); (2) hạng mục độc lập trùng người làm → chia cho người khác
   * cùng năng lực công cụ để chạy song song (mỗi người chỉ làm một hạng mục một lúc).
   */
  private shapeFastPlan(task: Task, run: DeptRun, roster: AgentDef[], lead: AgentDef, reviewer: AgentDef | undefined, pctx: P.Ctx): void {
    const notes: string[] = [];
    const pool = roster.filter((a) => a.id !== lead.id && a.id !== reviewer?.id);
    const used = new Set(run.subtasks.filter((s) => s.assignee !== reviewer?.id).map((s) => s.assignee));
    if (task.options.review && reviewer && run.subtasks.length > 1) {
      const mine = run.subtasks.filter((s) => s.assignee === reviewer.id);
      // chỉ hạng mục THUẦN kiểm thử (mọi tệp nêu tên là tệp test) mới thành trọng tâm review; hạng mục có sửa mã nguồn giao cho người
      // khác — benchtest C7 t2 (2/11): "sửa lỗi 3, 4 trong src/promotions.js" giao nhầm cho QA bị bỏ khỏi thực thi → lỗi không ai sửa
      const testOnly = (s: Subtask) => {
        const files = `${s.title}\n${s.description}`.match(/[\w./-]+\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|sql|json|ya?ml|md)\b/gi) ?? [];
        const testPath = (f: string) => /(^|[\/._-])(tests?|specs?|__tests__)([\/._-]|$)/i.test(f);
        if (!/test|kiểm thử/i.test(s.title)) return false;
        return files.length ? files.every(testPath) : /viết (bộ )?test|bộ test|kiểm thử/i.test(s.title);
      };
      const focus = mine.filter(testOnly);
      if (focus.length && focus.length < run.subtasks.length) {
        const ids = new Set(focus.map((s) => s.id));
        run.subtasks = run.subtasks.filter((s) => !ids.has(s.id));
        for (const s of run.subtasks) if (s.dependsOn?.length) s.dependsOn = s.dependsOn.filter((d) => !ids.has(d));
        run.reviewFocus = focus.map((s) => `- ${s.title}: ${s.description.slice(0, 600)}`).join('\n');
        notes.push(`${[...ids].join(', ')} (@${reviewer.id}) chuyển thành trọng tâm review, không nằm trên đường găng`);
      }
      for (const s of mine.filter((x) => !testOnly(x))) {
        const cap = pctx.caps?.[reviewer.id];
        const alt = pool.find((a) => !used.has(a.id) && pctx.caps?.[a.id] === cap) ?? pool.find((a) => !used.has(a.id)) ?? pool.find((a) => pctx.caps?.[a.id] === cap) ?? pool[0];
        if (!alt) continue;
        notes.push(`${s.id} chuyển @${reviewer.id} → @${alt.id} (người review không tự làm việc mình sẽ review)`);
        s.assignee = alt.id;
        used.add(alt.id);
      }
    }
    const seen = new Set<string>();
    for (const s of run.subtasks) {
      if (!seen.has(s.assignee)) {
        seen.add(s.assignee);
        continue;
      }
      if (s.dependsOn?.length) continue;
      const cap = pctx.caps?.[s.assignee];
      const alt = pool.find((a) => !used.has(a.id) && !seen.has(a.id) && pctx.caps?.[a.id] === cap);
      if (!alt) continue;
      notes.push(`${s.id} chuyển @${s.assignee} → @${alt.id} để chạy song song`);
      s.assignee = alt.id;
      used.add(alt.id);
      seen.add(alt.id);
    }
    // kế hoạch làn nhanh có tới 4 hạng mục độc lập; maxParallel mặc định 3 → hạng mục thứ 4 phải chờ một chỗ trống (đo 2/11: +30 s đường găng)
    const roots = run.subtasks.filter((s) => !s.dependsOn?.length).length;
    const want = Math.min(roots, this.d.config.fastLane.maxParallel ?? 4);
    if (want > task.options.maxParallel) {
      notes.push(`chạy cùng lúc ${want} hạng mục (thay vì ${task.options.maxParallel})`);
      task.options.maxParallel = want;
    }
    if (notes.length) this.message(task, run.department, 'system', 'system', `⚡ Điều phối làn nhanh: ${notes.join('; ')}.`);
  }

  /**
   * Làn xử lý của nhiệm vụ (B-01, backlog §3.1): options.lane 'single'/'fast'/'full' ghi đè; 'auto' → chooseLane (src/lane.ts, quy tắc 1–4,
   * không gọi LLM) theo tín hiệu briefChars/parts/filesTouched/repoFiles/repoBytes. Việc lớn: làn nhanh khi bật fastLane và repo/đề nằm trong ngưỡng, ngược lại làn đầy.
   * Ghi signals, lane, why vào log 'lane.pick'. Làn đơn chạy bằng runSingleLane.
   */
  private pickLane(task: Task, project: ProjectDef | undefined, pctx: P.Ctx): { lane: 'single' | 'fast' | 'full'; why: string } {
    const forced = forcedLane(task.options.lane, project?.lane);
    const cfg = this.d.config;
    const fl = cfg.fastLane;
    let signals: LaneSignals | undefined;
    let pick: { lane: 'single' | 'fast' | 'full'; why: string } = { lane: 'full', why: '' };
    if (forced) {
      signals = laneSignals(task.brief, [], 0, forced);
      pick = { lane: forced, why: 'theo yêu cầu' };
    } else if (!fl?.enabled || task.mode === 'agent' || task.mode === 'joint' || !project?.workspace || !pctx.filesAccessible) {
      pick = { lane: 'full', why: '' };
    } else {
      const ls = spawnSync('git', ['ls-files', '-z'], { cwd: pctx.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      if (ls.status === 0) {
        const files = ls.stdout.split('\0').filter(Boolean);
        let bytes = 0;
        for (const f of files) {
          try {
            bytes += fs.statSync(path.join(pctx.cwd, f)).size;
          } catch {
            /* tệp đã xóa trong worktree */
          }
          if (bytes > fl.maxRepoBytes) break;
        }
        signals = laneSignals(task.brief, files, bytes);
        // V4-3f khối B: không có worktree con ⇒ hạng mục chạy lệnh làm lần lượt (executeAll: exclusive) ⇒ chia việc không nhanh hơn
        if (pctx.serialWriters && !pctx.parallelWriters) signals.serialWriters = true;
        const ch = chooseLane(signals, cfg);
        pick = { lane: ch.lane, why: ch.why };
      }
    }
    if (signals) this.laneSigs.set(task.id, signals);
    this.d.logs.write({
      level: 'info',
      kind: 'lane.pick',
      msg: `${task.id}: làn ${pick.lane}${pick.why ? ` — ${pick.why}` : ''}`,
      taskId: task.id,
      projectId: task.projectId,
      data: { lane: pick.lane, why: pick.why, signals },
    });
    if (signals) {
      const sg = signals;
      this.message(task, task.departments?.[0] ?? 'system', 'system', 'system', `🧭 Chọn làn ${pick.lane}${pick.why ? ` (${pick.why})` : ''} — tín hiệu: đề ${sg.briefChars} ký tự, ${sg.parts} phần, ${sg.filesTouched} tệp/thư mục nêu, repo ${sg.repoFiles} tệp / ${Math.round(sg.repoBytes / 1024)} KB${sg.sequential ? ', nối tiếp' : ''}${sg.serialWriters ? ', không chạy song song được' : ''}${sg.forced ? `, ép ${sg.forced}` : ''}.`);
    }
    return pick;
  }

  /**
   * B-01 làn đơn (backlog §3.2–§3.3): một agent đúng vai làm trọn đề bài ở pha execute trong worktree nhiệm vụ — không route, plan, họp,
   * worktree con hay tổng hợp bằng LLM. Sau đó chạy cổng B-02 (`runQualityGate`) và dựng FINAL.md từ mẫu. Bản ghi run có đúng 1 hạng mục
   * nên KPI, lịch sử và pha CTO nghiệm thu (`accept`) chạy như các làn khác. Nâng lên multi-agent (task.lane → fast/full, giữ worktree,
   * bàn giao dở dang làm `prior` cho pha plan, đi qua cổng B-10) khi: còn đỏ sau gate.maxFixRounds, phạm vi thực tế vượt ngưỡng, hoặc đầu ra có dòng `ESCALATE:`.
   */
  private async runSingleLane(
    task: Task,
    run: DeptRun,
    project: ProjectDef | undefined,
    dept: DepartmentDef,
    roster: AgentDef[],
    lead: AgentDef,
    reviewer: AgentDef | undefined,
    pctx: P.Ctx,
    base: CallCtx,
    prior: string | undefined,
  ): Promise<{ final: string; prior?: undefined } | { final?: undefined; prior: string | undefined }> {
    const { registry, config, logs, store } = this.d;
    run.status = 'running';
    run.startedAt ??= nowIso();
    const checkable = this.projectCheckable(task, project);

    // B-11 (b)(c): làm gọn prompt thực thi làn đơn — chưa nâng làn; nâng làn thì xóa (prompt đầy đủ trở lại)
    const slim = resolveSlim(config, project, task.options);
    if (run.escalatedFrom !== 'single' && (slim.promptDiet || slim.compactTemplate)) {
      const files = slim.promptDiet ? this.smallRepoFiles(pctx.cwd) : undefined;
      pctx.singleSlim = { diet: slim.promptDiet, compact: slim.compactTemplate, files };
      logs.write({ level: 'info', kind: 'slim.prompt', msg: `${task.id}: làm gọn prompt làn đơn (promptDiet=${slim.promptDiet}, compactTemplate=${slim.compactTemplate}${files ? `, danh sách ${files.length} tệp thay bản đồ repo` : ''})`, taskId: task.id, department: dept.id, data: { promptDiet: slim.promptDiet, compactTemplate: slim.compactTemplate, fileList: files?.length } });
    } else pctx.singleSlim = undefined;

    // 1) baseline lệnh kiểm tra của dự án
    if (checkable && !task.projectChecks?.baseline && !run.subtasks.some((s) => s.attempts > 0 || s.status === 'done')) {
      this.setPhase(task, run, 'execute');
      await this.runProjectChecks(task, project, dept.id, 'baseline');
    }

    // 2) một hạng mục, một agent đúng vai (khớp kỹ năng; có quyền chạy lệnh nếu dự án có lệnh kiểm tra)
    if (!run.subtasks.length) {
      let pool = roster.filter((a) => a.role === 'member');
      if (!pool.length) pool = [lead];
      if (checkable && pool.some((a) => this.isWriter(a, task, project))) pool = pool.filter((a) => this.isWriter(a, task, project));
      const pick = pool.map((a) => ({ a, s: skillScore(task.brief, a) })).sort((x, y) => y.s - x.s)[0].a;
      run.subtasks = [
        newSubtask({
          id: 'S1',
          title: task.title,
          assignee: pick.id,
          description: `${task.brief}\n\n(Làn đơn) Bạn làm trọn đề bài này một mình. Nếu thấy việc vượt phạm vi (cần chia việc nhiều người, đụng nhiều tệp/phần hơn đề bài nêu), dừng và ghi một dòng \`ESCALATE: <lý do>\` trong bàn giao để CCoding nâng lên đội đa tác tử.`,
          deliverable: 'Sản phẩm theo yêu cầu, báo cáo bàn giao theo mẫu đầu ra',
        }),
      ];
      run.planSummary = `Làn đơn: ${pick.name} (@${pick.id}) làm trọn đề bài trong worktree nhiệm vụ`;
      run.decisions = '';
      run.stage = 'finalized';
      this.message(task, dept.id, 'system', 'system', `🎯 Làn đơn: ${pick.name} (@${pick.id}) làm trọn đề bài — không lập kế hoạch, không họp, không tổng hợp bằng model.`);
      this.save(task);
    }
    const st = run.subtasks[0];
    const agent = registry.agent(st.assignee);

    const scopeExceeded = (): string | undefined => {
      // V4-3f khối B: hạng mục chạy lệnh sẽ làm lần lượt ⇒ nâng lên đội chỉ vì phạm vi rộng không nhanh hơn mà tốn thêm (còn đỏ / ESCALATE vẫn nâng)
      if (pctx.serialWriters && !pctx.parallelWriters && config.fastLane?.requireParallel !== false) return undefined;
      const files = changedFiles(task.workspace, task.baseRef).filter((f) => !f.startsWith('.ccoding/'));
      const max = config.lanes?.single?.maxFilesTouched ?? 6;
      const est = laneSignals(task.brief, [], 0).filesTouched;
      if (files.length > max) return `diff thực tế chạm ${files.length} tệp (> ${max})`;
      if (est > 0 && files.length > 2 * est) return `diff thực tế chạm ${files.length} tệp (> 2 × ước lượng ${est})`;
      return undefined;
    };
    const escalateMark = (): string | undefined => {
      const m = /^[ \t>*-]*ESCALATE:[ \t]*(.*)$/m.exec(this.readOutput(task, st));
      return m ? m[1].trim() || 'agent yêu cầu nâng cấp' : undefined;
    };
    /** Giữ worktree, chuyển task.lane sang fast/full và bàn giao dở dang cho luồng có plan. */
    const escalate = (reason: string, trigger: 'red' | 'scope' | 'agent'): { prior: string | undefined } => {
      const signals = laneSignals(task.brief, [], 0);
      const target: 'fast' | 'full' = config.fastLane?.enabled && task.mode !== 'joint' && signals.briefChars <= config.fastLane.maxBriefChars ? 'fast' : 'full';
      const pc = task.projectChecks;
      const fmt = (rs?: CheckResult[]) => (rs?.length ? rs.map((r) => `- \`${r.command}\` → ${r.ok ? 'đạt' : `đỏ (exit ${r.code ?? '?'})${r.summary ? `: ${r.summary.slice(0, 160)}` : ''}`}`).join('\n') : '(chưa chạy)');
      const handover = [
        `# Bàn giao dở dang từ làn đơn (@${agent.id}) — lý do nâng cấp: ${reason}`,
        'Worktree nhiệm vụ được giữ nguyên: phần đã làm vẫn nằm trong repo. Lập kế hoạch trên nền đó, KHÔNG làm lại từ đầu.',
        '',
        '## Thay đổi hiện có (diff)',
        (this.workspaceChanges(task) || '(chưa có thay đổi)').slice(0, 3000),
        '',
        '## Lệnh kiểm tra — baseline',
        fmt(pc?.baseline),
        '',
        '## Lệnh kiểm tra — mới nhất',
        fmt(pc?.latest),
        '',
        '## Ghi chú của agent',
        (this.readOutput(task, st) || '(không có bàn giao)').slice(0, 3000),
      ].join('\n');
      writeText(path.join(store.runDir(task.id), 'LANE-HANDOVER.md'), `${handover}\n`);
      logs.write({ level: 'warn', kind: 'lane.escalate', msg: `${task.id}: nâng cấp làn đơn → ${target} (${reason})`, taskId: task.id, projectId: task.projectId, department: dept.id, agentId: agent.id, data: { from: 'single', to: target, trigger, reason, fixRounds: config.gate?.maxFixRounds } });
      this.message(task, dept.id, 'system', 'system', `⬆️ Nâng cấp làn đơn → làn ${target === 'fast' ? 'nhanh' : 'đầy'} (${reason}). Worktree được giữ; phần làm dở của @${agent.id} chuyển cho trưởng phòng lập kế hoạch.`);
      task.lane = target;
      pctx.singleSlim = undefined;
      run.escalatedFrom = 'single'; // LANE-HANDOVER.md đã ghi TRƯỚC this.save() bên dưới → resume nạp lại được
      if (target === 'fast' && !task.options.phaseModels?.plan && config.fastLane.planModel) task.options.phaseModels = { ...task.options.phaseModels, plan: config.fastLane.planModel };
      run.subtasks = [];
      run.stage = undefined;
      run.review = undefined;
      run.planSummary = undefined;
      run.decisions = undefined;
      this.save(task);
      return { prior: `${prior ? `${prior}\n\n` : ''}${handover}` };
    };

    // 3) thực thi
    if (!reached(run, 'executed')) {
      this.setPhase(task, run, 'execute');
      st.status = 'running';
      try {
        await this.runSubtask(task, run, st, pctx, base, prior);
      } catch (e) {
        if (st.status === 'running') st.status = 'pending';
        throw e;
      }
      run.stage = 'executed';
      if (checkable && (st.status as string) === 'done') await this.runProjectChecks(task, project, dept.id, 'execute');
      this.save(task);
    }

    // 4) cổng B-02 (+ nâng cấp §3.3)
    if (!reached(run, 'reviewed') && st.status === 'done') {
      const early = escalateMark();
      if (early) return escalate(`agent ghi ESCALATE: ${early}`, 'agent');
      const wide = scopeExceeded();
      if (wide) return escalate(wide, 'scope');
      const gate = await this.runQualityGate(task, run, project, agent, { dept: dept.id, pctx, base });
      const stillRed = gate.classes.filter((c) => c.cls === 'regression-or-new' || c.cls === 'red-required').map((c) => c.command);
      if (stillRed.length) return escalate(`còn đỏ sau ${gate.fixRounds} vòng sửa theo kiểm tra: ${stillRed.map((c) => `\`${c}\``).join(', ')}`, 'red');
      const late = escalateMark();
      if (late) return escalate(`agent ghi ESCALATE: ${late}`, 'agent');
      const wide2 = scopeExceeded();
      if (wide2) return escalate(wide2, 'scope');
      const sysNow = task.projectChecks?.latest ?? [];
      const gateChecks = sysNow.map((r) => ({ command: r.command, exitCode: r.code ?? undefined, ok: r.ok, note: `CCoding tự chạy${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}` }));
      const canReview = !!(task.options.review && reviewer && reviewer.id !== agent.id);
      if (!gate.needReviewer) {
        const summary = `Cổng chất lượng (làn đơn): lệnh kiểm tra đều xanh${gate.fixRounds ? ` sau ${gate.fixRounds} vòng sửa` : ''}, mẫu đầu ra đạt, diff không chạm vùng bảo mật — không thuộc diện bắt buộc review.`;
        run.review = { approved: true, summary, issues: [], checks: gateChecks, verified: true };
        logs.write({ level: 'info', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'skip-reviewer', fixRounds: gate.fixRounds, lane: 'single' } });
        this.message(task, dept.id, 'system', 'system', `✅ ${summary}`);
      } else if (!canReview || !reviewer) {
        // cần reviewer mà không có: ghi kiểm chứng theo cổng, KHÔNG tự gắn approved (D-02); không có lệnh kiểm tra nào thì không có gì để ghi
        if (gateChecks.length) {
        const summary = `Cổng chất lượng (làn đơn): cần reviewer (${gate.reasons.join('; ')}) nhưng phòng không có/không bật — chờ giám đốc xem.`;
        run.review = { approved: false, summary, issues: [], checks: gateChecks, verified: gateChecks.length > 0 };
        logs.write({ level: 'warn', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'no-reviewer', reasons: gate.reasons, lane: 'single' } });
        this.message(task, dept.id, 'system', 'system', `✋ ${summary}`);
        }
      } else {
        logs.write({ level: 'info', kind: 'gate.review', msg: `${task.id}: gọi reviewer — ${gate.reasons.join('; ')}`, taskId: task.id, department: dept.id, data: { decision: 'call-reviewer', reasons: gate.reasons, lane: 'single' } });
        this.setPhase(task, run, 'review');
        const items = [this.depInput(task, st)];
        const { res, review } = await this.reviewWithVerdict(task, dept.id, run, reviewer, { ...pctx, reviewFocus: run.reviewFocus }, items, (tools) => P.reviewPrompt({ ...pctx, reviewFocus: run.reviewFocus }, items, tools, this.workspaceChanges(task), checkable), { ...base, hints: { brief: task.brief, subtasks: [stHint(st)], attempt: 0 } });
        if (assignStrayIssues(review.issues, [st])) review.approved = false;
        run.review = { approved: review.approved, summary: review.summary, issues: review.issues, checks: gateChecks, verified: gateChecks.length > 0 || (res.toolCalls ?? []).some((tc) => tc.name === 'run_command') };
      }
      run.reviewRound = 0;
      this.save(task);
    }
    if (!reached(run, 'reviewed')) {
      run.stage = 'reviewed';
      if (run.review && !run.review.approved) task.attention = { reason: 'review', detail: `${dept.short}: ${run.review.summary.slice(0, 280)}`, at: nowIso() };
      else if (task.projectChecks?.latest?.some((r) => !r.ok)) task.attention = { reason: 'checks', detail: `Lệnh kiểm tra còn lỗi: ${task.projectChecks.latest.filter((r) => !r.ok).map((r) => r.command).join(', ')}`, at: nowIso() };
      else if (run.review?.approved && !run.review.by && run.review.verified === false) task.attention = { reason: 'review', detail: `${dept.short}: duyệt nhưng chưa có kiểm chứng chạy thật — cần giám đốc xem.`, at: nowIso() };
      this.save(task);
    }

    // 5) FINAL.md dựng từ mẫu — không gọi LLM
    this.checkAbort(task);
    const reviewText = run.review ? `${run.review.approved ? 'Đã duyệt' : 'Chưa duyệt hoàn toàn'}: ${run.review.summary}` : '';
    const finalText = P.templateReport(task, dept, run, [this.depInput(task, st)], reviewText, this.workspaceChanges(task), 'Làn đơn: một agent làm trọn đề bài; báo cáo dựng tự động từ bàn giao và kết quả cổng chất lượng (không gọi model).');
    const rel = `${safeName(dept.id)}-FINAL.md`;
    writeText(path.join(store.runDir(task.id), rel), finalText);
    run.finalPath = rel;
    run.status = st.status === 'done' ? 'done' : 'failed';
    run.stage = 'done';
    run.finishedAt = nowIso();
    run.phase = undefined;
    this.message(task, dept.id, agent.id, 'final', `Báo cáo làn đơn đã xong: ${extractSummary(finalText, 240)}`);
    this.save(task);
    return { final: finalText };
  }

  /**
   * K2: một lượt review + lấy kết luận khi chạm trần lượt. Thứ tự: (1) không đọc được JSON và `capped` ⇒ một lượt tiếp nối
   * không công cụ chỉ để trả JSON kết luận; (2) vẫn không ⇒ chạy lại review đúng một lần với trần lượt gấp đôi;
   * (3) vẫn không ⇒ attention rõ "review chưa có kết luận", không bao giờ approved. Mọi lượt đi qua `call()`.
   * Review bình thường (đọc được JSON ngay) không phát sinh lượt gọi thêm.
   */
  private async reviewWithVerdict(
    task: Task,
    deptId: string,
    run: DeptRun,
    reviewer: AgentDef,
    pctx: P.Ctx,
    items: Parameters<typeof P.reviewPrompt>[1],
    build: Builder,
    ctx: CallCtx,
  ): Promise<{ res: RunResult; review: ReturnType<typeof parseReview> }> {
    const ids = items.map((i) => i.st.id);
    const { logs } = this.d;
    let res = await this.call(reviewer, 'review', build, ctx);
    if (res.error) throw new Error(`Không review được: ${res.error}`);
    let review = parseReview(res.text, ids);
    if (review.parsed || !res.capped) return { res, review };

    const why = res.capped === 'input' ? 'hết trần token công cụ' : 'hết lượt công cụ';
    // (1) lượt tiếp nối chỉ để trả kết luận — không công cụ (trần = 0)
    logs.write({ level: 'warn', kind: 'review.verdict', msg: `${task.id}: review ${why} mà chưa có kết luận JSON — gọi lượt tiếp nối chỉ để trả kết luận`, taskId: task.id, department: deptId, agentId: reviewer.id, phase: 'review', data: { step: 'followup', capped: res.capped } });
    this.message(task, deptId, 'system', 'system', `↻ Review ${why} mà chưa có kết luận — yêu cầu @${reviewer.id} trả kết luận theo mẫu JSON dựa trên những gì đã kiểm.`);
    const first = res;
    const fu = await this.call(reviewer, 'review', () => P.reviewVerdictPrompt(pctx, items, first.text), { ...ctx, noTools: true, activity: 'Review: trả kết luận sau khi chạm trần' });
    if (!fu.error) {
      const r = parseReview(fu.text, ids);
      if (r.parsed) return { res: { ...first, text: fu.text }, review: r };
    }
    // (2) chạy lại review một lần với trần lượt công cụ gấp đôi
    const turns = (this.d.config.phases?.toolTurns?.review ?? 8) * 2;
    logs.write({ level: 'warn', kind: 'review.verdict', msg: `${task.id}: lượt tiếp nối không ra kết luận — chạy lại review với trần ${turns} lượt công cụ`, taskId: task.id, department: deptId, agentId: reviewer.id, phase: 'review', data: { step: 'rerun', maxTurns: turns } });
    this.message(task, deptId, 'system', 'system', `↻ Lượt tiếp nối chưa ra kết luận — chạy lại review một lần với trần ${turns} lượt công cụ.`);
    const again = await this.call(reviewer, 'review', build, { ...ctx, maxTurns: turns, activity: 'Review: chạy lại với trần lượt cao hơn' });
    if (!again.error) {
      res = again;
      review = parseReview(again.text, ids);
      if (review.parsed) return { res, review };
    }
    // (3) không im lặng đi tiếp
    const summary = 'Review chưa có kết luận: reviewer chạm trần lượt công cụ, lượt tiếp nối và lần chạy lại đều không trả JSON kết luận — chưa duyệt, cần giám đốc xem.';
    logs.write({ level: 'warn', kind: 'review.verdict', msg: `${task.id}: ${summary}`, taskId: task.id, department: deptId, agentId: reviewer.id, phase: 'review', data: { step: 'none' } });
    this.message(task, deptId, 'system', 'system', `⛔ ${summary}`);
    task.attention = { reason: 'review', detail: summary, at: nowIso() };
    this.save(task);
    return { res, review: { approved: false, summary, issues: [], checks: [], parsed: false } };
  }

  /** Năng lực công cụ ở pha thực thi của từng người (với quyền của nhiệm vụ) — trưởng phòng giao việc theo đó. */
  private capabilities(roster: AgentDef[], access: ToolAccess, gitRead: boolean): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of roster) {
      const t = toolsFor(a.tools, access, 'execute', false, gitRead);
      const git = t.includes('git_read') ? ', xem lịch sử git (chỉ đọc)' : '';
      out[a.id] = t.includes('run_command')
        ? 'chạy lệnh (test, build, migration, git) + đọc/ghi tệp'
        : t.includes('write_file') || t.includes('edit_file')
          ? `đọc/ghi tệp${git} — KHÔNG chạy test/build/lệnh`
          : t.includes('read_file')
            ? `chỉ đọc tệp${git}`
            : 'không dùng công cụ';
    }
    return out;
  }

  private async runDepartment(task: Task, run: DeptRun, project: ProjectDef | undefined, prior?: string): Promise<string> {
    const { registry } = this.d;
    const dept = registry.department(run.department);
    const roster = registry.members(dept.id, project?.agents);
    const lead = registry.agent(dept.lead);
    const reviewer = dept.reviewer ? registry.agents.get(dept.reviewer) : undefined;
    const pctx = this.pctx(task, dept, project, roster);
    const base: CallCtx = { task, dept, run, project, cwd: pctx.cwd };
    // Làn nhanh (việc nhỏ): điều phối nhanh, chia song song, không họp, báo cáo theo mẫu — chọn một lần, lưu vào nhiệm vụ
    if (!task.lane) {
      const pick = this.pickLane(task, project, pctx);
      task.lane = pick.lane;
      if (task.lane === 'fast') {
        if (!task.options.phaseModels?.plan && this.d.config.fastLane.planModel) task.options.phaseModels = { ...task.options.phaseModels, plan: this.d.config.fastLane.planModel };
        this.message(task, dept.id, 'system', 'system', `⚡ Làn nhanh (${pick.why}): lập kế hoạch nhanh, chia việc song song, không họp${this.d.config.fastLane.finalReport === 'template' ? ', báo cáo dựng từ bàn giao' : ''}.`);
      }
      this.save(task);
    }
    pctx.lane = task.lane === 'single' ? 'fast' : task.lane;
    // B-01: làn đơn — một agent, không route/plan/họp/worktree con/tổng hợp LLM; nâng lên multi-agent thì chạy tiếp luồng có plan bên dưới
    if (task.lane === 'single' && !(task.mode === 'agent' && task.agentId)) {
      const r = await this.runSingleLane(task, run, project, dept, roster, lead, reviewer, pctx, base, prior);
      if (r.final !== undefined) return r.final;
      prior = r.prior;
      pctx.singleSlim = undefined;
      pctx.lane =task.lane === 'single' ? 'fast' : task.lane;
    }
    // tiếp tục sau tạm dừng giữa lúc nâng làn (plan/execute chưa xong): `prior` của lần nâng đã mất → nạp lại bàn giao dở dang
    if (run.escalatedFrom === 'single' && task.lane !== 'single' && !reached(run, 'executed') && !prior?.includes('# Bàn giao dở dang từ làn đơn')) {
      const handover = this.d.store.readRunFile(task.id, 'LANE-HANDOVER.md');
      if (handover) prior = `${prior ? `${prior}\n\n` : ''}${handover}`;
      else this.d.logs.write({ level: 'warn', kind: 'lane.handover', msg: `${task.id}: tiếp tục sau nâng làn nhưng không thấy LANE-HANDOVER.md`, taskId: task.id, department: dept.id });
    }
    const names = new Map([...registry.agents.values()].map((a) => [a.id, a.name]));
    const rosterHints = roster.map((a) => ({ id: a.id, name: a.name, title: a.title, role: a.role, skills: a.skills }));
    run.status = 'running';
    run.startedAt ??= nowIso();
    run.stage ??= inferStage(run);
    if (run.stage && task.resumes) this.d.logs.write({ level: 'info', kind: 'checkpoint', msg: `${dept.short}: tiếp tục sau mốc "${run.stage}"`, taskId: task.id, department: dept.id });

    // 0) Việc giao riêng cho một agent: một hạng mục, không lập kế hoạch/họp
    const solo = task.mode === 'agent' && task.agentId ? registry.agents.get(task.agentId) : undefined;
    if (solo && !reached(run, 'planned')) {
      run.subtasks = [newSubtask({ id: 'S1', title: task.title, assignee: solo.id, description: task.brief, deliverable: 'Sản phẩm theo yêu cầu, báo cáo bàn giao theo mẫu đầu ra' })];
      run.planSummary = `Việc giao riêng cho ${solo.name} (@${solo.id})`;
      run.decisions = '';
      run.stage = 'finalized';
      this.message(task, dept.id, 'system', 'system', `📌 Việc giao riêng cho ${solo.name} — bỏ qua lập kế hoạch và họp.${task.options.review && reviewer && reviewer.id !== solo.id ? ` ${reviewer.name} sẽ review.` : ''}`);
      this.save(task);
    }

    // 0b) Lệnh chuẩn bị + kiểm tra baseline chạy SONG SONG với lập kế hoạch/họp (các pha đó chỉ đọc repo) — trước đây chạy sau khi
    // chốt kế hoạch, nằm trên đường găng ~0,5–1 phút mỗi nhiệm vụ
    let early: Promise<unknown> | undefined;
    if (
      this.d.config.tools.earlyBaseline !== false &&
      !reached(run, 'finalized') &&
      this.projectCheckable(task, project) &&
      !task.projectChecks?.baseline &&
      !run.subtasks.some((s) => s.attempts > 0 || s.status === 'done')
    ) {
      early = this.runProjectChecks(task, project, dept.id, 'baseline').then(
        () => undefined,
        (e: unknown) => e ?? new Error('Lệnh kiểm tra baseline lỗi'),
      );
    }
    const settleEarly = async (): Promise<void> => {
      if (!early) return;
      const e = await early;
      early = undefined;
      if (e) throw e;
    };
    try {
      // 1) Lập kế hoạch
      let plan: ReturnType<typeof parsePlan> | undefined;
      if (!reached(run, 'planned')) {
        this.setPhase(task, run, 'plan');
        pctx.projectHistory = this.projectHistory(task, pctx);
        this.applyPlanDifficulty(task);
        const planRes = await this.call(lead, 'plan', (tools) => P.planPrompt(pctx, prior, tools), { ...base, hints: { brief: task.brief, roster: rosterHints, department: dept.name } });
        // lượt gọi lỗi → dừng (tiếp tục được) thay vì làm theo kế hoạch dự phòng đoán mò
        if (planRes.error) throw new Error(`Trưởng phòng không lập được kế hoạch: ${planRes.error}`);
        plan = parsePlan(planRes.text, roster, lead, task.brief);
        run.subtasks = plan.subtasks;
        if (task.lane === 'fast') this.shapeFastPlan(task, run, roster, lead, reviewer, pctx);
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
        // kế hoạch nhỏ → bỏ họp: ít hơn phases.meetingMinSubtasks hạng mục (mặc định 3) hoặc chưa tới 2 người tham gia
        const minSubtasks = Math.max(1, this.d.config.phases.meetingMinSubtasks ?? 3);
        const small = run.subtasks.length < minSubtasks || participantIds.length < 2;
        if (rounds > 0 && !small && task.lane !== 'fast') {
          this.setPhase(task, run, 'discuss');
          const participants = participantIds.map((id) => registry.agent(id));
          const meeting = [lead, ...participants];
          for (const a of meeting) this.hold(a.id, { status: 'discussing', activity: 'Đang họp phòng', taskId: task.id, phase: 'discuss' });
          try {
            // Họp song song trong một vòng (phases.parallelDiscuss, mặc định bật): mọi người cùng phát biểu dựa trên biên bản tới đầu vòng —
            // đo trên benchtest 1/11: 3 lượt phát biểu nối tiếp ~20–31 giây trên đường găng mỗi nhiệm vụ; vòng sau vẫn thấy ý kiến vòng trước
            const parallel = this.d.config.phases.parallelDiscuss !== false;
            const transcriptNow = () => P.transcriptText(this.d.store.transcript(task.id).filter((m) => m.department === dept.id && m.kind !== 'final'), names, 6000);
            for (let r = 1; r <= rounds; r++) {
              if (parallel) {
                this.checkAbort(task);
                const transcript = transcriptNow();
                const said = await Promise.all(
                  participants.map((a) =>
                    this.call(a, 'discuss', () => P.discussPrompt(pctx, a, run.planSummary ?? '', run.subtasks, transcript, r, rounds, true), { ...base, hints: { brief: task.brief } }).then((res) => ({ a, res })),
                  ),
                );
                for (const { a, res } of said) if (res.text && !res.error) this.message(task, dept.id, a.id, 'discussion', res.text.slice(0, 1500), { round: r });
                continue;
              }
              for (const a of participants) {
                this.checkAbort(task);
                const transcript = transcriptNow();
                const res = await this.call(a, 'discuss', () => P.discussPrompt(pctx, a, run.planSummary ?? '', run.subtasks, transcript, r, rounds), { ...base, hints: { brief: task.brief } });
                if (res.text && !res.error) this.message(task, dept.id, a.id, 'discussion', res.text.slice(0, 1500), { round: r });
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
        } else if (rounds > 0 && task.lane === 'fast') {
          run.decisions ??= '';
        } else if (rounds > 0) {
          this.message(task, dept.id, 'system', 'system', `Bỏ qua họp: kế hoạch nhỏ (${run.subtasks.length} hạng mục, ${participantIds.length} người) — vào thực thi luôn để tiết kiệm token.`);
          run.decisions ??= '';
        }
        run.stage = 'finalized';
        this.save(task);
        // giám đốc duyệt kế hoạch trước khi thực thi → đánh dấu chờ duyệt (dừng ở cổng trước pha thực thi, bên dưới);
        // ước tính vẫn tính để hiện trên màn duyệt, cảnh báo ngân sách chạy SAU khi duyệt
        if (task.options.planApproval && !solo) {
          this.checkEstimate(task, run, project, false);
          run.planReview = { at: nowIso(), roster: [] };
          this.save(task);
        } else {
          // kế hoạch quá lớn so với ngân sách → cảnh báo (chế độ "pause": dừng để quyết định tách/tăng ngân sách)
          this.checkEstimate(task, run, project);
        }
      }

      // B-10: cổng phủ kế hoạch (làn nhanh và đầy) — chặn kế hoạch bỏ sót đích hoặc đọc dở TRƯỚC khi thực thi
      if (!solo && !reached(run, 'executed') && !run.planReview?.approvedAt && (!run.planGate || run.planGate.rules.length)) await this.gatePlan(task, run, dept, roster, lead, reviewer, pctx, base, plan);

    } catch (e) {
      // lập kế hoạch/họp dừng (tạm dừng, hủy, lỗi): chờ lệnh chuẩn bị/baseline đang chạy kết thúc để không bỏ tiến trình mồ côi
      if (early) await early;
      throw e;
    }
    await settleEarly();

    // 2b) Cổng duyệt kế hoạch: kế hoạch đang chờ duyệt thì KHÔNG thực thi, dù tiếp tục bằng đường nào (hủy rồi tiếp tục,
    // giám đốc yêu cầu sửa phòng khác của nhiệm vụ liên phòng…) — chỉ updatePlan(approve) / Tiếp tục khi đang chờ duyệt mới mở cổng
    if (run.planReview && !run.planReview.approvedAt && !reached(run, 'executed')) this.awaitPlanApproval(task, run, dept, roster, project);
    if (run.planReview?.approvedAt && !run.planReview.estimateChecked) {
      run.planReview.estimateChecked = true;
      this.save(task);
      // kế hoạch đã duyệt (có thể đã sửa) quá lớn so với ngân sách → cảnh báo; chế độ "pause" dừng một lần để quyết định
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
      const canReview = !!(task.options.review && reviewer && reviewer.id !== solo?.id);
      // giám đốc yêu cầu sửa: chạy vòng sửa kể cả khi phòng không bật review / không có reviewer riêng
      const directorRedo = !!run.revising?.length && run.review?.by === 'director' && !run.review.approved;
      // B-02: cổng chất lượng chạy ở mọi làn — kể cả khi không có reviewer / review tắt / việc giao riêng
      if (done().length || directorRedo) {
        for (let attempt = Math.min(run.reviewRound ?? 0, task.options.maxRevisions); attempt <= task.options.maxRevisions; attempt++) {
          this.checkAbort(task);
          run.reviewRound = attempt;
          // tạm dừng giữa vòng sửa rồi tiếp tục: sửa tiếp các hạng mục còn lại theo review đã có, không review lại từ đầu
          const pending = run.revising?.length && run.review && !run.review.approved ? run.subtasks.filter((s) => run.revising!.includes(s.id) && s.status === 'done') : [];
          let review: ReturnType<typeof parseReview>;
          let targets: Subtask[];
          if (pending.length) {
            review = { approved: false, summary: run.review!.summary, issues: run.review!.issues, checks: [], parsed: true };
            targets = pending;
            this.message(task, dept.id, 'system', 'system', run.review!.by === 'director' ? `✋ Sửa theo yêu cầu của giám đốc: ${pending.map((s) => s.id).join(', ')}` : `↻ Tiếp tục vòng sửa ${attempt + 1}: ${pending.map((s) => s.id).join(', ')} (theo review đã có)`);
          } else {
          // lần sửa trước (có thể dở dang do tạm dừng) đã đổi workspace sau lần kiểm tra gần nhất → chạy lại lệnh kiểm tra trước review
          const pcs = task.projectChecks;
          if (this.projectCheckable(task, project) && pcs?.staleAt && (!pcs.latestAt || pcs.latestAt < pcs.staleAt)) await this.runProjectChecks(task, project, dept.id, 'revise');
          // B-02: cổng chất lượng chạy TRƯỚC reviewer — lệnh đỏ/hồi quy vào vòng sửa theo kiểm tra, sai mẫu vào lượt sửa định dạng
          const gate = await this.runQualityGate(task, run, project, reviewer ?? solo ?? lead, { dept: dept.id, pctx, base });
          const sysNow = task.projectChecks?.latest ?? [];
          const gateChecks = sysNow.map((r) => ({ command: r.command, exitCode: r.code ?? undefined, ok: r.ok, note: `CCoding tự chạy${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}` }));
          if (!canReview || !reviewer) {
            // không có reviewer: cổng vẫn quyết định — đỏ mà đề bài đòi xanh thì không bao giờ approved
            if (gate.forceUnapproved) {
              const summary = `Cổng chất lượng: ${gate.stillRed.map((c) => `\`${c}\``).join(', ')} đề bài yêu cầu xanh nhưng còn đỏ sau ${gate.fixRounds} vòng sửa theo kiểm tra — không có reviewer, không duyệt.`;
              run.review = { approved: false, summary, issues: [], checks: gateChecks, verified: true };
              this.d.logs.write({ level: 'warn', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'forced-unapproved', stillRed: gate.stillRed, fixRounds: gate.fixRounds, reviewer: false } });
              this.message(task, dept.id, 'system', 'system', `⛔ ${summary}`);
            } else if (run.review?.by === 'director' || directorRedo) {
              // đã sửa theo yêu cầu của giám đốc nhưng không có reviewer để duyệt lại → giám đốc xem rồi duyệt / yêu cầu sửa tiếp
              run.review = { approved: false, summary: 'Đã sửa theo yêu cầu của giám đốc — không có reviewer duyệt lại, chờ giám đốc xem', issues: [], by: 'director', checks: gateChecks, verified: gateChecks.length > 0 || undefined };
              this.message(task, dept.id, 'system', 'system', '✋ Đã sửa theo yêu cầu của giám đốc — phòng không có reviewer duyệt lại; giám đốc xem rồi bấm Duyệt hoặc Yêu cầu sửa tiếp.');
            } else if (gate.needReviewer && gateChecks.length) {
              // cần reviewer mà không có: ghi kiểm chứng theo cổng nhưng KHÔNG tự gắn approved (D-02); không có lệnh kiểm tra nào thì không có gì để ghi (như trước)
              const summary = `Cổng chất lượng: cần reviewer (${gate.reasons.join('; ')}) nhưng phòng không có/không bật — chờ giám đốc xem.`;
              run.review = { approved: false, summary, issues: [], checks: gateChecks, verified: gateChecks.length > 0 };
              this.d.logs.write({ level: 'warn', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'no-reviewer', reasons: gate.reasons, fixRounds: gate.fixRounds } });
              this.message(task, dept.id, 'system', 'system', `✋ ${summary}`);
            } else if (gateChecks.length) {
              const summary = `Cổng chất lượng: lệnh kiểm tra đều xanh${gate.fixRounds ? ` sau ${gate.fixRounds} vòng sửa` : ''}, mẫu đầu ra đạt, diff không chạm vùng bảo mật — không thuộc diện bắt buộc review.`;
              run.review = { approved: true, summary, issues: [], checks: gateChecks, verified: true };
              this.d.logs.write({ level: 'info', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'skip-reviewer', fixRounds: gate.fixRounds, reviewer: false } });
              this.message(task, dept.id, 'system', 'system', `✅ ${summary}`);
            }
            break;
          }
          if (gate.forceUnapproved) {
            // đỏ kéo dài mà đề bài yêu cầu xanh: không gọi reviewer, không bao giờ approved (nâng cấp là việc của luồng gọi)
            const summary = `Cổng chất lượng: ${gate.stillRed.map((c) => `\`${c}\``).join(', ')} đề bài yêu cầu xanh nhưng còn đỏ sau ${gate.fixRounds} vòng sửa theo kiểm tra — không gọi reviewer, không duyệt.`;
            run.review = { approved: false, summary, issues: [], checks: gateChecks, verified: true };
            this.d.logs.write({ level: 'warn', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'forced-unapproved', stillRed: gate.stillRed, fixRounds: gate.fixRounds } });
            this.message(task, dept.id, 'system', 'system', `⛔ ${summary}`);
            break;
          }
          if (!gate.needReviewer) {
            const summary = `Cổng chất lượng: lệnh kiểm tra đều xanh${gate.fixRounds ? ` sau ${gate.fixRounds} vòng sửa` : ''}, mẫu đầu ra đạt, diff không chạm vùng bảo mật — không thuộc diện bắt buộc review.`;
            run.review = { approved: true, summary, issues: [], checks: gateChecks, verified: true };
            this.d.logs.write({ level: 'info', kind: 'gate.review', msg: `${task.id}: ${summary}`, taskId: task.id, department: dept.id, data: { decision: 'skip-reviewer', fixRounds: gate.fixRounds } });
            this.message(task, dept.id, 'system', 'system', `✅ ${summary}`);
            break;
          }
          this.d.logs.write({ level: 'info', kind: 'gate.review', msg: `${task.id}: gọi reviewer — ${gate.reasons.join('; ')}`, taskId: task.id, department: dept.id, data: { decision: 'call-reviewer', reasons: gate.reasons } });
          this.setPhase(task, run, 'review');
          const items = done().map((st) => this.depInput(task, st));
          const changes = this.workspaceChanges(task);
          let reviewTools: ToolName[] = [];
          // review lỗi KHÔNG được coi là "duyệt"; chạm trần lượt mà chưa có kết luận → lấy kết luận (K2)
          const rv = await this.reviewWithVerdict(
            task,
            dept.id,
            run,
            reviewer,
            { ...pctx, reviewFocus: run.reviewFocus },
            items,
            (tools) => {
              reviewTools = tools;
              return P.reviewPrompt({ ...pctx, reviewFocus: run.reviewFocus }, items, tools, changes, this.projectCheckable(task, project));
            },
            { ...base, hints: { brief: task.brief, subtasks: items.map((i) => stHint(i.st)), attempt } },
          );
          const res = rv.res;
          review = rv.review;
          // kết luận GỐC của reviewer — KPI chấm độ đúng của reviewer theo trường này (approved có thể bị ép ngay dưới đây)
          const reviewerApproved = review.approved;
          const stray = assignStrayIssues(review.issues, done());
          if (stray) review.approved = false;
          // lệnh kiểm tra của dự án đạt trước khi sửa mà hỏng sau khi sửa → không duyệt, dù reviewer nói gì
          const regressed = [...new Set([...this.checkRegressions(task), ...gate.classes.filter((c) => c.cls === 'regression-or-new').map((c) => c.command)])];
          if (regressed.length) {
            if (review.approved) review.summary = `${review.summary} (CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt)`;
            review.approved = false;
            if (!review.issues.some((i) => i.severity !== 'minor')) {
              const target = [...done()].reverse().find((s) => this.isWriter(registry.agent(s.assignee), task, project)) ?? done().at(-1);
              if (target) review.issues.push({ subtask: target.id, severity: 'blocker', comment: `Lệnh ${regressed.map((c) => `\`${c}\``).join(', ')} đạt trước khi sửa nhưng lỗi sau khi sửa — sửa cho đạt lại (đầu ra ở mục "Lệnh kiểm tra của dự án").` });
            }
          }
          // B-19 bước 1: issue blocker/major, regressed, guard.block (chỉ khi selfImprove.enabled && collect; comment không vào sự kiện)
          if (this.d.config.selfImprove?.enabled && this.d.config.selfImprove.collect) {
            const si = { cfg: this.d.config.selfImprove, logs: this.d.logs, dataDir: this.d.config.dataDir, root: this.d.config.root };
            const serious = review.issues.filter((i) => i.severity === 'blocker' || i.severity === 'major');
            if (serious.length) {
              const untrusted = Object.fromEntries(serious.map((i) => [reviewIssueKey(i.subtask, i.comment), i.comment]));
              const ev = this.d.logs.write({ level: 'info', kind: 'review.incident', msg: `${task.id}: review nêu ${serious.length} lỗi blocker/major vòng ${attempt + 1}`, taskId: task.id, department: dept.id, agentId: reviewer.id, phase: 'review', data: { taskId: task.id, round: attempt + 1, issues: serious.map((i) => ({ subtask: i.subtask, severity: i.severity, key: reviewIssueKey(i.subtask, i.comment) })) } });
              selfImproveOnLog(ev, task, si, untrusted);
            }
            if (regressed.length) selfImproveOnLog(this.d.logs.write({ level: 'info', kind: 'checks.regressed', msg: `${task.id}: ${regressed.length} lệnh kiểm tra hỏng sau khi sửa`, taskId: task.id, department: dept.id, agentId: reviewer.id, phase: 'review', data: { taskId: task.id, round: attempt + 1, commands: regressed.length } }), task, si);
            selfImproveGuardBlocks(task, si);
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
          run.review = { approved: review.approved, summary: review.summary, issues: review.issues, checks, verified, reviewerApproved };
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
          targets = run.subtasks.filter((s) => s.status === 'done' && review.issues.some((i) => i.subtask === s.id && i.severity !== 'minor'));
          if (review.approved || !targets.length || attempt === task.options.maxRevisions) break;
          }
          run.revising = targets.map((s) => s.id);
          this.save(task);
          this.setPhase(task, run, 'revise');
          const reviseOne = async (st: Subtask) => {
              const agent = registry.agent(st.assignee);
              this.noteAttempt(task, run, st);
              // từ đây workspace có thể đổi (kể cả khi lượt sửa bị ngắt) → kết quả kiểm tra trước đó không còn đại diện
              if (task.projectChecks) task.projectChecks.staleAt = nowIso();
              const issues = review.issues.filter((i) => i.subtask === st.id).map((i) => `- [${i.severity}] ${i.comment}`).join('\n');
              const prev = this.depInput(task, st);
              const r = await this.call(agent, 'revise', (tools) => P.revisePrompt(pctx, st, prev.text, issues, tools, prev.wsPath), {
                ...base,
                subtask: st,
                activity: `Sửa ${st.id} theo review`,
                hints: { brief: task.brief, subtask: stHint(st) },
              });
              if (r.text && !r.error) {
                st.attempts++;
                this.writeOutput(task, run, st, agent, r);
                this.message(task, dept.id, agent.id, 'handoff', `Đã sửa ${st.id} theo review: ${extractSummary(r.text, 200)}`, { subtaskId: st.id });
                if (this.d.config.phases.incidentLog !== false) {
                  // B-03: nhật ký sự cố có cấu trúc → LogStore (che PII/bí mật ở đó); không có mục thì parsed=false, items=[] và không ném lỗi
                  const inc = parseIncidentLog(r.text);
                  const rounds = run.gateFixRoundsUsed ?? 0;
                  const incEntry = this.d.logs.write({ level: 'info', kind: 'revise.incident', msg: `${task.id} ${st.id}: nhật ký sự cố vòng ${attempt + 1} — ${inc.parsed ? `${inc.items.length} mục` : 'không có mục đọc được'}`, taskId: task.id, department: dept.id, agentId: agent.id, subtaskId: st.id, phase: 'revise', data: { taskId: task.id, subtaskId: st.id, round: attempt + 1, items: inc.items, b02: { blocked: rounds > 0, rounds }, parsed: inc.parsed } });
                  if (this.d.config.selfImprove?.enabled) selfImproveOnLog(incEntry, task, { cfg: this.d.config.selfImprove, logs: this.d.logs, dataDir: this.d.config.dataDir, root: this.d.config.root }); // B-19 bước 1
                }
              }
              run.revising = run.revising?.filter((id) => id !== st.id);
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
          run.revising = undefined;
          if (this.projectCheckable(task, project)) await this.runProjectChecks(task, project, dept.id, 'revise');
        }
      }
      run.revising = undefined;
      run.stage = 'reviewed';
      // review cuối chưa duyệt / lệnh kiểm tra còn hỏng → nhiệm vụ vẫn chạy xong nhưng gắn cờ "cần xem"
      if (run.review && !run.review.approved) task.attention = { reason: 'review', detail: `${dept.short}: ${run.review.summary.slice(0, 280)}`, at: nowIso() };
      else if (task.projectChecks?.latest?.some((r) => !r.ok)) task.attention = { reason: 'checks', detail: `Lệnh kiểm tra còn lỗi: ${task.projectChecks.latest.filter((r) => !r.ok).map((r) => r.command).join(', ')}`, at: nowIso() };
      // D-02: duyệt mà không có kiểm chứng máy (CCoding không có lệnh kiểm tra để chạy) và reviewer có quyền chạy lệnh nhưng không chạy → cần người xem
      else if (run.review?.approved && !run.review.by && run.review.verified === false) task.attention = { reason: 'review', detail: `${dept.short}: duyệt nhưng chưa có kiểm chứng chạy thật (không có lệnh kiểm tra của dự án, reviewer không chạy lệnh) — cần giám đốc xem.`, at: nowIso() };
      this.save(task);
    }

    // 5) Báo cáo tổng hợp (việc giao riêng: dùng luôn bàn giao của agent, không tốn thêm lượt gọi trưởng phòng)
    this.checkAbort(task);
    if (solo) {
      const st = run.subtasks[0];
      const body = st?.output ? (this.d.store.readRunFile(task.id, st.output) ?? '').replace(/^<!--[\s\S]*?-->\s*/, '') : '';
      const rv = run.review ? `\n\n## Review\n${run.review.approved ? '✅ Đã duyệt' : '⚠️ Chưa duyệt hoàn toàn'}: ${run.review.summary}${run.review.issues.length ? `\n${run.review.issues.map((i) => `- [${i.severity}] ${i.comment}`).join('\n')}` : ''}` : '';
      const finalText = `> Việc giao riêng cho ${solo.name} (@${solo.id})${st?.status === 'done' ? '' : ` — hạng mục ${st?.status ?? 'chưa chạy'}`}\n\n${body || '(chưa có bàn giao)'}${rv}\n`;
      const rel = `${safeName(dept.id)}-FINAL.md`;
      writeText(path.join(this.d.store.runDir(task.id), rel), finalText);
      run.finalPath = rel;
      run.status = run.subtasks.some((s) => s.status === 'failed') ? 'failed' : 'done';
      run.stage = 'done';
      run.finishedAt = nowIso();
      run.phase = undefined;
      this.save(task);
      return finalText;
    }
    this.setPhase(task, run, 'synthesize');
    const items = done().map((st) => this.depInput(task, st));
    const reviewText = run.review
      ? `${run.review.approved ? 'Đã duyệt' : 'Chưa duyệt hoàn toàn'}: ${run.review.summary}${run.review.verified === false ? '\n(Reviewer KHÔNG chạy lệnh kiểm tra nào — kết luận chưa có bằng chứng chạy thật; nêu rõ trong báo cáo.)' : run.review.checks?.length ? `\nLệnh kiểm tra reviewer đã chạy: ${run.review.checks.map((c) => `${c.command}${c.ok === false ? ' (lỗi)' : c.ok ? ' (đạt)' : ''}`).join('; ')}` : ''}`
      : '';
    const changes = this.workspaceChanges(task);
    let finalText: string;
    if (task.lane === 'fast' && this.d.config.fastLane.finalReport === 'template') {
      finalText = P.templateReport(task, dept, run, items, reviewText, changes);
    } else {
      const fin = await this.call(lead, 'synthesize', (tools) => P.synthesizePrompt(pctx, run.planSummary ?? '', run.decisions ?? '', items, reviewText, prior, changes, tools), {
        ...base,
        hints: { brief: task.brief, subtasks: run.subtasks.map(stHint), departmentName: dept.name },
      });
      if (fin.error || !fin.text) throw new Error(`Trưởng phòng không viết được báo cáo tổng hợp${fin.error ? `: ${fin.error}` : ''}`);
      finalText = fin.text;
    }
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
    /** Hạng mục đang chạy lệnh trong worktree CHÍNH của nhiệm vụ (tối đa 1). */
    const writing = new Set<string>();
    /** Hạng mục làm trong worktree con chưa gộp xong vào nhánh nhiệm vụ — hạng mục phụ thuộc phải chờ gộp. */
    const unmerged = new Set<string>();
    const par = !!pctx.parallelWriters;
    const writer = (st: Subtask) => !!pctx.serialWriters && this.isWriter(this.d.registry.agent(st.assignee), task, pctx.project);
    /**
     * Làm trong worktree con: hạng mục chạy lệnh VÀ hạng mục chỉ ghi tệp (tài liệu, ADR…). Chạy thật 1/11: hạng mục tài liệu làm thẳng trong
     * worktree chính bị CCoding commit dở ("phần đã làm trước khi gộp S3") mỗi lần gộp hạng mục khác, và sửa tệp trùng với lúc đang gộp.
     */
    const isolated = (st: Subtask) => par && (writer(st) || this.writesFiles(this.d.registry.agent(st.assignee), task, pctx.project));
    /** Cần độc quyền worktree chính: chế độ lần lượt, hoặc làm lại sau khi gộp worktree con bị xung đột. */
    const exclusive = (st: Subtask) => writer(st) && (!par || !!st.mainOnly);
    // worktree con còn sót từ lần chạy trước (CCoding khởi động lại khi đang gộp…) → commit + gộp trước khi lập lịch tiếp
    for (const st of run.subtasks.filter((s) => s.worktree)) {
      this.message(task, run.department, 'system', 'system', `♻️ ${st.id}: gộp phần việc còn trong worktree con \`${st.worktree!.path}\` từ lần chạy trước.`, { subtaskId: st.id });
      await this.withWtLock(task.id, () => this.closeSubWorktree(task, run, st));
    }
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
          if (st.dependsOn.some((d) => unmerged.has(d))) continue;
          if (exclusive(st) && (writing.size || ready.some(exclusive))) {
            if (!toldSerial && !par) {
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
          if (exclusive(st)) writing.add(st.id);
          const job =
            isolated(st)
              ? st.mainOnly
                ? this.runInMainWorktree(task, run, st, pctx, base, prior)
                : this.runInSubWorktree(task, run, st, pctx, base, prior, unmerged)
              : this.runSubtask(task, run, st, pctx, base, prior);
          const p = job
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
      // tạm dừng: chờ các hạng mục đang chạy làm xong để không mất công; hủy/lỗi khác: thoát ngay — trừ khi có worktree con:
      // chờ các hạng mục đang chạy dừng (lượt gọi bị hủy theo tín hiệu) để CCoding commit/gộp/gỡ worktree con, không để agent chạy mồ côi
      if (stop && !(stop instanceof PauseSignal) && !par) break;
      await Promise.race(inflight.values());
    }
    if (stop) throw stop;
  }

  private depInput(task: Task, st: Subtask): P.DepInput {
    const ws = st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined;
    return { st, text: this.readOutput(task, st), wsPath: ws };
  }

  /** `wt`: worktree con của hạng mục (chạy song song) — bản đồ repo, kế hoạch và thống kê thay đổi lấy từ đó thay vì worktree chính. */
  private async runSubtask(task: Task, run: DeptRun, st: Subtask, pctx: P.Ctx, base: CallCtx, prior?: string, wt?: { path: string; base?: string }): Promise<void> {
    const { registry } = this.d;
    const agent = registry.agent(st.assignee);
    st.startedAt = nowIso();
    if (pctx.project?.workspace && pctx.filesAccessible) this.writeRepoMap(task, wt?.path);
    if (pctx.filesAccessible && task.workspace) this.writePlanFile(task, run, wt?.path);
    const changes = () => (wt ? changesIn(wt.path, wt.base) : this.workspaceChanges(task));
    const deps = st.dependsOn
      .map((id) => run.subtasks.find((s) => s.id === id))
      .filter((s): s is Subtask => !!s && !!s.output)
      .map((s) => this.depInput(task, s));
    const draft = st.draft ? { text: (this.d.store.readRunFile(task.id, st.draft) ?? '').replace(/^<!--[\s\S]*?-->\s*/, ''), wsPath: `.ccoding/${safeName(task.id)}/${st.draft}` } : undefined;
    const maxCont = Math.max(0, this.d.config.phases?.maxContinuations ?? 2);
    // lần trước dừng giữa chừng (vd. nhiệm vụ lỗi rồi được tiếp tục): làm tiếp từ bàn giao dở dang + thay đổi đã có trong workspace
    let cont: P.Continuation | undefined =
      (st.incomplete || (st.continuations ?? 0) > 0) && !st.draft && st.output ? { n: 1, max: maxCont + 1, previous: this.readOutput(task, st), changes: changes(), resumed: true } : undefined;
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
          cont = { n: cont?.resumed ? n + 1 : n, max: cont?.resumed ? maxCont + 1 : maxCont, previous: res.text, changes: changes() };
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

  /** Mốc đã cảnh báo của chính sách ngân sách: `<id>|<đầu kỳ>|soft|hard` — mỗi kỳ cảnh báo một lần mỗi mức. */
  private policyAlerted = new Set<string>();

  /** Ngân sách theo dự án / agent: ngưỡng mềm → cảnh báo; trần cứng → tạm dừng nhiệm vụ trước khi gọi model. */
  private checkPolicies(task: Task, agent: AgentDef): void {
    const pols = this.d.budgets?.matching(task.projectId, agent.id);
    if (!pols?.length) return;
    const KY: Record<string, string> = { day: 'hôm nay', month: 'tháng này', total: 'từ trước tới nay' };
    for (const p of pols) {
      if (p.level === 'ok') continue;
      const who = p.scope === 'project' ? `dự án ${p.target}` : `agent @${p.target}`;
      const msg = `${who} đã dùng ${fmtNum(p.used)}/${fmtNum(p.tokens)} token ${KY[p.period]} (${Math.round(p.pct)}%)`;
      const key = `${p.id}|${p.since ?? '-'}|${p.level}`;
      if (!this.policyAlerted.has(key)) {
        this.policyAlerted.add(key);
        const stop = p.level === 'hard' && p.hard;
        this.alert({
          level: stop ? 'error' : 'warn',
          kind: p.level === 'hard' ? 'budget.policy.hard' : 'budget.policy.soft',
          title: p.level === 'hard' ? (stop ? `Chạm trần ngân sách ${who} — tạm dừng` : `Vượt ngân sách ${who}`) : `Ngân sách ${who} đã qua ${p.softPct}%`,
          msg: `${task.title}: ${msg}${p.level === 'hard' && !p.hard ? ' — chính sách chỉ cảnh báo, vẫn chạy tiếp' : ''}`,
          taskId: task.id,
        });
      }
      if (p.level === 'hard' && p.hard) throw new PauseSignal('budget', `Chạm trần ngân sách: ${msg}. Tăng ngân sách trong Kiểm toán › Hạn mức rồi tiếp tục.`);
    }
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
  private histCache = new Map<string, { at: number; map: Map<string, AgentHistory> }>();
  private readonly repoMaps = new Map<string, { rel: string; index?: string; large: string[] }>();
  private readonly repoMapLogged = new Set<string>();
  /** Token thực tế mỗi hạng mục theo agent (trung vị các hạng mục gần nhất) — làm mới mỗi 10 phút. */
  /** Lịch sử token/hạng mục theo agent, chỉ từ nhiệm vụ chạy CÙNG runtime với nhiệm vụ đang ước tính (vd. claude-cli). */
  private history(task?: Task): Map<string, AgentHistory> {
    const days = this.d.config.estimate.historyDays ?? 30;
    if (!days) return new Map();
    const runtime = task?.options.runtime ?? '';
    const hit = this.histCache.get(runtime);
    if (hit && Date.now() - hit.at <= 10 * 60_000) return hit.map;
    const map = subtaskHistory(this.d.store.list(), { days, runtime });
    this.histCache.set(runtime, { at: Date.now(), map });
    return map;
  }

  /** Cơ sở ước tính: agent nào dùng lịch sử thật (trung vị/hạng mục, số mẫu). */
  private estimateBasis(run: DeptRun, task?: Task): string {
    const min = this.d.config.estimate.minSamples ?? 2;
    const hist = this.history(task);
    const used = [...new Set(run.subtasks.filter((s) => s.status !== 'done').map((s) => s.assignee))]
      .map((a) => [a, hist.get(a)] as const)
      .filter((x): x is readonly [string, AgentHistory] => !!x[1] && x[1].samples >= min);
    return used.length ? `theo lịch sử: ${used.map(([a, h]) => `@${a} ~${fmtNum(h.median)}/hạng mục (${h.samples} mẫu)`).join(', ')}` : 'theo hằng số cấu hình (chưa đủ lịch sử)';
  }

  estimatePlan(task: Task, run: DeptRun, project?: ProjectDef): number {
    const e = this.d.config.estimate;
    const hist = this.history(task);
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

  /**
   * B-17 (planner.difficultyModel, mặc định tắt): chấm độ khó 1–3 từ LaneSignals đã có (không thêm lượt LLM) rồi chọn model cho pha plan.
   * Không ghi đè model do người dùng chọn (options.phaseModels.plan); model mặc định của làn nhanh thì được thay. Không có tín hiệu → mức 2.
   */
  private applyPlanDifficulty(task: Task): void {
    const pd = this.d.config.planner?.difficultyModel;
    if (!pd?.enabled) return;
    const sig = this.laneSigs.get(task.id);
    const d = scoreDifficulty(sig);
    const model = modelForDifficulty(d.level, pd.models);
    const cur = task.options.phaseModels?.plan;
    const fastDefault = task.lane === 'fast' ? this.d.config.fastLane.planModel : undefined;
    const applied = !!model && (!cur || cur === fastDefault);
    if (applied) task.options.phaseModels = { ...task.options.phaseModels, plan: model };
    this.d.logs.write({ level: 'info', kind: 'plan.difficulty', msg: `${task.id}: độ khó kế hoạch ${d.level} (${d.reason})${applied ? ` → model ${model}` : ''}`, taskId: task.id, projectId: task.projectId, data: { level: d.level, points: d.points, reason: d.reason, signals: sig ?? null, model: model ?? null, applied, previous: cur ?? null } });
  }

  /**
   * B-10 — cổng phủ kế hoạch: chạy sau parsePlan/họp chốt, trước execute (làn nhanh và đầy). Hàm thuần `planGate` không gọi LLM;
   * trượt A → một lượt "sửa kế hoạch", trượt B → lập lại một lần (cả hai đều qua this.call). Vẫn trượt → dừng với attention,
   * KHÔNG chạy tập con hạng mục.
   */
  private async gatePlan(task: Task, run: DeptRun, dept: DepartmentDef, roster: AgentDef[], lead: AgentDef, reviewer: AgentDef | undefined, pctx: P.Ctx, base: CallCtx, parsed?: { outOfScope?: Array<{ target: string; reason: string }>; truncated?: boolean }): Promise<void> {
    const { logs, registry } = this.d;
    const ls = pctx.cwd ? spawnSync('git', ['ls-files', '-z'], { cwd: pctx.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true }) : undefined;
    const repoFiles = ls?.status === 0 ? ls.stdout.split('\0').filter(Boolean) : undefined;
    const agentIds = [...registry.agents.keys()];
    const evaluate = (oos = parsed?.outOfScope) => planGate({ brief: task.brief, planSummary: run.planSummary ?? '', subtasks: run.subtasks, outOfScope: oos, truncated, repoFiles, agentIds });
    let truncated = !!parsed?.truncated;
    let g = evaluate();
    if (!run.planGate?.replanned) logs.write({ level: g.blocked ? 'warn' : 'info', kind: 'gate.decision', msg: `${task.id}: cổng phủ kế hoạch ${g.blocked ? 'chặn' : 'đạt'}`, taskId: task.id, department: dept.id, data: { gate: 'b10', verdict: g.blocked ? 'block' : 'pass' } });
    const record = (replanned: boolean) => {
      run.planGate = { uncovered: g.uncovered, reasons: g.reasons, rules: g.rules, ...(replanned ? { replanned: true } : {}) };
      this.save(task);
    };
    if (!g.blocked) {
      record(!!run.planGate?.replanned);
      return;
    }
    const first = g;
    // sửa kế hoạch tối đa một lần cho mỗi lượt chạy (resume sau khi đã dừng thì dừng luôn, không đốt thêm lượt plan)
    if (!run.planGate?.replanned) {
      logs.write({ level: 'warn', kind: 'plan.gate', msg: `${dept.short}: cổng phủ kế hoạch chặn (${g.rules.join('+')}) — ${g.reasons.join('; ')}`, taskId: task.id, department: dept.id, data: { stage: 'blocked', rules: g.rules, uncovered: g.uncovered, reasons: g.reasons, subtasks: run.subtasks.length } });
      this.message(task, dept.id, 'system', 'system', `🚧 Cổng phủ kế hoạch chặn trước khi thực thi (quy tắc ${g.rules.join('+')}):\n${g.reasons.map((r) => `- ${r}`).join('\n')}\nYêu cầu trưởng phòng sửa kế hoạch một lần; không chạy kế hoạch dở.`);
      this.setPhase(task, run, 'plan');
      const res = await this.call(lead, 'plan', (tools) => P.replanPrompt(pctx, task.brief, run.planSummary ?? '', run.subtasks, g, tools), {
        ...base,
        hints: { brief: task.brief, roster: roster.map((a) => ({ id: a.id, name: a.name, title: a.title, role: a.role, skills: a.skills })), department: dept.name, replan: true },
      });
      if (res.error) throw new Error(`Trưởng phòng không sửa được kế hoạch: ${res.error}`);
      const revised = parsePlan(res.text, roster, lead, task.brief);
      let again = g;
      if (revised.parsed) {
        run.subtasks = revised.subtasks;
        run.planSummary = revised.summary || run.planSummary;
        if (task.lane === 'fast') this.shapeFastPlan(task, run, roster, lead, reviewer, pctx);
        truncated = !!revised.truncated;
        again = evaluate(revised.outOfScope);
      } else truncated = !!revised.truncated;
      g = revised.parsed ? again : { ...g, blocked: true, reasons: [...g.reasons, 'B (iv) lượt sửa kế hoạch không trả JSON đọc được'], rules: g.rules.includes('B') ? g.rules : [...g.rules, 'B'] };
      record(true);
      logs.write({ level: g.blocked ? 'warn' : 'info', kind: 'plan.gate', msg: `${dept.short}: sau khi sửa kế hoạch — ${g.blocked ? `vẫn bị chặn (${g.rules.join('+')})` : 'đạt'}`, taskId: task.id, department: dept.id, data: { stage: 'replanned', blocked: g.blocked, rules: g.rules, uncovered: g.uncovered, reasons: g.reasons, before: first.rules } });
      if (!g.blocked) {
        this.message(task, dept.id, lead.id, 'plan', `Kế hoạch đã sửa (cổng phủ kế hoạch đạt):\n${P.planText(run.subtasks)}`);
        return;
      }
    }
    // vẫn trượt → dừng, không chạy tập con
    const reason = g.rules.includes('A') ? 'plan-coverage' : 'plan-unreadable';
    const detail = reason === 'plan-coverage' ? `Kế hoạch ${dept.short} bỏ sót đích: ${g.uncovered.join(', ')} — không ai nhận; chưa chạy hạng mục nào` : `Kế hoạch ${dept.short} đọc dở: ${g.reasons.filter((r) => r.startsWith('B')).join('; ')} — chưa chạy hạng mục nào`;
    task.attention = { reason, detail, at: nowIso() };
    run.planGate = { uncovered: g.uncovered, reasons: g.reasons, rules: g.rules, replanned: true };
    logs.write({ level: 'error', kind: 'plan.gate', msg: detail, taskId: task.id, department: dept.id, data: { stage: 'stopped', attention: reason, rules: g.rules, uncovered: g.uncovered, reasons: g.reasons } });
    this.save(task);
    throw new Error(`${detail}. Sửa kế hoạch hoặc đề bài rồi bấm "Tiếp tục".`);
  }

  /**
   * Kế hoạch đã chốt + tùy chọn duyệt kế hoạch → tạm dừng (lý do "plan") chờ giám đốc duyệt / sửa người làm, phụ thuộc, bỏ hạng mục.
   * Tiếp tục (duyệt) thì vào thực thi luôn vì mốc "finalized" đã đạt. planApprovalMinutes > 0 → tự duyệt khi hết thời gian chờ.
   */
  private awaitPlanApproval(task: Task, run: DeptRun, dept: DepartmentDef, roster: AgentDef[], project?: ProjectDef): void {
    const access = this.toolAccess(task, project);
    const caps = this.capabilities(roster, access, this.gitReadable(task, project));
    run.planReview = { ...run.planReview, at: run.planReview?.at ?? nowIso(), roster: roster.map((a) => ({ id: a.id, name: a.name, cap: caps[a.id] ?? '' })) };
    this.save(task);
    const mins = Math.max(0, Number(this.d.config.defaults.planApprovalMinutes) || 0);
    const est = run.estimate ? ` · ước tính ~${fmtNum(run.estimate.tokens)} token` : '';
    const msg = `Kế hoạch ${dept.short} (${run.subtasks.length} hạng mục${est}) chờ giám đốc duyệt — sửa người làm/phụ thuộc hoặc bỏ hạng mục rồi bấm "Duyệt & thực thi"${mins ? `; tự duyệt sau ${mins} phút` : ''}.`;
    throw new PauseSignal('plan', msg, mins ? Date.now() + mins * 60_000 : undefined, 'Kế hoạch chờ duyệt');
  }

  /**
   * Giám đốc sửa kế hoạch đang chờ duyệt (người làm, phụ thuộc, tiêu đề/mô tả, bỏ hạng mục) và/hoặc duyệt để thực thi.
   * Chỉ khi nhiệm vụ đang tạm dừng với lý do "plan"; người làm phải thuộc nhân sự của phòng (và dự án); phụ thuộc không tạo vòng.
   */
  updatePlan(
    id: string,
    o: { department?: string; subtasks?: Array<{ id: string; assignee?: string; dependsOn?: string[]; title?: string; description?: string; remove?: boolean }>; approve?: boolean; note?: string },
  ): Task {
    const { store, registry, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new Error('Không có nhiệm vụ');
    if (t.status !== 'paused' || t.pause?.reason !== 'plan') throw new Error('Nhiệm vụ không ở bước chờ duyệt kế hoạch');
    const run = t.runs.find((r) => r.planReview && !r.planReview.approvedAt && (!o.department || r.department === o.department));
    if (!run || !run.planReview) throw new Error(o.department ? `Kế hoạch phòng ${o.department} không ở bước chờ duyệt` : 'Không có kế hoạch nào đang chờ duyệt');
    const project = t.projectId ? store.project(t.projectId) : undefined;
    const allowed = new Set(registry.members(run.department, project?.agents).map((a) => a.id));
    const edits = (o.subtasks ?? []).slice(0, 100);
    const byId = new Map(run.subtasks.map((s) => [s.id, s]));
    const changes: string[] = [];
    for (const e of edits) {
      const st = byId.get(String(e.id));
      if (!st) throw new Error(`Không có hạng mục ${e.id}`);
      if (st.status === 'done') throw new Error(`${st.id} đã xong — không sửa được`);
      if (e.remove) continue;
      if (e.assignee !== undefined && e.assignee !== st.assignee) {
        if (!allowed.has(String(e.assignee))) throw new Error(`${e.assignee} không thuộc nhân sự phòng ${registry.department(run.department).short}${project?.agents?.length ? ' của dự án' : ''}`);
      }
      if (e.dependsOn !== undefined) {
        for (const d of e.dependsOn.map(String)) {
          if (d === st.id) throw new Error(`${st.id} không thể phụ thuộc chính nó`);
          if (!byId.has(d)) throw new Error(`${st.id}: phụ thuộc ${d} không tồn tại`);
        }
      }
    }
    const removed = new Set(edits.filter((e) => e.remove).map((e) => String(e.id)));
    if (removed.size >= run.subtasks.length) throw new Error('Phải giữ ít nhất một hạng mục (muốn bỏ hết thì hủy nhiệm vụ)');
    // áp thay đổi trên bản sao để kiểm vòng phụ thuộc trước khi ghi
    const next = run.subtasks
      .filter((s) => !removed.has(s.id))
      .map((s) => {
        const e = edits.find((x) => String(x.id) === s.id);
        const deps = (e?.dependsOn !== undefined ? e.dependsOn.map(String) : s.dependsOn).filter((d) => !removed.has(d));
        return { s, e, deps: [...new Set(deps)] };
      });
    const depMap = new Map(next.map((x) => [x.s.id, x.deps]));
    const seen = new Map<string, number>();
    const visit = (n: string, trail: string[]): void => {
      if (seen.get(n) === 2) return;
      if (seen.get(n) === 1) throw new Error(`Phụ thuộc vòng: ${[...trail, n].join(' → ')}`);
      seen.set(n, 1);
      for (const d of depMap.get(n) ?? []) visit(d, [...trail, n]);
      seen.set(n, 2);
    };
    for (const n of depMap.keys()) visit(n, []);
    for (const id of removed) changes.push(`bỏ ${id}`);
    for (const { s, e, deps } of next) {
      if (e?.assignee !== undefined && e.assignee !== s.assignee) {
        changes.push(`${s.id}: ${registry.agents.get(s.assignee)?.name ?? s.assignee} → ${registry.agents.get(e.assignee)?.name ?? e.assignee}`);
        s.assignee = String(e.assignee);
      }
      if (deps.join(',') !== s.dependsOn.join(',')) {
        changes.push(`${s.id}: phụ thuộc ${deps.length ? deps.join(', ') : '(không)'}`);
        s.dependsOn = deps;
      }
      if (e?.title !== undefined && e.title.trim() && e.title.trim() !== s.title) {
        s.title = redact(e.title.trim().slice(0, 200), { secrets: true, pii: false });
        changes.push(`${s.id}: đổi tiêu đề`);
      }
      if (e?.description !== undefined && e.description.trim() !== s.description) {
        s.description = redact(e.description.trim().slice(0, 4000), { secrets: true, pii: false });
        changes.push(`${s.id}: sửa mô tả`);
      }
    }
    run.subtasks = next.map((x) => x.s);
    const note = redact((o.note ?? '').trim().slice(0, 4000), { secrets: true, pii: false });
    if (changes.length) {
      run.planReview.edits = (run.planReview.edits ?? 0) + changes.length;
      this.writePlanFile(t, run);
      const e = this.estimatePlan(t, run, project);
      run.estimate = { tokens: e, budget: Math.max(0, t.options.budgetTokens - totalTokens(t.usage)), at: nowIso(), basis: this.estimateBasis(run, t) };
      this.message(t, run.department, 'director', 'decision', `📝 Giám đốc sửa kế hoạch: ${changes.join('; ')}\n${P.planText(run.subtasks)}`);
      logs.write({ level: 'info', kind: 'plan.edited', msg: `${t.id}: giám đốc sửa kế hoạch (${changes.length} thay đổi)`, taskId: t.id, department: run.department, data: { changes: changes.length, removed: [...removed] } });
    }
    if (!o.approve) {
      this.save(t, true);
      return t;
    }
    // kiểm điều kiện tiếp tục TRƯỚC khi đánh dấu đã duyệt (không để nhiệm vụ kẹt ở "chờ duyệt" mà kế hoạch đã duyệt)
    const mode = t.options.budgetMode ?? this.d.config.defaults.budgetMode;
    if (mode === 'pause' && totalTokens(t.usage) >= t.options.budgetTokens) {
      this.save(t, true);
      throw new Error(`Đã dùng ${fmtNum(totalTokens(t.usage))}/${fmtNum(t.options.budgetTokens)} token — tăng ngân sách hoặc chọn "Chạy tới khi hoàn thành" rồi duyệt`);
    }
    if (note) this.addNote(id, note);
    run.planReview.approvedAt = nowIso();
    run.planReview.by = 'director';
    this.message(t, run.department, 'director', 'decision', `✅ Giám đốc duyệt kế hoạch (${run.subtasks.length} hạng mục) — vào thực thi.`);
    logs.write({ level: 'info', kind: 'plan.approved', msg: `${t.id}: giám đốc duyệt kế hoạch ${run.department}`, taskId: t.id, department: run.department, data: { subtasks: run.subtasks.length, noteChars: note.length } });
    this.save(t, true);
    return this.resume(id, {});
  }

  /** Repo của dự án (nơi chạy git cho diff/đẩy nhánh) — undefined khi nhiệm vụ không làm trên repo. */
  repoDir(task: Task): string | undefined {
    const p = task.projectId ? this.d.store.project(task.projectId) : undefined;
    if (!p?.workspace) return undefined;
    return path.isAbsolute(p.workspace) ? p.workspace : path.join(this.d.config.root, p.workspace);
  }

  /** Việc nối tách từ nhánh của nhiệm vụ trước: commit của nhiệm vụ đó cũng nằm trong phần sẽ đẩy. */
  private shipContext(t: Task): ShipContext {
    if (!t.startFrom || !t.followUpOf) return {};
    const prev = this.d.store.get(t.followUpOf);
    if (!prev) return {};
    const reviewOk = !prev.attention && prev.status === 'done' && prev.runs.every((r) => !r.review || r.review.approved);
    return { inheritedFrom: { taskId: prev.id, head: t.baseRef, reviewOk } };
  }

  /** Trạng thái "sẵn sàng gộp" của nhiệm vụ (fetch = hỏi remote: nhánh xuất phát mới nhất, nhánh đã đẩy chưa). */
  async shipStatus(id: string, o: { fetch?: boolean } = {}): Promise<ShipStatus> {
    const t = this.d.store.get(id);
    if (!t) throw new ShipError(404, 'Không có nhiệm vụ');
    const repo = this.repoDir(t);
    if (!repo || !t.branch) throw new ShipError(404, 'Nhiệm vụ không làm trên nhánh git riêng');
    return shipStatus(t, repo, this.d.store.project(t.projectId!)?.baseRef, o, this.shipContext(t));
  }

  /** Giám đốc bấm đẩy nhánh / đẩy vào nhánh xuất phát (fast-forward). Ghi log + tin nhắn hội thoại; không --force. */
  async ship(id: string, action: 'push' | 'ff', o: { override?: boolean; allowSecrets?: boolean } = {}): Promise<{ task: Task; status: ShipStatus }> {
    const { store, logs } = this.d;
    const t = store.get(id);
    if (!t) throw new ShipError(404, 'Không có nhiệm vụ');
    if (t.status === 'running' || t.status === 'queued') throw new ShipError(409, 'Nhiệm vụ đang chạy — chờ xong rồi đẩy');
    const repo = this.repoDir(t);
    if (!repo || !t.branch) throw new ShipError(404, 'Nhiệm vụ không làm trên nhánh git riêng');
    if (this.shipping.has(t.id)) throw new ShipError(409, 'Đang đẩy — chờ lần trước xong');
    const baseRef = store.project(t.projectId!)?.baseRef;
    this.shipping.add(t.id);
    try {
      const r = await shipPush(t, repo, baseRef, action, o, this.shipContext(t));
      t.shipped = [...(t.shipped ?? []), { at: nowIso(), action, ref: r.ref, head: r.head }].slice(-20);
      const what = action === 'ff' ? `đẩy ${r.st.ahead} commit vào \`${r.st.remote}/${r.ref}\` (fast-forward)` : `đẩy nhánh \`${r.ref}\` lên \`${r.st.remote}\``;
      const extra = [o.override && r.st.warnings.length ? 'xác nhận vẫn đẩy dù còn cảnh báo' : '', o.allowSecrets && r.st.secrets.length ? `xác nhận ${r.st.secrets.length} dòng giống khóa là dữ liệu thử` : ''].filter(Boolean);
      this.message(t, 'office', 'director', 'decision', `🚀 Giám đốc ${what} — commit \`${r.head.slice(0, 10)}\`${extra.length ? ` (${extra.join('; ')})` : ''}.`);
      logs.write({ level: 'info', kind: 'ship.push', msg: `${t.id}: ${what} @ ${r.head.slice(0, 10)}`, taskId: t.id, projectId: t.projectId, data: { action, ref: r.ref, head: r.head, remote: r.st.remote, override: !!o.override, allowSecrets: !!o.allowSecrets, warnings: r.st.warnings, secrets: r.st.secrets } });
      this.save(t, true);
      // trạng thái sau khi đẩy có hỏi remote → nút "đẩy vào nhánh xuất phát" dùng được ngay (không phải bấm kiểm lại)
      return { task: t, status: await shipStatus(t, repo, baseRef, { fetch: true }, this.shipContext(t)) };
    } catch (e) {
      logs.write({ level: 'warn', kind: 'ship.push', msg: `${t.id}: không đẩy được (${action}): ${(e as Error).message.slice(0, 300)}`, taskId: t.id, projectId: t.projectId });
      throw e;
    } finally {
      this.shipping.delete(t.id);
    }
  }

  /** Kế hoạch vừa chốt: ước lượng ≫ phần ngân sách còn lại → nhắn + cảnh báo; chế độ "pause" thì dừng chờ quyết định. */
  private checkEstimate(task: Task, run: DeptRun, project?: ProjectDef, warn = true): void {
    const est = this.estimatePlan(task, run, project);
    const remaining = Math.max(0, task.options.budgetTokens - totalTokens(task.usage));
    const basis = this.estimateBasis(run, task);
    run.estimate = { tokens: est, budget: remaining, at: nowIso(), basis };
    this.save(task);
    if (!warn || est <= remaining * (this.d.config.estimate.warnRatio || 1)) return;
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

  /** Agent ghi được tệp ở pha thực thi (write_file/edit_file) với quyền hiện tại của nhiệm vụ. */
  private writesFiles(agent: AgentDef, task: Task, project?: ProjectDef): boolean {
    return toolsFor(agent.tools, this.toolAccess(task, project), 'execute', false).some((t) => t === 'write_file' || t === 'edit_file');
  }

  /** Workspace là repo git của dự án → vai trò không có quyền chạy lệnh vẫn được xem lịch sử git chỉ đọc (`git_read`). */
  private gitReadable(task: Task, project: ProjectDef | undefined, cwd?: string): boolean {
    if (this.d.config.tools.gitRead === false || !project?.workspace) return false;
    if (task.branch) return true;
    const dir = cwd ?? task.workspace;
    return !!dir && fs.existsSync(path.join(dir, '.git'));
  }

  /**
   * Hạng mục chạy lệnh làm SONG SONG: nhiệm vụ có worktree + nhánh riêng → mỗi hạng mục một worktree con tách từ nhánh nhiệm vụ,
   * xong thì CCoding commit và gộp vào nhánh nhiệm vụ (thay vì xếp hàng trong một worktree dùng chung).
   */
  private parallelWorktrees(task: Task, project?: ProjectDef): boolean {
    if (!this.exclusiveWrites(task, project)) return false;
    if ((project?.parallelWorktrees ?? this.d.config.tools.parallelWorktrees) === false) return false;
    return !!task.branch && !!task.workspace && fs.existsSync(task.workspace) && (project?.isolation ?? 'worktree') === 'worktree';
  }

  /** Khóa thao tác git trên worktree chính của nhiệm vụ (tách/gộp worktree con, hạng mục làm lại sau xung đột). */
  private readonly wtLocks = new Map<string, Promise<void>>();
  private async withWtLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.wtLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const chain = prev.then(() => mine);
    this.wtLocks.set(key, chain);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.wtLocks.get(key) === chain) this.wtLocks.delete(key);
    }
  }

  /** Hạng mục chạy lệnh trong worktree con riêng: tách → lệnh chuẩn bị → làm → commit + gộp vào nhánh nhiệm vụ. */
  private async runInSubWorktree(task: Task, run: DeptRun, st: Subtask, pctx: P.Ctx, base: CallCtx, prior: string | undefined, unmerged: Set<string>): Promise<void> {
    const project = pctx.project!;
    unmerged.add(st.id);
    try {
      // chờ khóa có thể lâu (hạng mục làm lại sau xung đột giữ khóa cả lượt) → kiểm tra hủy/tạm dừng trước khi tách và cài đặt
      const wt = await this.withWtLock(task.id, () => {
        this.checkStop(task);
        return this.openSubWorktree(task, run, st, project);
      });
      if (!wt) {
        // không tách được worktree con → làm trong worktree chính, độc quyền như chế độ lần lượt (sau xung đột: kèm bước tự gộp)
        if (st.mainOnly) await this.runInMainWorktree(task, run, st, pctx, base, prior);
        else await this.withWtLock(task.id, () => this.runSubtask(task, run, st, pctx, base, prior));
        return;
      }
      try {
        this.checkStop(task);
        // lượt giải quyết xung đột mà gộp lại đã sạch (nhánh nhiệm vụ đổi từ lần trước) và lần trước đã xong → không cần gọi agent
        if (wt.resolve && st.conflict?.done && !mergeInProgress(wt.path)) {
          st.status = 'done';
          st.error = undefined;
          st.finishedAt = nowIso();
          this.message(task, run.department, 'system', 'system', `🔀 ${st.id}: gộp lại nhánh \`${wt.resolve}\` vào nhánh nhiệm vụ mới nhất không còn xung đột — không cần làm lại.`, { subtaskId: st.id });
          return;
        }
        // lệnh chuẩn bị (cài dependency) chỉ cần cho người chạy được lệnh — hạng mục chỉ ghi tài liệu tách worktree ngay
        if (this.isWriter(this.d.registry.agent(st.assignee), task, project)) await this.runSubSetup(task, run, st, project, wt);
        const spctx: P.Ctx = { ...pctx, cwd: wt.path, branch: wt.branch, subWorktree: { taskBranch: task.branch } };
        // giải quyết xung đột cho hạng mục đã xong: giữ báo cáo bàn giao gốc, nối phần "gộp lại" vào sau (review vẫn thấy việc chính)
        const original = wt.resolve && st.conflict?.done && st.output ? this.readOutput(task, st) : '';
        await this.runSubtask(task, run, st, spctx, { ...base, cwd: wt.path }, prior, wt);
        if (original && st.status === 'done') this.appendOutput(task, st, original, 'Gộp lại sau xung đột');
      } finally {
        await this.withWtLock(task.id, () => this.closeSubWorktree(task, run, st));
      }
    } finally {
      unmerged.delete(st.id);
    }
  }

  /** Hạng mục làm lại trong worktree chính sau khi gộp bị xung đột (độc quyền: không tách/gộp worktree con nào trong lúc đó). */
  private async runInMainWorktree(task: Task, run: DeptRun, st: Subtask, pctx: P.Ctx, base: CallCtx, prior: string | undefined): Promise<void> {
    await this.withWtLock(task.id, async () => {
      try {
        await this.runSubtask(task, run, st, pctx, base, prior);
      } finally {
        this.settleMainMerge(task, run, st);
      }
    });
  }

  /**
   * Sau lượt làm lại trong worktree chính: merge còn dở mà hết xung đột → CCoding hoàn tất commit; còn dấu xung đột → hủy merge
   * (không để commit sau gom cả dấu xung đột). Nhánh cũ chưa được gộp → hạng mục KHÔNG coi là xong (hạng mục sau không chạy trên nền thiếu).
   */
  private settleMainMerge(task: Task, run: DeptRun, st: Subtask): void {
    const main = task.workspace;
    const c = st.conflict;
    if (!main) return;
    const { logs } = this.d;
    const fail = (error: string) => {
      if (st.status === 'done') {
        st.status = 'failed';
        st.finishedAt = nowIso();
      }
      st.error = error;
      if (c) st.handover = P.mergeConflictNote(c.branch, c.files, true, st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined);
      logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: ${error}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
      this.message(task, run.department, 'system', 'system', `⚠️ ${st.id}: ${error}`, { subtaskId: st.id });
    };
    try {
      if (mergeInProgress(main)) {
        const marked = unmergedFiles(main).filter((f) => hasConflictMarkers(path.join(main, f)));
        if (!marked.length) {
          const r = commitAll(main, `CCoding ${task.id}: hoàn tất gộp${c ? ` ${c.branch}` : ''} (${st.id})`.slice(0, 200));
          if (!r.ok) {
            git(main, ['merge', '--abort'], 60_000);
            fail(`không hoàn tất được merge (${r.out.slice(0, 160)}) — đã hủy merge`);
          }
        } else {
          git(main, ['merge', '--abort'], 60_000);
          fail(`còn dấu xung đột chưa giải quyết ở ${marked.slice(0, 8).join(', ')} — đã hủy merge`);
        }
      }
      if (c && st.status === 'done') {
        if (isMerged(main, c.branch)) {
          git(main, ['branch', '-D', c.branch], 30_000);
          st.conflict = undefined;
          st.mainOnly = undefined;
          this.message(task, run.department, 'system', 'system', `🔀 ${st.id}: đã gộp xong nhánh \`${c.branch}\` sau xung đột (đã xóa nhánh tạm).`, { subtaskId: st.id });
        } else {
          fail(`làm lại xong nhưng nhánh \`${c.branch}\` chưa được gộp vào nhánh nhiệm vụ — giữ nhánh; bấm Tiếp tục để làm lại bước \`git merge\``);
        }
      }
    } catch (e) {
      logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: lỗi khi kiểm tra merge: ${(e as Error).message}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
    }
    this.save(task);
  }

  /** Nhánh tạm của worktree con: `ccoding/<task>--<hạng mục>` (chỉ CCoding tạo/xóa nhánh dạng này). */
  private subBranch(task: Task, st: Subtask): string {
    return `ccoding/${task.id.toLowerCase()}--${st.id.toLowerCase()}`;
  }

  /**
   * Tách worktree con cho hạng mục từ HEAD nhánh nhiệm vụ (commit phần đã làm trước đó để hạng mục thấy). Worktree con có sẵn ở
   * đúng chỗ mà không được ghi nhận (CCoding dừng ngay sau khi tạo) → gộp phần đã có rồi tách mới; thư mục lạ → dời sang bên.
   */
  private openSubWorktree(task: Task, run: DeptRun, st: Subtask, project: ProjectDef): NonNullable<Subtask['worktree']> | undefined {
    const { config, logs } = this.d;
    const main = task.workspace!;
    const wtPath = path.join(config.workspacesDir, safeName(project.id), `wt-${safeName(task.id)}--${safeName(st.id)}`);
    const branch = this.subBranch(task, st);
    if (fs.existsSync(wtPath)) {
      if (isWorktreeOf(wtPath, main) && currentBranch(wtPath) === branch) {
        st.worktree = { path: wtPath, branch };
        this.closeSubWorktree(task, run, st);
        if (st.worktree || st.mainOnly) return undefined; // chưa gộp được / xung đột → làm trong worktree chính
      } else moveAside(main, wtPath);
    }
    // nhánh tạm còn sót: đã gộp → xóa; chưa gộp → đổi tên giữ lại để đối chiếu
    if (git(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000).ok) {
      if (isMerged(main, branch)) git(main, ['branch', '-D', branch], 30_000);
      else {
        const keep = `${branch}-cu-${Date.now()}`;
        git(main, ['branch', '-m', branch, keep], 30_000);
        logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `${st.id}: nhánh tạm ${branch} còn sót chưa gộp — đổi tên thành ${keep}`, taskId: task.id, projectId: project.id, subtaskId: st.id });
      }
    }
    const pre = commitAll(main, `CCoding ${task.id}: phần đã làm trước khi tách ${st.id}`.slice(0, 200));
    if (!pre.ok) logs.write({ level: 'warn', kind: 'workspace.commit', msg: `Không commit được worktree chính trước khi tách ${st.id}: ${pre.out.slice(0, 300)}`, taskId: task.id, projectId: project.id });
    const r = addWorktree(main, wtPath, branch, 'HEAD');
    if (!r.ok) {
      logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `Không tạo được worktree con cho ${st.id}: ${r.out.slice(0, 300)} — làm lần lượt trong worktree chính`, taskId: task.id, projectId: project.id, subtaskId: st.id });
      this.message(task, run.department, 'system', 'system', `🔒 ${st.id}: không tách được worktree con (${r.out.slice(0, 160)}) — làm lần lượt trong worktree chính.`, { subtaskId: st.id });
      return undefined;
    }
    copyUntracked(main, wtPath, project.worktreeCopy ?? config.tools.worktreeCopy);
    const cc = path.join(main, '.ccoding');
    if (fs.existsSync(cc)) fs.cpSync(cc, path.join(wtPath, '.ccoding'), { recursive: true, preserveTimestamps: true });
    st.worktree = { path: wtPath, branch, base: headCommit(wtPath) };
    // làm lại sau xung đột: CCoding gộp sẵn nhánh của lần trước vào worktree con mới (tách từ nhánh nhiệm vụ mới nhất) — agent chỉ sửa
    // dấu xung đột (kể cả vai trò không có quyền chạy lệnh), không giữ khóa worktree chính suốt lượt làm lại như trước
    const c = st.conflict;
    if (c && !st.mainOnly) {
      const m = mergeStart(wtPath, c.branch, `CCoding ${task.id}: gộp lại ${c.branch} (${st.id})`.slice(0, 200));
      if (!m.ok && !m.conflicts.length) {
        logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: không gộp sẵn được ${c.branch} vào worktree con (${m.out.slice(0, 200)}) — làm lại trong worktree chính`, taskId: task.id, projectId: project.id, department: run.department, subtaskId: st.id });
        removeWorktree(main, wtPath);
        if (git(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000).ok) git(main, ['branch', '-D', branch], 30_000);
        st.worktree = undefined;
        st.mainOnly = true;
        st.handover = `${P.mergeConflictNote(c.branch, c.files, !!c.done, st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined)}${c.handover ? `\n\n${c.handover}` : ''}`.slice(0, 12_000);
        this.save(task);
        return undefined;
      }
      st.worktree.resolve = c.branch;
      c.files = m.conflicts.length ? m.conflicts.slice(0, 30) : c.files;
      st.handover = m.conflicts.length
        ? `${P.mergeResolveNote(c.branch, m.conflicts, !!c.done, st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined)}${c.handover ? `\n\n${c.handover}` : ''}`.slice(0, 12_000)
        : c.handover;
      logs.write({ level: 'info', kind: 'workspace.merge', msg: `${st.id}: gộp sẵn ${c.branch} vào worktree con mới — ${m.conflicts.length ? `xung đột ở ${m.conflicts.join(', ')}` : 'không còn xung đột'}`, taskId: task.id, projectId: project.id, department: run.department, subtaskId: st.id });
      if (m.conflicts.length)
        this.message(task, run.department, 'system', 'system', `🧩 ${st.id} (@${st.assignee}) giải quyết xung đột trong worktree con mới \`${wtPath}\`: CCoding đã gộp sẵn nhánh \`${c.branch}\`, xung đột ở ${m.conflicts.slice(0, 8).map((f) => `\`${f}\``).join(', ')} — các hạng mục khác vẫn tách/gộp bình thường.`, { subtaskId: st.id });
    }
    this.save(task);
    logs.write({ level: 'info', kind: 'workspace.subworktree', msg: `${st.id}: worktree con ${wtPath} (nhánh ${branch} từ ${task.branch})`, taskId: task.id, projectId: project.id, subtaskId: st.id });
    this.message(task, run.department, 'system', 'system', `🌿 ${st.id} (@${st.assignee}) làm song song trong worktree con \`${wtPath}\` (nhánh \`${branch}\` tách từ \`${task.branch}\`) — xong thì CCoding gộp vào nhánh nhiệm vụ.`, { subtaskId: st.id });
    return st.worktree;
  }

  /** Lệnh chuẩn bị của dự án (vd. cài dependency) chạy một lần trong worktree con — mỗi worktree có node_modules… riêng. */
  private async runSubSetup(task: Task, run: DeptRun, st: Subtask, project: ProjectDef, wt: NonNullable<Subtask['worktree']>): Promise<void> {
    if (!project.setupCommands?.length || wt.setup) return;
    const { config } = this.d;
    const signal = this.controllers.get(task.id)?.signal;
    const opts = { denyCommands: [...config.tools.denyCommands, ...(project.denyCommands ?? [])], timeoutSec: config.tools.commandTimeoutSec, maxChars: config.tools.maxOutputChars, signal };
    const results: CheckResult[] = [];
    for (const cmd of project.setupCommands) {
      this.checkAbort(task);
      results.push(await runCheckCommand(cmd, wt.path, opts));
    }
    wt.setup = results.every((r) => r.ok);
    this.save(task);
    this.d.logs.write({ level: wt.setup ? 'info' : 'warn', kind: 'checks.setup', msg: `${st.id} worktree con: ${results.map((r) => `${r.command} → ${r.denied ? 'bị chặn' : r.timedOut ? 'timeout' : r.code} (${Math.round(r.ms / 1000)} s)`).join('; ')}`, taskId: task.id, projectId: project.id, department: run.department, subtaskId: st.id, data: { results: results.map((r) => ({ command: r.command, ok: r.ok, ms: r.ms })) } });
    if (!wt.setup) this.message(task, run.department, 'system', 'system', `🔧 Lệnh chuẩn bị trong worktree con của ${st.id} lỗi:\n${results.filter((r) => !r.ok).map((r) => `- \`${r.command}\` ✗ ${r.summary}`).join('\n')}`, { subtaskId: st.id });
  }

  /**
   * Kết thúc worktree con: chép sản phẩm trung gian về, commit, gộp `--no-ff` vào nhánh nhiệm vụ rồi gỡ worktree + nhánh tạm.
   * Xung đột → hủy gộp, giữ phần đã làm ở nhánh `…--<s>-xd<n>`; hạng mục làm lại trong worktree con MỚI tách từ nhánh nhiệm vụ mới nhất,
   * CCoding gộp sẵn nhánh đó vào để agent chỉ giải quyết xung đột (không giữ khóa worktree chính). Xung đột lặp quá `tools.resolveRounds`
   * (mặc định 2) lần → làm lại LẦN LƯỢT trong worktree chính (đường dự phòng cũ, agent tự `git merge`).
   */
  private closeSubWorktree(task: Task, run: DeptRun, st: Subtask): void {
    const wt = st.worktree;
    const main = task.workspace;
    if (!wt || !main) return;
    const { logs } = this.d;
    const exists = (b: string) => git(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], 15_000).ok;
    /** Không gộp được (không phải do xung đột): giữ worktree con + nhánh, hạng mục KHÔNG coi là xong; lần chạy sau CCoding gộp lại. */
    const hold = (why: string) => {
      if (st.status === 'done') {
        st.status = 'failed';
        st.finishedAt = nowIso();
        st.mergePending = true;
      }
      st.error = `${why} — giữ worktree con \`${wt.path}\`, bấm Tiếp tục để CCoding gộp lại`;
      logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: ${why}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
      this.message(task, run.department, 'system', 'system', `⚠️ ${st.id}: ${st.error}.`, { subtaskId: st.id });
      this.save(task);
    };
    /**
     * Lượt giải quyết xung đột chưa đạt (còn dấu xung đột, agent hủy merge…): bỏ worktree con của lượt này — phần việc gốc vẫn ở nhánh
     * xung đột; commit agent thêm ngoài phần đó (nếu có) giữ ở nhánh riêng để đối chiếu. Hạng mục KHÔNG coi là xong.
     */
    const unresolved = (why: string) => {
      if (mergeInProgress(wt.path)) git(wt.path, ['merge', '--abort'], 60_000);
      removeWorktree(main, wt.path);
      if (exists(wt.branch)) {
        const extra = git(main, ['rev-list', '--count', wt.branch, `^${wt.resolve}`, ...(wt.base ? [`^${wt.base}`] : [])], 30_000);
        if (extra.ok && Number(extra.out.trim()) > 0) {
          const keep = `${wt.branch}-lam-lai-${Date.now()}`;
          git(main, ['branch', '-m', wt.branch, keep], 30_000);
          logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `${st.id}: lượt giải quyết xung đột có commit riêng — giữ ở nhánh ${keep}`, taskId: task.id, projectId: task.projectId, subtaskId: st.id });
        } else git(main, ['branch', '-D', wt.branch], 30_000);
      }
      st.worktree = undefined;
      if (st.status === 'done') {
        st.status = 'failed';
        st.finishedAt = nowIso();
      }
      st.error = `${why} — giữ nhánh \`${wt.resolve}\`; bấm Tiếp tục để giải quyết lại trong worktree con mới`;
      logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: ${why}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
      this.message(task, run.department, 'system', 'system', `⚠️ ${st.id}: ${st.error}.`, { subtaskId: st.id });
      this.save(task);
    };
    try {
      // chỉ commit khi đúng là worktree con của repo này — worktree gỡ dở (mất .git) sẽ khiến git rơi về repo cha chứa workspaces/
      const valid = fs.existsSync(wt.path) && isWorktreeOf(wt.path, main);
      let head: string | undefined;
      if (valid) {
        // gộp còn dở (lượt giải quyết xung đột, hoặc agent tự merge): hết dấu xung đột → CCoding hoàn tất; còn dấu → hủy, KHÔNG commit dấu
        if (mergeInProgress(wt.path)) {
          const suspects = [...new Set([...unmergedFiles(wt.path), ...(wt.resolve ? (st.conflict?.files ?? []) : [])])];
          const marked = suspects.filter((f) => hasConflictMarkers(path.join(wt.path, f)));
          if (marked.length) {
            if (wt.resolve) return unresolved(`còn dấu xung đột chưa giải quyết ở ${marked.slice(0, 8).join(', ')}`);
            git(wt.path, ['merge', '--abort'], 60_000);
            logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: merge dở còn dấu xung đột trong worktree con — đã hủy merge`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
          } else {
            const r = completeMerge(wt.path, `CCoding ${task.id}: ${wt.resolve ? `gộp lại ${wt.resolve}` : 'hoàn tất merge'} (${st.id})`.slice(0, 200));
            if (!r.ok) {
              if (wt.resolve) return unresolved(`không hoàn tất được merge (${r.out.slice(0, 160)})`);
              git(wt.path, ['merge', '--abort'], 60_000);
            }
          }
        }
        if (wt.resolve) {
          // agent có thể đã tự commit kèm dấu xung đột, hoặc hủy merge rồi làm lại khác — phải còn đúng phần việc gốc và không còn dấu
          const marked = (st.conflict?.files ?? []).filter((f) => hasConflictMarkers(path.join(wt.path, f)));
          if (marked.length) return unresolved(`còn dấu xung đột ở ${marked.slice(0, 8).join(', ')}`);
          if (!isAncestor(wt.path, wt.resolve, 'HEAD')) return unresolved(`nhánh \`${wt.resolve}\` chưa được gộp (merge đã bị hủy?)`);
        }
        syncCcoding(wt.path, main, path.join('.ccoding', safeName(task.id)));
        const c = commitAll(wt.path, `CCoding ${task.id} ${st.id}: ${st.title}`.slice(0, 200));
        if (!c.ok) return hold(`không commit được worktree con (${c.out.slice(0, 160)})`);
        head = headCommit(wt.path);
      } else if (fs.existsSync(wt.path)) moveAside(main, wt.path);
      // gộp theo commit thực tế của worktree con (agent có đổi nhánh/tách HEAD thì vẫn không mất việc)
      const ref = head ?? wt.branch;
      const ahead = commitsAhead(main, ref);
      if (ahead) {
        commitAll(main, `CCoding ${task.id}: phần đã làm trước khi gộp ${st.id}`.slice(0, 200));
        const msg = `CCoding ${task.id}: gộp ${st.id} — ${st.title}`.slice(0, 200);
        let m = mergeBranch(main, ref, msg);
        // lỗi không do xung đột (khóa index, thay đổi chưa commit vừa phát sinh…) → commit lại rồi thử một lần nữa
        if (!m.ok && !m.conflicts.length) {
          commitAll(main, `CCoding ${task.id}: phần đã làm trước khi gộp ${st.id}`.slice(0, 200));
          m = mergeBranch(main, ref, msg);
        }
        if (!m.ok && !m.conflicts.length) return hold(`không gộp được vào nhánh nhiệm vụ (${m.out.slice(0, 160)})`);
        if (!m.ok) {
          if (valid) removeWorktree(main, wt.path);
          // phần đã làm giữ ở nhánh riêng theo vòng xung đột (tên nhánh tạm `…--<s>` dùng lại cho worktree con giải quyết xung đột)
          const prev = st.conflict;
          const round = (prev?.rounds ?? 0) + 1;
          const keep = `${this.subBranch(task, st)}-xd${round}`;
          git(main, ['branch', '-f', keep, head ?? wt.branch], 30_000);
          if (wt.branch !== keep && exists(wt.branch)) git(main, ['branch', '-D', wt.branch], 30_000);
          // nhánh xung đột của vòng trước đã nằm trong nhánh vừa giữ → xóa
          if (prev?.branch && prev.branch !== keep && exists(prev.branch) && isAncestor(main, prev.branch, keep)) git(main, ['branch', '-D', prev.branch], 30_000);
          st.worktree = undefined;
          const done = st.status === 'done' || !!st.mergePending;
          st.mergePending = undefined;
          const fallback = round > Math.max(0, this.d.config.tools.resolveRounds ?? MAX_RESOLVE_ROUNDS);
          // bàn giao dở dang (hạng mục chưa xong) đi kèm hướng dẫn giải quyết xung đột ở lần chạy sau
          // (vòng xung đột sau: lấy bàn giao dở dang đã cất ở vòng trước — st.handover lúc này là hướng dẫn gộp của vòng trước)
          const partial = prev ? prev.handover : done || st.handover?.startsWith('## ⚠️ Gộp') ? undefined : st.handover;
          st.conflict = { branch: keep, files: m.conflicts.slice(0, 30), rounds: round, done, handover: partial };
          st.mainOnly = fallback || undefined;
          st.handover = fallback
            ? `${P.mergeConflictNote(keep, m.conflicts, done, st.output ? `.ccoding/${safeName(task.id)}/${st.output}` : undefined)}${partial ? `\n\n${partial}` : ''}`.slice(0, 12_000)
            : undefined;
          const files = m.conflicts.length ? m.conflicts.slice(0, 8).map((f) => `\`${f}\``).join(', ') : m.out.slice(0, 200);
          logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: gộp ${wt.branch} vào ${task.branch} bị xung đột (lần ${round}): ${m.conflicts.join(', ') || m.out.slice(0, 300)}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
          const how = fallback
            ? `làm lại LẦN LƯỢT trong worktree chính (xung đột lần ${round}): @${st.assignee} tự \`git merge ${keep}\` rồi giải quyết xung đột`
            : `giải quyết trong worktree con MỚI tách từ nhánh nhiệm vụ mới nhất — CCoding gộp sẵn nhánh \`${keep}\`, @${st.assignee} chỉ sửa dấu xung đột; các hạng mục khác vẫn chạy/gộp bình thường`;
          if (done) {
            st.status = 'pending';
            this.message(task, run.department, 'system', 'system', `⚠️ ${st.id} xung đột khi gộp vào nhánh nhiệm vụ (${files}) — ${how}.`, { subtaskId: st.id });
          } else {
            this.message(task, run.department, 'system', 'system', `⚠️ ${st.id} chưa xong và phần đã làm xung đột khi gộp (${files}) — giữ nhánh \`${keep}\`; lần chạy sau ${fallback ? 'làm trong worktree chính' : 'giải quyết trong worktree con mới rồi làm tiếp'}.`, { subtaskId: st.id });
          }
          this.save(task);
          return;
        }
        this.message(task, run.department, 'system', 'system', `🔀 Đã gộp ${st.id} (${ahead} commit, nhánh \`${wt.branch}\`) vào \`${task.branch}\`.`, { subtaskId: st.id });
        logs.write({ level: 'info', kind: 'workspace.merge', msg: `${st.id}: gộp ${wt.branch} vào ${task.branch}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
      }
      if (valid && !removeWorktree(main, wt.path)) logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `${st.id}: chưa gỡ hết thư mục worktree con ${wt.path} (tệp đang bị khóa?)`, taskId: task.id, projectId: task.projectId, subtaskId: st.id });
      // chỉ xóa nhánh tạm của CCoding và chỉ khi mọi commit của nó đã nằm trong nhánh nhiệm vụ
      if (wt.branch === this.subBranch(task, st) && exists(wt.branch)) {
        if (isMerged(main, wt.branch)) git(main, ['branch', '-D', wt.branch], 30_000);
        else logs.write({ level: 'warn', kind: 'workspace.worktree', msg: `${st.id}: giữ nhánh ${wt.branch} vì còn commit chưa gộp`, taskId: task.id, projectId: task.projectId, subtaskId: st.id });
      }
      st.worktree = undefined;
      // lượt giải quyết xung đột đã gộp vào nhánh nhiệm vụ → xóa nhánh xung đột (đã nằm trong nhánh nhiệm vụ), dọn trạng thái
      const c = st.conflict;
      if (wt.resolve && c && isMerged(main, c.branch)) {
        if (exists(c.branch)) git(main, ['branch', '-D', c.branch], 30_000);
        st.conflict = undefined;
        st.mainOnly = undefined;
        st.handover = undefined;
        this.message(task, run.department, 'system', 'system', `🔀 ${st.id}: đã gộp xong nhánh \`${c.branch}\` sau xung đột (đã xóa nhánh tạm).`, { subtaskId: st.id });
      }
      if (st.mergePending) {
        // lần trước làm xong nhưng chưa gộp được — nay đã gộp: coi là xong, không làm lại
        st.mergePending = undefined;
        st.status = 'done';
        st.error = undefined;
      }
      this.save(task);
    } catch (e) {
      logs.write({ level: 'warn', kind: 'workspace.merge', msg: `${st.id}: lỗi khi gộp worktree con: ${(e as Error).message}`, taskId: task.id, projectId: task.projectId, department: run.department, subtaskId: st.id });
    }
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
        // việc nối: tách từ nhánh của nhiệm vụ trước; nhánh đó đã bị xóa → quay về nhánh xuất phát của dự án
        if (task.startFrom && !this.branchExists(project, task.startFrom)) {
          const why = `Nhánh \`${task.startFrom}\` của nhiệm vụ trước không còn — worktree tách từ nhánh xuất phát của dự án; thay đổi chưa gộp của nhiệm vụ trước KHÔNG có sẵn (đề bài nói "đã có sẵn" là không còn đúng).`;
          this.message(task, 'office', 'system', 'system', `🌿 ${why}`);
          // đề bài (viết lúc tạo) nói thay đổi đã có sẵn → thêm chỉ dẫn để agent không làm theo giả định cũ
          task.notes = [...(task.notes ?? []), { id: shortId('n'), at: nowIso(), text: why }].slice(-30);
          task.startFrom = undefined;
        }
        // K5: nhánh cục bộ của baseRef có thể cũ hơn origin → resolveBase fetch rồi chọn base mới nhất (nối từ startFrom thì giữ nguyên)
        let from = task.startFrom || project.baseRef || 'HEAD';
        let baseNote = '';
        let r: { ok: boolean; out: string };
        try {
          const rb = task.startFrom ? undefined : resolveBase(base, project.baseRef);
          if (rb) from = rb.ref;
          if (rb) baseNote = ` · base ${rb.ref} @ ${rb.commit ?? '?'} (nguồn: ${rb.source === 'remote' ? 'origin — nhánh cục bộ đi sau' : 'nhánh cục bộ'})`;
          if (rb?.warning) {
            baseNote += ` · CẢNH BÁO: ${rb.warning}`;
            logs.write({ level: 'warn', kind: 'workspace.base', msg: rb.warning, taskId: task.id, projectId: project.id });
          }
          r = addWorktree(base, wt, branch, from);
        } catch (e) {
          // K5: lệch hai chiều → dừng nhiệm vụ (lỗi lên prepareWorkspace → catch ngoài đặt status 'failed'), không làm việc trên base không rõ
          if (e instanceof BaseDivergedError) {
            logs.write({ level: 'error', kind: 'workspace.base', msg: e.message, taskId: task.id, projectId: project.id });
            task.workspace = undefined;
            throw e;
          }
          r = { ok: false, out: e instanceof Error ? e.message : String(e) };
        }
        if (r.ok) {
          const copied = copyUntracked(base, wt, project.worktreeCopy ?? config.tools.worktreeCopy);
          task.workspace = wt;
          task.branch = branch;
          task.baseRef = headCommit(wt);
          logs.write({ level: 'info', kind: 'workspace.worktree', msg: `Worktree ${wt} (nhánh ${branch} từ ${from})${baseNote}${copied.length ? ` · chép ${copied.join(', ')}` : ''}`, taskId: task.id, projectId: project.id });
          this.message(
            task,
            'office',
            'system',
            'system',
            `🌿 Làm việc trên git worktree riêng \`${wt}\` (nhánh \`${branch}\`${task.startFrom ? ` tách từ nhánh của nhiệm vụ trước \`${task.startFrom}\`` : project.baseRef ? ` tách từ \`${from}\`` : ''}${baseNote}) — nhánh chính của repo không bị đụng tới.`,
          );
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

  /**
   * P8 — các nhiệm vụ gần nhất của cùng dự án cho pha lập kế hoạch (tóm tắt, nhánh, kiểm tra sau cùng, việc còn mở);
   * bản chi tiết hơn ghi vào `.ccoding/<task>/inputs/PROJECT-HISTORY.md` khi agent đọc được tệp.
   */
  private projectHistory(task: Task, pctx: P.Ctx): P.Ctx['projectHistory'] {
    const limit = this.d.config.phases?.projectHistory ?? 3;
    // nhiệm vụ benchtest: mọi lượt phải cùng đầu vào — không thấy lịch sử dự án (kể cả lượt bench trước)
    if (!task.projectId || limit <= 0 || task.options.variant) return undefined;
    const items = selectHistory(this.d.store.list(), task, limit).map((t) => ({ task: t, final: t.finalPath ? this.d.store.readRunFile(t.id, t.finalPath) : undefined }));
    if (!items.length) return undefined;
    let rel: string | undefined;
    if (pctx.filesAccessible && task.workspace && pctx.ccDir) {
      try {
        const file = path.join(task.workspace, pctx.ccDir, 'inputs', 'PROJECT-HISTORY.md');
        ensureDir(path.dirname(file));
        writeText(file, `# Nhiệm vụ trước của dự án ${task.projectId}\n\n${historyText(items, 6000)}\n`);
        rel = `${pctx.ccDir}/inputs/PROJECT-HISTORY.md`;
      } catch {
        /* không ghi được thì chỉ dùng bản rút gọn trong prompt */
      }
    }
    this.d.logs.write({ level: 'info', kind: 'plan.history', msg: `Lập kế hoạch kèm ${items.length} nhiệm vụ trước của dự án ${task.projectId}: ${items.map((x) => x.task.id).join(', ')}`, taskId: task.id, projectId: task.projectId });
    return { text: historyText(items, 1200).slice(0, 4500), rel };
  }

  /** Kế hoạch đầy đủ `.ccoding/<task>/PLAN.md` — prompt thực thi chỉ gửi mỗi hạng mục một dòng (phần nền gửi lại ở mọi lượt công cụ). */
  private writePlanFile(task: Task, run: DeptRun, ws = task.workspace): void {
    try {
      const dir = path.join(ws!, '.ccoding', safeName(task.id));
      ensureDir(dir);
      writeText(path.join(dir, 'PLAN.md'), P.planFile(run.planSummary ?? '', run.decisions ?? '', run.subtasks));
    } catch {
      /* không ghi được thì agent vẫn có danh sách hạng mục trong prompt */
    }
  }

  /** Bản đồ repo `.ccoding/<task>/repo-map.md` (tệp, số dòng, route, model, hàm) — tạo lại trước mỗi hạng mục vì số dòng đổi sau khi sửa. */
  private writeRepoMap(task: Task, ws = task.workspace): void {
    if (!ws || this.d.config.tools.repoMap === false) return;
    try {
      const t0 = Date.now();
      const mode = task.options.repoMapMode ?? this.d.config.tools.repoMapMode ?? 'full';
      const dir = `.ccoding/${safeName(task.id)}`;
      const rel = `${dir}/repo-map.md`;
      const indexRel = `${dir}/repo-index.md`;
      const map = buildRepoMap(ws, { mode, indexRel });
      writeText(path.join(ws, rel), map.text);
      if (mode === 'compact') writeText(path.join(ws, indexRel), map.index);
      this.repoMaps.set(task.id, { rel, index: mode === 'compact' ? indexRel : undefined, large: map.large.slice(0, 12).map((f) => `${f.path} (${f.lines.toLocaleString('vi-VN')} dòng)`) });
      if (!this.repoMapLogged.has(task.id)) {
        this.repoMapLogged.add(task.id);
        this.d.logs.write({ level: 'info', kind: 'workspace.repomap', msg: `Bản đồ repo ${rel} (${mode === 'compact' ? 'gọn' : 'đầy đủ'}): ${map.files} tệp, ${map.large.length} tệp lớn, ${map.text.length} ký tự${mode === 'compact' ? ` + chỉ mục ${map.index.length} ký tự` : ''} (${Date.now() - t0} ms)`, taskId: task.id, data: { mode, chars: map.text.length, indexChars: mode === 'compact' ? map.index.length : 0 } });
      }
    } catch (e) {
      this.d.logs.write({ level: 'warn', kind: 'workspace.repomap', msg: `Không tạo được bản đồ repo: ${(e as Error).message}`, taskId: task.id });
    }
  }

  /** B-11(c): repo nhỏ (≤ SMALL_REPO_FILES tệp theo `git ls-files`, không tính `.ccoding/`) → danh sách tệp gọn; lớn/không phải repo git → undefined (giữ bản đồ repo). */
  private smallRepoFiles(cwd: string | undefined): string[] | undefined {
    if (!cwd) return undefined;
    const ls = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (ls.status !== 0 || typeof ls.stdout !== 'string') return undefined;
    const files = ls.stdout.split('\0').filter((f) => f && !f.startsWith('.ccoding/'));
    return files.length > 0 && files.length <= SMALL_REPO_FILES ? files : undefined;
  }

  /** Dự án có lệnh kiểm tra và nhiệm vụ được chạy lệnh trong workspace (quyền exec). */
  private projectCheckable(task: Task, project?: ProjectDef): project is ProjectDef {
    return !!project?.workspace && !!project.checkCommands?.length && this.toolAccess(task, project) === 'exec' && !!task.workspace && fs.existsSync(task.workspace);
  }

  /**
   * B-02 cổng chất lượng (backlog §4.1–§4.3). Không gọi reviewer. Chạy: phân loại lệnh kiểm → vòng sửa theo kiểm tra (≤ gate.maxFixRounds,
   * chung với lượt sửa định dạng) → kiểm "Mẫu đầu ra" → quyết định có cần reviewer. Mọi lượt LLM đi qua `this.call()`.
   * Dùng cho mọi làn: nhanh/đầy gọi trong vòng review; làn đơn (S4) gọi trực tiếp rồi nâng cấp khi `exhausted`.
   */
  async runQualityGate(task: Task, run: DeptRun, project: ProjectDef | undefined, agent: AgentDef, o: QualityGateOptions & { pctx: P.Ctx; base: CallCtx }): Promise<QualityGateResult> {
    const { config, registry, logs } = this.d;
    const max = Math.max(0, config.gate?.maxFixRounds ?? 2);
    const checkable = this.projectCheckable(task, project);
    const deptId = o.dept;
    const done = () => run.subtasks.filter((s) => s.status === 'done' && s.output);
    // gate.maxFixRounds là ngân sách cho CẢ NHIỆM VỤ (qua nhiều lần gọi cổng, nâng làn, tạm dừng/tiếp tục): đếm từ số vòng đã dùng
    let fixRounds = Math.max(0, run.gateFixRoundsUsed ?? 0);
    let classes: ClassifiedCheck[] = [];
    const classify = () => {
      const pc = task.projectChecks;
      classes = checkable ? classifyChecks(pc?.baseline, pc?.latest, task.brief, project!.checkCommands) : [];
      if (checkable) logs.write({ level: classes.every((c) => c.cls === 'green') ? 'info' : 'warn', kind: 'gate.classify', msg: `${task.id}: ${classes.map((c) => `${c.command} → ${c.cls}`).join('; ')}`, taskId: task.id, department: deptId, data: { classes, fixRounds } });
    };
    const isRed = (c: ClassifiedCheck) => c.cls === 'regression-or-new' || c.cls === 'red-required';
    const pickTarget = () => {
      const all = done();
      return (o.target ? all.find((s) => s.id === o.target) : undefined) ?? [...all].reverse().find((s) => this.isWriter(registry.agent(s.assignee), task, project)) ?? all.at(-1);
    };

    // 1) vòng sửa theo kiểm tra
    classify();
    const initialRed = classes.some(isRed);
    while (classes.some(isRed) && fixRounds < max) {
      const st = pickTarget();
      if (!st) break;
      this.checkAbort(task);
      fixRounds++;
      run.gateFixRoundsUsed = fixRounds;
      this.save(task); // lưu TRƯỚC khi gọi LLM: tạm dừng/tiếp tục không cấp lại ngân sách
      const red = classes.filter(isRed);
      const results = (task.projectChecks?.latest ?? []).filter((r) => red.some((c) => c.command === r.command));
      const fixer = st.assignee ? registry.agent(st.assignee) : agent;
      this.setPhase(task, run, 'revise');
      this.message(task, deptId, 'system', 'system', `🔁 Cổng chất lượng — vòng sửa ${fixRounds}/${max}: ${red.map((c) => `\`${c.command}\` (${c.cls === 'red-required' ? 'đề bài yêu cầu xanh' : 'hồi quy/đỏ mới'})`).join(', ')} — không gọi reviewer.`);
      logs.write({ level: 'warn', kind: 'gate.fix', msg: `${task.id}: vòng sửa ${fixRounds}/${max} ${st.id} — ${red.map((c) => c.command).join(', ')}`, taskId: task.id, agentId: fixer.id, department: deptId, subtaskId: st.id, data: { round: fixRounds, max, commands: red } });
      this.noteAttempt(task, run, st);
      if (task.projectChecks) task.projectChecks.staleAt = nowIso();
      const prev = this.depInput(task, st);
      const uncovered = (run as { planGate?: { uncovered?: string[] } }).planGate?.uncovered ?? [];
      const r = await this.call(
        fixer,
        'revise',
        (tools) =>
          P.gateFixPrompt(
            o.pctx,
            st,
            prev.text,
            results.map((x) => ({ command: x.command, code: x.code, tail: x.tail || x.summary, required: classes.find((c) => c.command === x.command)?.cls === 'red-required' })),
            uncovered,
            tools,
            fixRounds,
            config.tools.maxOutputChars,
          ),
        { ...o.base, subtask: st, activity: `Sửa ${st.id} theo kiểm tra (${fixRounds}/${max})`, hints: { brief: task.brief, subtask: stHint(st), gateFix: fixRounds } },
      );
      if (r.text && !r.error) {
        st.attempts++;
        this.writeOutput(task, run, st, fixer, r);
        this.message(task, deptId, fixer.id, 'handoff', `Đã sửa ${st.id} theo kiểm tra: ${extractSummary(r.text, 200)}`, { subtaskId: st.id });
      }
      if (checkable) await this.runProjectChecks(task, project!, deptId, 'revise');
      classify();
    }

    // 2) kiểm "Mẫu đầu ra" (cùng phép kiểm với KPI); lượt sửa định dạng tính vào N
    let templateOk = true;
    if (!o.skipTemplate) {
      for (const st of done()) {
        const owner = registry.agent(st.assignee);
        let g = templateGate(this.readOutput(task, st), owner.body);
        logs.write({ level: g.ok ? 'info' : 'warn', kind: 'gate.template', msg: `${task.id} ${st.id}: coverage ${Math.round(g.coverage * 100)}%${g.missing.length ? `, thiếu: ${g.missing.join('; ')}` : ''}${g.summaryOk ? '' : ', thiếu "Tóm tắt"'}`, taskId: task.id, agentId: owner.id, department: deptId, subtaskId: st.id, data: { ok: g.ok, coverage: g.coverage, missing: g.missing, summaryOk: g.summaryOk, fixRounds } });
        if (g.ok) continue;
        if (fixRounds < max) {
          this.checkAbort(task);
          fixRounds++;
          run.gateFixRoundsUsed = fixRounds;
          this.save(task);
          const headings = templateHeadings(owner.body);
          const prev = this.readOutput(task, st);
          const miss = g;
          const r = await this.call(owner, 'revise', () => P.formatFixPrompt(o.pctx, prev, headings, miss.missing, miss.summaryOk), {
            ...o.base,
            subtask: st,
            noTools: true,
            activity: `Sửa định dạng ${st.id} (${fixRounds}/${max})`,
            hints: { brief: task.brief, subtask: stHint(st), formatFix: fixRounds },
          });
          if (r.text && !r.error) {
            // chỉ thay bản cũ khi bản viết lại ĐẠT mẫu — tránh mất nội dung (vd. mục CCoding thêm vào sau xung đột) khi model viết lại kém
            const fixed = templateGate(r.text, owner.body);
            if (fixed.ok) {
              this.writeOutput(task, run, st, owner, r);
              g = fixed;
            }
            logs.write({ level: fixed.ok ? 'info' : 'warn', kind: 'gate.template', msg: `${task.id} ${st.id}: sau sửa định dạng coverage ${Math.round(fixed.coverage * 100)}%${fixed.ok ? '' : ' — giữ bản cũ'}`, taskId: task.id, agentId: owner.id, department: deptId, subtaskId: st.id, data: { ok: fixed.ok, coverage: fixed.coverage, missing: fixed.missing, afterFix: true, fixRounds } });
          }
        }
        if (!g.ok) templateOk = false;
      }
    }

    // 3) kết luận: có phải gọi reviewer không
    const stillRed = classes.filter((c) => c.cls === 'red-required').map((c) => c.command);
    const exhausted = classes.some(isRed) || !templateOk;
    const reasons = reviewerReasons({
      hasCheckCommands: checkable,
      changedFiles: changedFiles(task.workspace, task.baseRef),
      classification: task.classification,
      classes: classes.map((c) => c.cls),
      failedAfterRounds: exhausted,
    });
    logs.write({ level: initialRed ? 'warn' : 'info', kind: 'gate.decision', msg: `${task.id}: cổng B-02 ${initialRed ? 'chặn' : 'đạt'} (${fixRounds} vòng sửa)`, taskId: task.id, department: deptId, data: { gate: 'b02', verdict: initialRed ? 'block' : 'pass', rounds: fixRounds, checks: { red: classes.filter(isRed).length, total: classes.length } } });
    return { forceUnapproved: stillRed.length > 0, stillRed, classes, fixRounds, templateOk, needReviewer: reasons.length > 0, reasons, exhausted };
  }

  /** CCoding tự chạy lệnh chuẩn bị (một lần mỗi worktree) rồi lệnh kiểm tra của dự án — bằng chứng không phụ thuộc agent/model. */
  private async runProjectChecks(task: Task, project: ProjectDef, dept: string, when: 'baseline' | 'execute' | 'revise'): Promise<CheckResult[]> {
    const { config, logs } = this.d;
    const signal = this.controllers.get(task.id)?.signal;
    const opts = { denyCommands: [...config.tools.denyCommands, ...(project.denyCommands ?? [])], timeoutSec: config.tools.commandTimeoutSec, maxChars: config.tools.maxOutputChars, signal };
    const pc = (task.projectChecks ??= {});
    const cwd = task.workspace!;
    const mark = (r: CheckResult) => (r.ok ? '✓' : r.denied ? '⛔' : '✗');
    // chạy song song bằng worktree con: phụ thuộc mới (package.json/lockfile…) được cài trong worktree con rồi GỘP vào đây —
    // node_modules… của worktree nhiệm vụ vẫn là bản cài lúc đầu → chạy lại lệnh chuẩn bị trước khi kiểm tra, nếu không test báo
    // "Cannot find module" giả và review không duyệt
    if (pc.setupDone && pc.setupManifests && when !== 'baseline' && project.setupCommands?.length) {
      const now = manifestFingerprint(cwd);
      const changed = now ? manifestDiff(pc.setupManifests, now) : [];
      if (changed.length) {
        pc.setupDone = false;
        this.message(task, dept, 'system', 'system', `🔧 Tệp khai báo phụ thuộc đã đổi sau lần chuẩn bị (${changed.slice(0, 6).map((f) => `\`${f}\``).join(', ')}) — chạy lại lệnh chuẩn bị trước khi kiểm tra.`);
      }
    }
    let setupMs = 0;
    if (!pc.setupDone && project.setupCommands?.length) {
      pc.setup = [];
      for (const cmd of project.setupCommands) {
        this.checkAbort(task);
        pc.setup.push(await runCheckCommand(cmd, cwd, opts));
      }
      pc.setupDone = pc.setup.every((r) => r.ok);
      setupMs = pc.setup.reduce((n, r) => n + (r.ms || 0), 0);
      // sau lệnh chuẩn bị (npm install có thể sửa lockfile) — mốc so sánh cho lần kiểm tra sau
      pc.setupManifests = manifestFingerprint(cwd);
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
      // theo phòng (các phòng chạy lần lượt trên cùng workspace): trạng thái trước khi phòng này sửa = kết quả gần nhất của phòng
      // trước, hoặc baseline — KPI gán kết quả lệnh kiểm tra cho đúng phòng đã làm thay đổi. Bỏ `tail` cho task.json gọn.
      const slim = (rs?: CheckResult[]) => rs?.map((r) => ({ ...r, tail: '' }));
      const d = ((pc.depts ??= {})[dept] ??= {});
      d.before ??= slim(pc.latest ?? pc.baseline) ?? [];
      d.latest = slim(results);
      d.at = nowIso();
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
      data: { when, setupMs: setupMs || undefined, results: results.map((r) => ({ command: r.command, code: r.code, ok: r.ok, ms: r.ms, summary: r.summary, denied: r.denied })) },
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
    // chạy song song: mọi thay đổi đã vào nhánh qua commit + gộp của worktree con → lần commit cuối "không có thay đổi" nhưng nhánh vẫn có việc
    if (r.ok && r.out === 'không có thay đổi' && task.baseRef) {
      const head = headCommit(task.workspace);
      const n = git(task.workspace, ['rev-list', '--count', `${task.baseRef}..HEAD`], 15_000);
      const count = n.ok ? Number(n.out.trim()) || 0 : 0;
      if (head && count) task.commit = `${head.slice(0, 10)} — ${count} commit trên nhánh từ ${task.baseRef.slice(0, 10)} (gồm gộp worktree con)`;
    }
    this.d.logs.write({ level: r.ok ? 'info' : 'warn', kind: 'workspace.commit', msg: `${task.branch}: ${task.commit}`, taskId: task.id, projectId: task.projectId });
    // nhánh tạm của worktree con còn sót (xung đột chưa gộp, không gộp được…) → báo để người dùng đối chiếu
    const left = git(task.workspace, ['branch', '--list', `ccoding/${task.id.toLowerCase()}--*`, '--format=%(refname:short)'], 15_000);
    const branches = left.ok ? left.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    if (branches.length) this.message(task, 'office', 'system', 'system', `🌿 Còn nhánh tạm của worktree con chưa gộp vào \`${task.branch}\`: ${branches.map((b) => `\`${b}\``).join(', ')} — xem bằng \`git log ${task.branch}..<nhánh>\`.`);
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
      this.checkPolicies(task, agent);
      if (ctx.subtask && ctx.run) this.checkSubtaskBudget(task, ctx.run, ctx.subtask);
      const cls = task.classification;
      const want = task.options.phaseModels?.[phase] ?? ctx.project?.models?.[agent.id] ?? config.phases?.models?.[phase] ?? agent.model;
      const prefs = [task.options.runtime, ctx.project?.runtime, agent.runtime, config.runtime.default];
      const { list, notes, skipped, deferred } = await runtimes.candidates(prefs, cls, want);
      if (notes.length) logs.write({ level: 'warn', kind: 'runtime.fallback', msg: `${notes.join('; ')}${list[0] ? ` → dùng ${list[0].label}` : ''}`, taskId: task.id, agentId: agent.id, department: deptId });
      if (deferred?.length) logs.write({ level: 'info', kind: 'runtime.deferred', msg: `Xếp sau (vừa bị giới hạn tốc độ): ${deferred.join(', ')} → dùng ${list[0]?.label ?? '?'}`, taskId: task.id, agentId: agent.id, department: deptId });
      if (list.length && task.noRuntimeStreak) task.noRuntimeStreak = undefined;
      if (!list.length) {
        const at = runtimes.earliestRecovery();
        throw new PauseSignal('quota', `${NO_RUNTIME_PREFIX}${skipped.length ? `: ${skipped.join('; ')}` : ' (chưa cấu hình hoặc không kết nối được)'}`, at ?? Date.now() + 5 * 60_000);
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
          // chờ tối đa waitForFastMs TÍNH TỪ lần lỗi đầu của chuỗi: 429 lặp mãi (vd. hết hạn mức 5 giờ của gói Claude Max mà không báo
          // giờ mở lại) thì sau đó dùng model chậm thay vì tạm dừng/tiếp tục vô hạn
          if (fr && fr.until - Date.now() <= waitMs && (!fr.since || Date.now() - fr.since < waitMs)) {
            keepHandover();
            const at = new Date(fr.until).toLocaleTimeString('vi-VN');
            logs.write({ level: 'info', kind: 'runtime.wait', msg: `${agent.name}: chờ ${fr.label} (${fr.reason ?? 'tạm nghỉ'}) mở lại lúc ${at} thay vì chạy ${phase} bằng ${cand.label}`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId, until: new Date(fr.until).toISOString(), slow: cand.label, fast: fr.label } });
            throw new PauseSignal('quota', `Chờ model nhanh ${fr.label} (${fr.reason ?? 'tạm nghỉ'}) mở lại lúc ${at} thay vì chạy bước ${WAIT_PHASE_LABEL[phase] ?? ACTIVITY_BY_PHASE[phase].toLowerCase()}${ctx.subtask ? ` ${ctx.subtask.id}` : ''} bằng model chậm ${cand.label}`, fr.until + 15_000, 'Chờ model nhanh — đã tạm dừng');
          }
        }
        // tra cứu web chỉ với dữ liệu Công khai/Nội bộ (truy vấn đi ra máy tìm kiếm bên ngoài)
        const web = config.tools.web !== false && (cls === 'public' || cls === 'internal');
        const gitRead = this.gitReadable(task, ctx.project, ctx.cwd);
        const allow = rt.supportsTools && rt.id !== 'mock' && !ctx.noTools ? toolsFor(agent.tools, access, phase, web, gitRead) : [];
        const built = build(allow);
        if (handover && allow.length) built.prompt = `${built.prompt}\n\n${handover}`;
        const fb = this.d.store.activeFeedback(agent.id).map((f) => `${f.rating === 'up' ? '👍 ' : f.rating === 'down' ? '👎 ' : ''}${f.text}`);
        const system = P.systemFor(agent, ctx.dept, cls, phase, fb);
        const piiOut = cls === 'confidential' || cls === 'restricted';
        const outbound = (s: string) => (rt.local ? s : redact(s, { secrets: config.dataProtection.redactSecrets, pii: piiOut }));
        // B-14b: stablePrefix (claude-cli) — pha không sửa tệp chạy ở thư mục gốc nhiệm vụ để cwd (nằm trong tiền tố) không đổi giữa các hạng mục
        const reqCwd = rt.id === 'claude-cli' && config.runtimes['claude-cli']?.stablePrefix === true && phase !== 'execute' && phase !== 'revise' ? task.workspace ?? this.workspaceFor(task, ctx.project) : ctx.cwd;
        ensureDir(reqCwd);
        req = {
          agent,
          phase,
          system: outbound(system),
          context: built.context ? outbound(built.context) : undefined,
          prompt: outbound(built.prompt),
          model: cand.model,
          cwd: reqCwd,
          tools: ctx.noTools ? [] : cliTools(agent.tools, access, phase, gitRead),
          allowTools: allow.length > 0 || (rt.supportsTools && !ctx.noTools && cliTools(agent.tools, access, phase, gitRead).length > 0),
          timeoutMs: config.defaults.timeoutMs,
          maxTokens: ctx.maxTokens ?? config.phases?.maxTokens?.[phase],
          toolPolicy: allow.length
            ? {
                root: reqCwd,
                allow,
                guard: config.guard, // B-08
                maxTurns: ctx.maxTurns ?? config.phases?.toolTurns?.[phase] ?? 8,
                maxInputTokens: config.phases?.toolInputBudget?.[phase],
                commandTimeoutSec: config.tools.commandTimeoutSec,
                maxOutputChars: config.tools.maxOutputChars,
                maxReadChars: config.tools.maxReadChars,
                cachedInputWeight: config.tools.cachedInputWeight,
                denyCommands: [...config.tools.denyCommands, ...(ctx.project?.denyCommands ?? [])],
                allowGitCommit: !!task.branch,
                expectWrites: (phase === 'execute' || phase === 'revise') && allow.some((t) => t === 'write_file' || t === 'edit_file'),
                readsBeforeWrite: config.tools.readsBeforeWrite,
                gitReadOnly: allow.includes('git_read') && !allow.includes('run_command'),
                bashMaxOutput: task.options.bashMaxOutput ?? config.tools.bashMaxOutput,
                guardState: path.join(store.runDir(task.id), 'guard', `${safeName(callId)}${i ? `-r${i}` : ''}.json`),
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
          // K2: dùng khóa API ngoài cấu hình (useApiKey tắt) → cảnh báo, chỉ ghi nhãn đã lọc
          if (r.authSourceUnexpected)
            logs.write({ level: 'warn', kind: 'runtime.auth-source', msg: `${agent.name} · ${cand.label}: đường xác thực "${r.authSource}" không phải đăng nhập, trong khi runtimes.claude-cli.useApiKey không bật`, taskId: task.id, agentId: agent.id, department: deptId, subtaskId: ctx.subtask?.id, phase, data: { callId, authSource: r.authSource } });
          // D15: lượt gọi có `error` (kể cả khi runtime kèm `text` là chính thông báo lỗi, vd. claude-cli is_error) LUÔN là lỗi:
          // đi vào thử lại/chuyển runtime/tạm dừng và không bao giờ để nơi gọi đọc `text` như sản phẩm. Chạm trần lượt (`capped`) không có `error`.
          if (r.error)
            throw new RuntimeError(
              r.error,
              r.errorKind ?? classifyError(undefined, r.error),
              undefined,
              r.retryAt ?? parseRetryAt(undefined, r.error), // K1: "resets 1am (Asia/Bangkok)" → giờ tự tiếp tục
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
      if (result?.error && attempts.length && attempts.every((a) => CAPACITY_KINDS.has(a.kind))) {
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
      authSource: result.authSource,
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
      // trần đầu ra THỰC của lượt: max_tokens của pha, không có thì của runtime (KPI so "bị cắt" với trần này)
      maxTokens: req?.maxTokens ?? (Number(config.runtimes?.[result.runtime]?.maxTokens) || undefined),
      // prompt lớn nhất trong các vòng công cụ (KPI: độ đầy ngữ cảnh theo vòng lớn nhất)
      maxPrompt: result.maxPromptTokens,
      // runtime không ghi thao tác công cụ (Codex/Kimi CLI) → KPI Trung thực của lượt này "không đo được"
      toolsTracked: result.toolsTracked === false ? false : undefined,
      turns: result.turns,
      truncated: result.truncated,
      errorKind: result.errorKind,
      diag: result.diag,
      tools: result.toolCalls,
      text: result.text.slice(0, 200_000),
    });
    this.save(task);
    if (result.error) this.setAgent(agent.id, { status: 'error', activity: result.error.slice(0, 80) });
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
      if (r2.error || !r2.text) break;
      text += r2.text;
      usage.input += r2.usage.input;
      usage.output += r2.usage.output;
      usage.cacheRead += r2.usage.cacheRead;
      usage.cacheWrite += r2.usage.cacheWrite;
      res = { ...r2, text, usage: { ...usage }, toolCalls: first.toolCalls, turns: (res.turns ?? 1) + (r2.turns ?? 1), capped: first.capped, diag: first.diag, maxPromptTokens: Math.max(res.maxPromptTokens ?? 0, r2.maxPromptTokens ?? 0) || undefined };
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

  /** Nhánh cục bộ tồn tại trong repo của dự án (nhánh của nhiệm vụ trước cho việc nối). */
  private branchExists(project: ProjectDef, branch: string): boolean {
    if (!project.workspace || (project.isolation ?? 'worktree') !== 'worktree' || !isSafeRef(branch)) return false;
    const dir = path.isAbsolute(project.workspace) ? project.workspace : path.join(this.d.config.root, project.workspace);
    return fs.existsSync(dir) && git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000).ok;
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

  /** Nối thêm một mục vào báo cáo bàn giao hiện có (vd. lượt giải quyết xung đột) — giữ phần bàn giao gốc ở đầu, tóm tắt theo bản gốc. */
  private appendOutput(task: Task, st: Subtask, original: string, title: string): void {
    if (!st.output) return;
    const raw = this.d.store.readRunFile(task.id, st.output) ?? '';
    const head = /^<!--[\s\S]*?-->\s*/.exec(raw)?.[0] ?? '';
    const text = `${original.trim()}\n\n## ${title}\n${raw.slice(head.length).replace(/^#+\s*Tóm tắt\s*\n/i, '').trim()}\n`;
    writeText(path.join(this.d.store.runDir(task.id), st.output), head + text);
    st.summary = extractSummary(original);
    if (task.workspace)
      try {
        writeText(path.join(task.workspace, '.ccoding', safeName(task.id), st.output), text);
      } catch {
        /* workspace chỉ đọc: bỏ qua */
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
      // góp ý tạo từ "việc cần sửa" mà mục đó nay đã sửa → xóa khỏi hồ sơ agent
      // benchtest không được đổi hồ sơ agent giữa các lượt (đầu vào phải như nhau)
      const cleared = task.options.variant ? [] : clearFixedFeedback({ store, registry, config: this.d.config }, rep.agents.map((a) => a.agentId));
      if (cleared.length) this.d.logs.write({ level: 'info', kind: 'agent.feedback.cleared', msg: `Xóa ${cleared.length} góp ý đã sửa xong: ${cleared.map((x) => `${x.agentId}/${x.finding}`).join(', ')}`, taskId: task.id });
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
    const bodyText = (task.runs.length > 1 ? `# Báo cáo liên phòng — ${task.title}\n\n` : '') + parts.join('\n\n---\n\n') + appendix;
    if (paused) {
      // Tạm dừng (hết hạn mức/ngân sách/thủ công): chưa có báo cáo cuối → không ghi FINAL.md, không gán finalPath.
      // Bản tạm dùng tên khác (artifacts.ts chỉ nhận FINAL.md là "Báo cáo tổng hợp") và nói rõ là bản tạm ở dòng đầu.
      writeText(path.join(store.runDir(task.id), 'DRAFT-paused.md'), `> **BẢN TẠM khi tạm dừng — không phải báo cáo cuối.** FINAL.md sẽ được ghi khi nhiệm vụ tiếp tục và hoàn thành.\n\n${bodyText}`);
      return;
    }
    writeText(path.join(store.runDir(task.id), 'FINAL.md'), bodyText);
    task.finalPath = 'FINAL.md';
    try {
      fs.rmSync(path.join(store.runDir(task.id), 'DRAFT-paused.md'), { force: true });
    } catch {
      /* không xóa được bản tạm: bỏ qua */
    }
  }

  private checkAbort(task: Task): void {
    if (this.controllers.get(task.id)?.signal.aborted) throw new CancelledError('Đã hủy');
  }

  /** Hủy hoặc có yêu cầu tạm dừng → dừng trước khi bắt đầu việc tốn kém (tách worktree con, cài dependency). */
  private checkStop(task: Task): void {
    this.checkAbort(task);
    if (this.pauseRequests.has(task.id)) throw new PauseSignal('manual', 'Tạm dừng theo yêu cầu');
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

/**
 * Tên công cụ kiểu Claude Code cho runtime CLI (claude/codex/kimi) theo pha và quyền dự án — cùng quy tắc với `toolsFor`:
 * review được chạy lệnh (test/typecheck để có bằng chứng) nhưng không ghi tệp; lập kế hoạch/tổng hợp chỉ đọc.
 */
export function cliTools(agentTools: string[], access: ToolAccess, phase: Phase, gitRead = false): string[] {
  if (access === 'none' || phase === 'route' || phase === 'discuss') return [];
  let list = agentTools;
  if (access === 'read') list = list.filter((t) => READ_ONLY_TOOLS.has(t));
  if (access === 'write') list = list.filter((t) => t !== 'Bash' && t !== 'PowerShell');
  if (phase === 'execute' || phase === 'revise') list = [...list];
  else if (phase === 'review') list = list.filter((t) => READ_ONLY_TOOLS.has(t) || t === 'Bash' || t === 'PowerShell');
  else list = list.filter((t) => READ_ONLY_TOOLS.has(t));
  // git chỉ đọc (như git_read của toolsFor): thêm Bash, hook claude-guard chỉ cho chạy git log/show/diff…
  if (gitRead && list.includes('Read') && !list.includes('Bash') && !list.includes('PowerShell')) list.push('Bash');
  return list;
}

const VARIANT_PHASES = new Set(['route', 'plan', 'discuss', 'finalize', 'execute', 'review', 'revise', 'synthesize', 'accept']);

/** Tùy chọn biến thể (benchtest) hợp lệ từ yêu cầu giao việc — chỉ nhận đúng kiểu, bỏ phần lạ. */
export function variantOptions(o: Partial<TaskOptions>): Partial<TaskOptions> {
  const out: Partial<TaskOptions> = {};
  if (typeof o.bashMaxOutput === 'number' && o.bashMaxOutput > 0) out.bashMaxOutput = Math.min(200_000, Math.max(2000, Math.floor(o.bashMaxOutput)));
  if (o.repoMapMode === 'full' || o.repoMapMode === 'compact') out.repoMapMode = o.repoMapMode;
  if (o.phaseModels && typeof o.phaseModels === 'object') {
    const pm = Object.fromEntries(Object.entries(o.phaseModels).filter(([k, v]) => VARIANT_PHASES.has(k) && typeof v === 'string' && /^[\w.:/-]{1,80}$/.test(v)));
    if (Object.keys(pm).length) out.phaseModels = pm as TaskOptions['phaseModels'];
  }
  if (typeof o.variant === 'string' && o.variant.trim()) out.variant = o.variant.trim().slice(0, 60);
  if (o.lane === 'auto' || o.lane === 'single' || o.lane === 'fast' || o.lane === 'full') out.lane = o.lane;
  const slim = sanitizeSlim(o.slim);
  if (Object.keys(slim).length) out.slim = slim;
  return out;
}

/** Mặc định `tools.resolveRounds`: số vòng xung đột giải quyết trong worktree con mới; vượt quá thì làm lại lần lượt trong worktree chính. */
const MAX_RESOLVE_ROUNDS = 2;

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

/** Thống kê thay đổi của một worktree so với commit gốc (lỗi git thì rỗng). */
function changesIn(wt: string, base?: string): string {
  try {
    return changeSummary(wt, base);
  } catch {
    return '';
  }
}

/** Chép tệp agent tạo/sửa trong `.ccoding/<task>` của worktree con về worktree chính (chỉ tệp mới hoặc mới hơn; bỏ tệp CCoding tự sinh). */
function syncCcoding(from: string, to: string, rel: string): number {
  const src = path.join(from, rel);
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.isFile() || (dir === src && (e.name === 'PLAN.md' || e.name === 'repo-map.md' || e.name === 'repo-index.md'))) continue;
      const dst = path.join(to, rel, path.relative(src, p));
      if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(p).mtimeMs) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(p, dst);
      n++;
    }
  };
  walk(src);
  return n;
}

/** Thư mục worktree con không hợp lệ (gỡ dở, lạ) → đổi tên sang bên để không ai commit nhầm vào đó; dọn sổ worktree của repo. */
function moveAside(repo: string, dir: string): void {
  try {
    fs.renameSync(dir, `${dir}.cu-${Date.now()}`);
  } catch {
    /* đang bị khóa — để nguyên, lần sau thử lại */
  }
  git(repo, ['worktree', 'prune'], 30_000);
}

/** Tệp còn dấu xung đột git (`<<<<<<<` … `>>>>>>>`). */
function hasConflictMarkers(file: string): boolean {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size > 5_000_000) return false;
    const s = fs.readFileSync(file, 'utf8');
    return /^<{7}(?: |$)/m.test(s) && /^>{7}(?: |$)/m.test(s);
  } catch {
    return false;
  }
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
