import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { EventBus } from './events.js';
import type { Herdr } from './herdr.js';
import type { LogStore } from './logger.js';
import {
  blockedSubtasks,
  keywordRoute,
  orderJoint,
  parsePlan,
  parseReview,
  parseRoute,
  readySubtasks,
} from './planner.js';
import * as P from './prompts.js';
import type { Registry } from './registry.js';
import type { RuntimeManager } from './runtimes/index.js';
import type { Store } from './store.js';
import type { UsageLedger } from './usage.js';
import { ensureDir, readJsonFile, safeName, writeJsonAtomic, writeText } from './util/fsx.js';
import { newTaskId, nowIso, shortId } from './util/ids.js';
import { redact } from './util/redact.js';
import { fmtNum } from './util/format.js';
import {
  addUsage,
  emptyUsage,
  totalTokens,
  type AgentDef,
  type AgentState,
  type AgentStatus,
  type ChatMessage,
  type Classification,
  type DepartmentDef,
  type DeptRun,
  type NewTaskInput,
  type Phase,
  type ProjectDef,
  type RunRequest,
  type RunResult,
  type Subtask,
  type Task,
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
}

class BudgetError extends Error {}
class CancelledError extends Error {}

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'LS']);

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

export function extractSummary(text: string, max = 320): string {
  const m = /##\s*Tóm tắt[^\n]*\n+([\s\S]*?)(?:\n##\s|$)/i.exec(text);
  const body = (m ? m[1] : text.replace(/^#.*$/gm, '')).replace(/\s+/g, ' ').trim();
  return body.length > max ? `${body.slice(0, max)}…` : body;
}

/**
 * Bộ điều phối trung tâm: nhận nhiệm vụ → định tuyến → trưởng phòng lập kế hoạch →
 * họp thảo luận → chốt → thực thi song song theo phụ thuộc → review/sửa → báo cáo tổng hợp.
 */
export class Orchestrator {
  readonly agentStates = new Map<string, AgentState>();
  readonly runner: 'process' | 'herdr';
  private controllers = new Map<string, AbortController>();
  private queue: string[] = [];
  private active = new Set<string>();
  private locks = new Map<string, Promise<void>>();
  private holds = new Map<string, Omit<AgentState, 'id' | 'since'>>();
  private seq = 0;

  constructor(private d: OrchestratorDeps) {
    for (const a of d.registry.agents.values()) this.agentStates.set(a.id, { id: a.id, status: 'idle', since: nowIso() });
    const r = d.config.runner;
    this.runner = r === 'herdr' || (r === 'auto' && !!d.herdr?.insideHerdr()) ? 'herdr' : 'process';
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
        runtime: o.runtime || undefined,
      },
      usage: emptyUsage(),
      createdAt: now,
      updatedAt: now,
    };
    (task as Task & { autoTitle?: boolean }).autoTitle = !input.title;
    store.put(task, true);
    this.d.logs.write({ level: 'info', kind: 'task.created', msg: `Nhận nhiệm vụ: ${task.title}`, taskId: task.id, projectId: task.projectId, data: { mode, department: input.department } });
    this.emitTask(task);
    this.queue.push(task.id);
    this.pump();
    return task;
  }

  cancel(id: string): boolean {
    const t = this.d.store.get(id);
    if (!t) return false;
    if (t.status === 'queued') {
      this.queue = this.queue.filter((q) => q !== id);
      t.status = 'cancelled';
      t.finishedAt = nowIso();
      this.save(t, true);
      return true;
    }
    const c = this.controllers.get(id);
    if (!c) return false;
    c.abort();
    return true;
  }

  /** Chờ một nhiệm vụ kết thúc (dùng cho CLI chế độ độc lập & kiểm thử). */
  waitFor(id: string): Promise<Task> {
    return new Promise((resolve) => {
      const check = () => {
        const t = this.d.store.get(id);
        if (t && ['done', 'failed', 'cancelled'].includes(t.status)) {
          off();
          resolve(t);
        }
      };
      const off = this.d.bus.subscribe((ev) => {
        if (ev.type === 'task' && ev.task.id === id) check();
      });
      check();
    });
  }

  states(): AgentState[] {
    return [...this.agentStates.values()];
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
        this.pump();
      });
    }
  }

  // ── Một nhiệm vụ ──────────────────────────────────────────────────────────

  private async runTask(task: Task): Promise<void> {
    const { store, logs, registry } = this.d;
    const ctrl = new AbortController();
    this.controllers.set(task.id, ctrl);
    task.status = 'running';
    task.startedAt = nowIso();
    this.save(task, true);
    logs.write({ level: 'info', kind: 'task.start', msg: `Bắt đầu ${task.id} (${task.mode})`, taskId: task.id, projectId: task.projectId });
    const project = task.projectId ? store.project(task.projectId) : undefined;
    try {
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

      let prior: string | undefined;
      for (const run of task.runs) {
        this.checkAbort(task);
        const final = await this.runDepartment(task, run, project, prior);
        prior = `# Từ ${registry.department(run.department).name}\n\n${final}`;
      }
      this.writeFinal(task);
      task.status = 'done';
      task.phase = undefined;
      logs.write({ level: 'info', kind: 'task.done', msg: `Hoàn thành ${task.id} — ${fmtNum(totalTokens(task.usage))} token`, taskId: task.id, projectId: task.projectId, data: { usage: task.usage } });
      void this.d.herdr?.notify(`CCoding: xong ${task.id}`, task.title);
    } catch (e) {
      const cancelled = ctrl.signal.aborted || e instanceof CancelledError;
      task.status = cancelled ? 'cancelled' : 'failed';
      task.error = cancelled ? 'Đã hủy theo yêu cầu' : (e as Error).message;
      for (const r of task.runs) if (r.status === 'running' || r.status === 'pending') r.status = cancelled ? 'cancelled' : 'failed';
      for (const r of task.runs) for (const s of r.subtasks) if (s.status === 'running' || s.status === 'pending') s.status = 'skipped';
      logs.write({ level: cancelled ? 'warn' : 'error', kind: cancelled ? 'task.cancelled' : 'task.failed', msg: `${task.id}: ${task.error}`, taskId: task.id, projectId: task.projectId });
      if (!cancelled && task.runs.some((r) => r.subtasks.some((s) => s.output))) this.writeFinal(task);
    } finally {
      task.finishedAt = nowIso();
      this.controllers.delete(task.id);
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
      const res = await this.call(router, 'route', P.routePrompt(task, depts, project), {
        task,
        project,
        cwd: this.workspaceFor(task, project),
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

  private async runDepartment(task: Task, run: DeptRun, project: ProjectDef | undefined, prior?: string): Promise<string> {
    const { registry } = this.d;
    const dept = registry.department(run.department);
    const roster = registry.members(dept.id, project?.agents);
    const lead = registry.agent(dept.lead);
    const reviewer = dept.reviewer ? registry.agents.get(dept.reviewer) : undefined;
    const cwd = this.workspaceFor(task, project);
    const pctx: P.Ctx = { task, dept, project, cwd, roster };
    const base: CallCtx = { task, dept, run, project, cwd };
    const names = new Map([...registry.agents.values()].map((a) => [a.id, a.name]));
    const rosterHints = roster.map((a) => ({ id: a.id, name: a.name, title: a.title, role: a.role, skills: a.skills }));
    run.status = 'running';
    run.startedAt = nowIso();

    // 1) Lập kế hoạch
    this.setPhase(task, run, 'plan');
    const planRes = await this.call(lead, 'plan', P.planPrompt(pctx, prior), { ...base, hints: { brief: task.brief, roster: rosterHints, department: dept.name } });
    let plan = parsePlan(planRes.text, roster, lead, task.brief);
    run.subtasks = plan.subtasks;
    run.planSummary = plan.summary;
    this.message(task, dept.id, lead.id, 'plan', `${plan.summary || 'Kế hoạch dự thảo'}\n${P.planText(plan.subtasks)}${plan.parsed ? '' : '\n(_kế hoạch dự phòng — trả lời của trưởng phòng không đúng định dạng_)'}`);
    this.save(task);

    // 2) Họp thảo luận + chốt
    const rounds = task.options.discussionRounds;
    if (rounds > 0) {
      this.setPhase(task, run, 'discuss');
      const participantIds = [...new Set([...run.subtasks.map((s) => s.assignee), reviewer?.id].filter((x): x is string => !!x && x !== lead.id))].slice(0, 7);
      const participants = participantIds.map((id) => registry.agent(id));
      const meeting = [lead, ...participants];
      for (const a of meeting) this.hold(a.id, { status: 'discussing', activity: 'Đang họp phòng', taskId: task.id, phase: 'discuss' });
      try {
        for (let r = 1; r <= rounds; r++) {
          for (const a of participants) {
            this.checkAbort(task);
            const transcript = P.transcriptText(this.d.store.transcript(task.id).filter((m) => m.department === dept.id), names);
            const res = await this.call(a, 'discuss', P.discussPrompt(pctx, a, run.planSummary ?? '', run.subtasks, transcript, r, rounds), {
              ...base,
              hints: { brief: task.brief },
            });
            if (res.text) this.message(task, dept.id, a.id, 'discussion', res.text.slice(0, 1500), { round: r });
          }
        }
        this.setPhase(task, run, 'finalize');
        const transcript = P.transcriptText(this.d.store.transcript(task.id).filter((m) => m.department === dept.id), names);
        const fin = await this.call(lead, 'finalize', P.finalizePrompt(pctx, run.planSummary ?? '', run.subtasks, transcript), {
          ...base,
          hints: { brief: task.brief, planSummary: run.planSummary, subtasks: run.subtasks.map(stHint) },
        });
        const revised = parsePlan(fin.text, roster, lead, task.brief);
        if (revised.parsed) {
          plan = revised;
          run.subtasks = revised.subtasks;
          run.planSummary = revised.summary || run.planSummary;
        }
        run.decisions = plan.decisions.join('; ');
        this.message(
          task,
          dept.id,
          lead.id,
          'decision',
          `Chốt kế hoạch${plan.decisions.length ? `:\n${plan.decisions.map((x) => `- ${x}`).join('\n')}` : '.'}\n${P.planText(run.subtasks)}`,
        );
      } finally {
        for (const a of meeting) this.release(a.id, task.id);
      }
    }

    // 3) Thực thi
    this.setPhase(task, run, 'execute');
    await this.executeAll(task, run, pctx, base, prior);

    // 4) Review & sửa
    const done = () => run.subtasks.filter((s) => s.status === 'done' && s.output);
    if (task.options.review && reviewer && done().length) {
      for (let attempt = 0; attempt <= task.options.maxRevisions; attempt++) {
        this.checkAbort(task);
        this.setPhase(task, run, 'review');
        const items = done().map((st) => ({ st, text: this.readOutput(task, st) }));
        const res = await this.call(reviewer, 'review', P.reviewPrompt(pctx, items), {
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
        await Promise.all(
          targets.map(async (st) => {
            const agent = registry.agent(st.assignee);
            const issues = review.issues.filter((i) => i.subtask === st.id).map((i) => `- [${i.severity}] ${i.comment}`).join('\n');
            const prev = this.readOutput(task, st);
            const r = await this.call(agent, 'revise', P.revisePrompt(pctx, st, prev, issues), {
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
      }
    }

    // 5) Báo cáo tổng hợp
    this.checkAbort(task);
    this.setPhase(task, run, 'synthesize');
    const items = done().map((st) => ({ st, text: this.readOutput(task, st) }));
    const reviewText = run.review ? `${run.review.approved ? 'Đã duyệt' : 'Chưa duyệt hoàn toàn'}: ${run.review.summary}` : '';
    const fin = await this.call(lead, 'synthesize', P.synthesizePrompt(pctx, run.planSummary ?? '', run.decisions ?? '', items, reviewText, prior), {
      ...base,
      hints: { brief: task.brief, subtasks: run.subtasks.map(stHint), departmentName: dept.name },
    });
    const finalText = fin.text || `# ${dept.name}\n\n(Trưởng phòng không trả về báo cáo — xem các file đầu ra.)`;
    const rel = `${safeName(dept.id)}-FINAL.md`;
    writeText(path.join(this.d.store.runDir(task.id), rel), finalText);
    run.finalPath = rel;
    run.status = run.subtasks.some((s) => s.status === 'failed') ? 'failed' : 'done';
    run.finishedAt = nowIso();
    run.phase = undefined;
    this.message(task, dept.id, lead.id, 'final', `Báo cáo tổng hợp đã xong: ${extractSummary(finalText, 240)}`);
    this.save(task);
    return finalText;
  }

  private async executeAll(task: Task, run: DeptRun, pctx: P.Ctx, base: CallCtx, prior?: string): Promise<void> {
    const busy = new Set<string>();
    const inflight = new Map<string, Promise<void>>();
    for (;;) {
      this.checkAbort(task);
      for (const st of blockedSubtasks(run.subtasks)) {
        st.status = 'skipped';
        st.error = 'Phụ thuộc thất bại';
      }
      const slots = task.options.maxParallel - inflight.size;
      const ready = slots > 0 ? readySubtasks(run.subtasks, busy).slice(0, slots) : [];
      for (const st of ready) {
        st.status = 'running';
        busy.add(st.assignee);
        const p = this.runSubtask(task, run, st, pctx, base, prior).finally(() => {
          busy.delete(st.assignee);
          inflight.delete(st.id);
        });
        inflight.set(st.id, p);
      }
      this.save(task);
      if (!inflight.size) break;
      await Promise.race(inflight.values());
    }
  }

  private async runSubtask(task: Task, run: DeptRun, st: Subtask, pctx: P.Ctx, base: CallCtx, prior?: string): Promise<void> {
    const { registry } = this.d;
    const agent = registry.agent(st.assignee);
    st.startedAt = nowIso();
    const deps = st.dependsOn
      .map((id) => run.subtasks.find((s) => s.id === id))
      .filter((s): s is Subtask => !!s && !!s.output)
      .map((s) => ({ st: s, text: this.readOutput(task, s) }));
    for (let attempt = 1; attempt <= 2; attempt++) {
      st.attempts++;
      const rt = await this.d.runtimes.resolve([task.options.runtime, pctx.project?.runtime, agent.runtime, this.d.config.runtime.default], task.classification);
      const allowTools = rt.runtime.supportsTools && agent.tools.length > 0;
      const res = await this.call(agent, 'execute', P.executePrompt(pctx, agent, st, run.planSummary ?? '', run.decisions ?? '', deps, allowTools, prior), {
        ...base,
        subtask: st,
        activity: `${st.id}: ${st.title}`,
        hints: { brief: task.brief, subtask: stHint(st) },
      });
      if (res.text && !res.error) {
        this.writeOutput(task, run, st, agent, res);
        st.status = 'done';
        st.finishedAt = nowIso();
        const next = run.subtasks.filter((s) => s.dependsOn.includes(st.id)).map((s) => `@${s.assignee}`);
        this.message(task, run.department, agent.id, 'handoff', `Xong ${st.id} — ${st.summary}${next.length ? `\n→ Bàn giao cho ${[...new Set(next)].join(', ')}` : ''}`, { subtaskId: st.id });
        return;
      }
      st.error = res.error ?? 'Không có nội dung trả về';
      this.d.logs.write({ level: 'warn', kind: 'subtask.retry', msg: `${st.id} lỗi lần ${attempt}: ${st.error}`, taskId: task.id, agentId: agent.id, department: run.department, subtaskId: st.id });
    }
    st.status = 'failed';
    st.finishedAt = nowIso();
    this.message(task, run.department, 'system', 'system', `${st.id} (@${st.assignee}) thất bại: ${st.error}`, { subtaskId: st.id });
  }

  // ── Một lượt gọi agent ─────────────────────────────────────────────────────

  private async call(agent: AgentDef, phase: Phase, prompt: string, ctx: CallCtx): Promise<RunResult> {
    const { config, runtimes, logs, usage, store } = this.d;
    const task = ctx.task;
    const signal = this.controllers.get(task.id)?.signal;
    const release = await this.acquire(agent.id, signal);
    const deptId = ctx.dept?.id ?? 'office';
    const callNo = ++this.seq;
    const callId = `${task.id}#${callNo}`;
    let result: RunResult | undefined;
    try {
      this.checkAbort(task);
      if (totalTokens(task.usage) >= task.options.budgetTokens) {
        throw new BudgetError(`Vượt ngân sách token của nhiệm vụ (${fmtNum(totalTokens(task.usage))}/${fmtNum(task.options.budgetTokens)})`);
      }
      const cls = task.classification;
      const { runtime: rt, note } = await runtimes.resolve([task.options.runtime, ctx.project?.runtime, agent.runtime, config.runtime.default], cls);
      if (note) logs.write({ level: 'warn', kind: 'runtime.fallback', msg: note, taskId: task.id, agentId: agent.id, department: deptId });
      const model = ctx.project?.models?.[agent.id] ?? agent.model;
      let tools: string[] = [];
      if (phase === 'execute' || phase === 'revise') tools = agent.tools;
      else if (phase === 'plan' || phase === 'review' || phase === 'synthesize') tools = agent.tools.filter((t) => READ_ONLY_TOOLS.has(t));
      const system = P.systemFor(agent, ctx.dept, cls);
      const piiOut = cls === 'confidential' || cls === 'restricted';
      const outbound = (s: string) => (rt.local ? s : redact(s, { secrets: config.dataProtection.redactSecrets, pii: piiOut }));
      ensureDir(ctx.cwd);
      const req: RunRequest = {
        agent,
        phase,
        system: outbound(system),
        prompt: outbound(prompt),
        model,
        cwd: ctx.cwd,
        tools,
        allowTools: rt.supportsTools && tools.length > 0,
        timeoutMs: config.defaults.timeoutMs,
        meta: { taskId: task.id, subtaskId: ctx.subtask?.id, department: deptId, projectId: task.projectId, callId: `${safeName(task.id)}-${callNo}` },
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
      logs.write({
        level: 'info',
        kind: 'call.start',
        msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]}${ctx.subtask ? ` ${ctx.subtask.id}` : ''} [${rt.id}/${model}]`,
        taskId: task.id,
        agentId: agent.id,
        department: deptId,
        projectId: task.projectId,
        subtaskId: ctx.subtask?.id,
        phase,
        data: { callId, runtime: rt.id, model, promptChars: req.system.length + req.prompt.length, tools },
      });
      if (config.dataProtection.logPrompts) {
        const f = path.join(store.runDir(task.id), 'prompts', `${String(callNo).padStart(4, '0')}-${safeName(agent.id)}-${phase}.md`);
        writeText(f, redact(`<!-- system -->\n${req.system}\n\n<!-- prompt -->\n${req.prompt}`, { secrets: true, pii: config.dataProtection.redactPii }));
      }
      let lastAct = 0;
      const hooks = {
        signal,
        onActivity: (text: string) => {
          if (Date.now() - lastAct < 700) return;
          lastAct = Date.now();
          this.setAgent(agent.id, { activity: text.slice(0, 80) });
        },
        onText: (chunk: string) => this.d.bus.publish({ type: 'output', taskId: task.id, agentId: agent.id, chunk: chunk.slice(0, 600) }),
      };
      if (this.runner === 'herdr' && this.d.herdr && config.herdr.agentPanes) {
        try {
          result = await this.runInHerdr(rt.id, req, agent, ctx.dept ?? OFFICE, signal);
        } catch (e) {
          if (signal?.aborted) throw e;
          logs.write({ level: 'warn', kind: 'herdr.fallback', msg: `herdr lỗi, chạy trực tiếp: ${(e as Error).message}`, taskId: task.id, agentId: agent.id, department: deptId });
          result = await rt.run(req, hooks);
        }
      } else {
        result = await rt.run(req, hooks);
      }
      result = runtimes.applyPricing(result);
    } catch (e) {
      if (signal?.aborted) throw new CancelledError('Đã hủy');
      if (e instanceof BudgetError) throw e;
      result = {
        text: '',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
        estimated: false,
        model: agent.model,
        runtime: 'n/a',
        durationMs: 0,
        error: (e as Error).message,
      };
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
      input: result.usage.input,
      output: result.usage.output,
      cacheRead: result.usage.cacheRead,
      cacheWrite: result.usage.cacheWrite,
      costUsd: result.usage.costUsd,
      durationMs: result.durationMs,
      estimated: result.estimated,
      error: result.error,
    };
    if (result.runtime !== 'n/a') usage.record(rec);
    const delta = { ...result.usage, estimated: result.estimated };
    if (result.runtime !== 'n/a') {
      addUsage(task.usage, delta);
      if (ctx.run) addUsage(ctx.run.usage, delta);
      if (ctx.subtask) addUsage(ctx.subtask.usage, delta);
    }
    logs.write({
      level: result.error ? 'error' : 'info',
      kind: 'call.end',
      msg: `${agent.name} · ${ACTIVITY_BY_PHASE[phase]} ${result.error ? `LỖI: ${result.error}` : 'xong'} — in ${fmtNum(result.usage.input)} / out ${fmtNum(result.usage.output)}${result.estimated ? ' (ước lượng)' : ''}`,
      taskId: task.id,
      agentId: agent.id,
      department: deptId,
      projectId: task.projectId,
      subtaskId: ctx.subtask?.id,
      phase,
      data: { ...rec, preview: result.text.slice(0, 400) },
    });
    this.save(task);
    if (result.error && !result.text) this.setAgent(agent.id, { status: 'error', activity: result.error.slice(0, 80) });
    return result;
  }

  private async runInHerdr(runtimeId: string, req: RunRequest, agent: AgentDef, dept: DepartmentDef, signal?: AbortSignal): Promise<RunResult> {
    const herdr = this.d.herdr!;
    const pane = await herdr.ensureAgentPane(agent, dept);
    const dir = path.join(this.d.store.runDir(req.meta.taskId), 'jobs');
    const jobFile = path.join(dir, `${req.meta.callId}.json`);
    const resultFile = path.join(dir, `${req.meta.callId}.result.json`);
    writeJsonAtomic(jobFile, { runtime: runtimeId, request: req, resultFile, paneId: pane });
    await herdr.runJob(pane, jobFile, resultFile, req.timeoutMs, signal);
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
    const head = `<!-- ${task.id} · ${st.id} · ${agent.id} (${agent.title}) · ${res.runtime}/${res.model} · in ${res.usage.input} / out ${res.usage.output}${res.estimated ? ' (ước lượng)' : ''} -->\n\n`;
    writeText(path.join(this.d.store.runDir(task.id), rel), head + res.text);
    st.output = rel.replace(/\\/g, '/');
    st.summary = extractSummary(res.text);
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
    if (!parts.length) parts.push(`# ${task.title}\n\n(Chưa có báo cáo tổng hợp — xem các file trong outputs/.)`);
    const rows = usage
      .summary('agent', { task: task.id })
      .map((r) => `| ${registry.agents.get(r.key)?.name ?? r.key} (@${r.key}) | ${registry.agents.get(r.key)?.department ?? 'office'} | ${r.input} | ${r.output} | ${r.cacheRead} | ${r.calls} |`)
      .join('\n');
    const outputs = task.runs.flatMap((r) => r.subtasks.filter((s) => s.output).map((s) => `- \`${s.output}\` — ${s.id} ${s.title} (@${s.assignee})`));
    const appendix = `\n\n---\n\n## Phụ lục: token & sản phẩm (CCoding)\n\n- Nhiệm vụ: \`${task.id}\` · chế độ: ${task.mode} · phòng: ${task.departments.join(' → ')} · phân loại dữ liệu: ${task.classification}\n- Tổng: **${fmtNum(task.usage.input)} in / ${fmtNum(task.usage.output)} out**, cache đọc ${fmtNum(task.usage.cacheRead)}, ${task.usage.calls} lượt gọi${task.usage.estimatedCalls ? ` (${task.usage.estimatedCalls} lượt ước lượng)` : ''}\n\n| Agent | Phòng | Input | Output | Cache đọc | Lượt |\n|---|---|---:|---:|---:|---:|\n${rows}\n\n### File đầu ra\n${outputs.join('\n') || '(không có)'}\n`;
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
  for (const d of ['logs', 'runs', 'usage']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });
}
