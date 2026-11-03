/**
 * B-19: vòng tự cải thiện RQ5 — bước 1–4 (docs/research/self-improvement/implementation-spec.md §3). Mặc định TẮT (config.selfImprove.enabled).
 * Module KHÔNG import runtime: mọi lượt LLM là một nhiệm vụ CCoding thường do `deps.submit` (Orchestrator.submit) tạo, nên đi qua Orchestrator.call().
 * Mọi sự kiện ghi qua LogStore (che PII/bí mật + chuỗi băm); mọi tệp chỉ nằm dưới data/self-improve/.
 *
 * Bảng 8 trường của từng bước (đầu vào · đầu ra · tệp/module · công tắc · lượt LLM · người duyệt · rollback · sự kiện) nằm ở spec §3; ở đây chỉ ghi điểm khác biệt:
 *  1. toIncident/onLog — không LLM; ngân sách 0; sự kiện incident.recorded|skipped; rollback = tắt collect (log bất biến, vô hiệu bằng incident.retracted).
 *  2. clusterIncidents/openAnalysisTask — gom nhóm thuần; phân tích là nhiệm vụ do giám đốc bấm, ngân sách analysisTokens; người gán nhãn ghi vào labeledBy[].
 *  3. openPatchTask — nhiệm vụ viết bản vá, ngân sách patchTokens; từ chối author ∈ labeledBy[] hoặc = runner.
 *  4. verifyHoldout/buildAbSpec/recordAbStarted/decide — buildAbSpec CHỈ dựng lệnh; kết luận chỉ lấy lượt phase 'confirm'.
 *  5–7. screenPatch/applyApproved/monitorApplied/rollback/listProposals/purgeExpired — không LLM; chỉ giám đốc duyệt/áp/rollback (đọc lại LogStore, kiểm chuỗi băm).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Config } from './config.js';
import { git, identity } from './git.js';
import { verifyChain, type LogStore } from './logger.js';
import { redact } from './util/redact.js';
import type { Classification, LogEntry, NewTaskInput, Task } from './types.js';

export type SelfImproveConfig = Config['selfImprove'];

export interface Deps {
  cfg: SelfImproveConfig;
  logs: LogStore;
  dataDir: string;
  /** gốc repo CCoding (đọc holdout-lock, src/prompts.ts, bench/vs-claude/tasks) */
  root: string;
}

export const SI_DIR = 'self-improve';
const siPath = (dataDir: string, ...p: string[]): string => path.join(dataDir, SI_DIR, ...p);
const INCIDENTS = (dataDir: string): string => siPath(dataDir, 'incidents.jsonl');

// ───────────────────────── Bước 1 — Nhật ký sự cố ─────────────────────────

export type IncidentSource = 'agent.selfReport' | 'guard.block' | 'ab.run';
export type IncidentCategory = 'FM-1' | 'FM-2' | 'FM-3' | 'INF';
export interface Incident {
  schema: 'ccoding/incident/v1';
  id: string;
  ts: string;
  taskId: string;
  subtaskId?: string;
  agentId: string;
  phase: string;
  source: IncidentSource;
  category: IncidentCategory;
  challengeId: string;
  evidence: { kind: 'callId' | 'logSeq' | 'commit' | 'reviewIssue' | 'kpiKey'; ref: string }[];
  symptom: string;
  classification: Classification;
  promptVersion: string;
  agentProposal?: string;
}
export type SkipReason = 'infra' | 'classification' | 'ab-run' | 'no-evidence';

const INFRA_RE = /rate.?limit|\b429\b|quota|usage limit|hạn mức|vượt giới hạn|upstream|ECONN|socket|fetch failed|\b50[234]\b|timed? ?out|TimeoutError|No model configured/i;
const SECRET_CLASSES: Classification[] = ['confidential', 'restricted'];
const clip = (s: unknown, n: number): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Phân nhóm thô theo từ khóa (giả định, người gán nhãn ở bước 2 chốt lại): FM-1 đặc tả · FM-2 phối hợp · FM-3 kiểm chứng. */
function categoryOf(text: string): IncidentCategory {
  if (INFRA_RE.test(text)) return 'INF';
  if (/đặc tả|đề bài|spec|thiếu yêu cầu|hiểu sai/i.test(text)) return 'FM-1';
  if (/xung đột|mâu thuẫn|bàn giao|phối hợp/i.test(text)) return 'FM-2';
  return 'FM-3';
}

function promptVersionOf(root: string, agentId: string, department?: string): string {
  const h = crypto.createHash('sha256');
  const parts = [path.join(root, 'src', 'prompts.ts'), ...(department ? [path.join(root, 'agents', department, `${agentId}.md`)] : [])];
  let any = false;
  for (const f of parts) {
    try {
      h.update(fs.readFileSync(f).toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      any = true;
    } catch {
      /* thiếu tệp: bỏ qua */
    }
  }
  return any ? h.digest('hex').slice(0, 12) : 'unknown';
}

const nextIncidentSeq = (dataDir: string): number => {
  try {
    return fs.readFileSync(INCIDENTS(dataDir), 'utf8').split('\n').filter((l) => l.trim()).length + 1;
  } catch {
    return 1;
  }
};

/**
 * Đổi sự kiện `revise.incident` (B-03) thành bản ghi v1 (mỗi mục một bản). `null` = không ghi gì (đã loại); khi có `deps` thì ghi
 * `incident.skipped {taskId, kind, reason}` (không symptom/agentProposal) hoặc `incident.recorded` + incidents.jsonl.
 * classification lấy từ task, KHÔNG do agent khai. Lỗi hạ tầng (429/hạn mức) không đi tiếp.
 */
export function toIncident(entry: LogEntry, task: Pick<Task, 'id' | 'classification' | 'options'>, deps?: Pick<Deps, 'logs' | 'dataDir' | 'root'>): Incident[] | null {
  const skip = (reason: SkipReason): null => {
    deps?.logs.write({ level: 'info', kind: 'incident.skipped', msg: `${task.id}: bỏ sự cố (${reason})`, taskId: task.id, data: { taskId: task.id, kind: entry.kind, reason } });
    return null;
  };
  if (entry.kind !== 'revise.incident') return null;
  if (SECRET_CLASSES.includes(task.classification)) return skip('classification');
  const d = (entry.data ?? {}) as { taskId?: string; subtaskId?: string; round?: number; items?: { error?: string; cause?: string; fix?: string; verifyCmd?: string }[] };
  const items = (d.items ?? []).filter((it) => !INFRA_RE.test(`${it.error ?? ''} ${it.cause ?? ''}`));
  if (!items.length) return skip(d.items?.length ? 'infra' : 'no-evidence');
  const taskId = d.taskId ?? entry.taskId;
  if (!taskId || !entry.agentId) return skip('no-evidence');
  const abRun = String(task.options?.variant ?? '').startsWith('selfimprove/');
  const ts = entry.ts;
  const day = ts.slice(0, 10).replace(/-/g, '');
  const seq0 = deps ? nextIncidentSeq(deps.dataDir) : 1;
  const pv = deps ? promptVersionOf(deps.root, entry.agentId, entry.department) : 'unknown';
  const out = items.map((it, i): Incident => {
    const inc: Incident = {
      schema: 'ccoding/incident/v1',
      id: `INC-${day}-${String(seq0 + i).padStart(4, '0')}`,
      ts,
      taskId,
      ...(d.subtaskId ? { subtaskId: d.subtaskId } : {}),
      agentId: entry.agentId!,
      phase: entry.phase ?? 'revise',
      source: abRun ? 'ab.run' : 'agent.selfReport',
      category: categoryOf(`${it.error ?? ''} ${it.cause ?? ''}`),
      challengeId: 'new',
      evidence: [{ kind: 'logSeq', ref: `${taskId}/${d.subtaskId ?? '-'}/r${d.round ?? 0}#${i + 1}` }],
      // symptom do CCoding sinh từ tín hiệu, không chép nguyên văn đầu ra agent
      symptom: `Vòng sửa ${d.round ?? '?'} của ${d.subtaskId ?? '?'}: mục lỗi ${i + 1}/${items.length}${it.verifyCmd ? ', có lệnh kiểm' : ''}`,
      classification: task.classification,
      promptVersion: pv,
    };
    const prop = clip(it.fix, 300);
    if (prop) inc.agentProposal = prop;
    return inc;
  });
  if (deps) {
    for (const inc of out) {
      deps.logs.record(INCIDENTS(deps.dataDir), inc);
      // agentProposal là dữ liệu không đáng tin: không đưa vào bản ghi sự kiện, chỉ nằm ở incidents.jsonl
      const { agentProposal: _omit, ...pub } = inc;
      deps.logs.write({ level: 'info', kind: 'incident.recorded', msg: `${inc.id} ${inc.category}`, taskId, agentId: inc.agentId, data: pub });
    }
  }
  return out;
}

/** Móc từ Orchestrator: chỉ chạy khi selfImprove.enabled && collect. Không bao giờ ném lỗi ra vòng review. */
export function onLog(entry: LogEntry, task: Pick<Task, 'id' | 'classification' | 'options'>, deps: Deps): void {
  if (!deps.cfg.enabled || !deps.cfg.collect) return;
  try {
    toIncident(entry, task, deps);
  } catch {
    /* thu thập sự cố là phụ: lỗi không được làm hỏng nhiệm vụ */
  }
}

export function loadIncidents(dataDir: string): Incident[] {
  let raw = '';
  try {
    raw = fs.readFileSync(INCIDENTS(dataDir), 'utf8');
  } catch {
    return [];
  }
  const out: Incident[] = [];
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    try {
      const { seq: _s, prev: _p, hash: _h, ...rec } = JSON.parse(l);
      out.push(rec as Incident);
    } catch {
      /* dòng hỏng: verifyChain sẽ báo */
    }
  }
  return out;
}

// ───────────────────────── Bước 2 — Gom nhóm lỗi ─────────────────────────

export type Cause = 'prompt-missing' | 'prompt-conflict' | 'tool-perm' | 'infra';
export interface Cluster {
  id: string;
  key: { category: IncidentCategory; challengeId: string; agentId: string; phase: string };
  /** chỉ id: nguyên văn agentProposal không bao giờ được chép sang cụm (spec §4 điểm 3) */
  incidents: string[];
  tasks: string[];
  /** null = chưa có người gán nhãn */
  cause: Cause | null;
  evidence: { kind: string; ref: string }[];
  labeledBy: string[];
  symptoms: string[];
}

/** Thuần, tất định. Chỉ lấy classification public/internal và source ≠ ab.run; cụm mở khi ≥ minIncidents sự cố trong ≥ minTasks nhiệm vụ. */
export function clusterIncidents(incidents: Incident[], cfg: Pick<SelfImproveConfig, 'cluster'>): Cluster[] {
  const groups = new Map<string, Incident[]>();
  for (const inc of incidents) {
    if (inc.classification !== 'public' && inc.classification !== 'internal') continue;
    if (inc.source === 'ab.run') continue;
    const k = JSON.stringify([inc.category, inc.challengeId, inc.agentId, inc.phase]);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(inc);
  }
  const clusters: Cluster[] = [];
  for (const k of [...groups.keys()].sort()) {
    const list = groups.get(k)!;
    const tasks = [...new Set(list.map((i) => i.taskId))].sort();
    if (list.length < cfg.cluster.minIncidents || tasks.length < cfg.cluster.minTasks) continue;
    const [category, challengeId, agentId, phase] = JSON.parse(k) as [IncidentCategory, string, string, string];
    const first = list.map((i) => i.ts).sort()[0].slice(0, 10).replace(/-/g, '');
    clusters.push({
      id: `CL-${first}-${String(clusters.length + 1).padStart(2, '0')}`,
      key: { category, challengeId, agentId, phase },
      incidents: list.map((i) => i.id).sort(),
      tasks,
      cause: category === 'INF' ? 'infra' : null,
      evidence: list.flatMap((i) => i.evidence).slice(0, 20),
      labeledBy: [],
      symptoms: [...new Set(list.map((i) => i.symptom))].slice(0, 5),
    });
  }
  return clusters;
}

/** Ghi cụm mới ra data/self-improve/clusters/<id>.json và sự kiện `selfimprove.cluster.opened`. */
export function persistClusters(clusters: Cluster[], deps: Pick<Deps, 'logs' | 'dataDir'>): void {
  for (const c of clusters) {
    const file = siPath(deps.dataDir, 'clusters', `${c.id}.json`);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(c, null, 2), 'utf8');
    deps.logs.write({ level: 'info', kind: 'selfimprove.cluster.opened', msg: `Mở cụm ${c.id}`, data: { clusterId: c.id, incidents: c.incidents.length, tasks: c.tasks.length, category: c.key.category } });
  }
}

/** Tóm tắt cụm cho đề bài nhiệm vụ: chỉ trường do CCoding sinh (key, đếm, symptom, bằng chứng) — không có agentProposal. */
export function clusterSummary(c: Cluster): string {
  return [
    `Cụm ${c.id}: nhóm ${c.key.category}, agent ${c.key.agentId}, pha ${c.key.phase}.`,
    `${c.incidents.length} sự cố trong ${c.tasks.length} nhiệm vụ (${c.tasks.join(', ')}).`,
    `Triệu chứng: ${c.symptoms.join(' | ')}`,
    `Bằng chứng: ${c.evidence.map((e) => `${e.kind}:${e.ref}`).join(', ')}`,
    c.cause ? `Nguyên nhân đã gán: ${c.cause}.` : 'Chưa gán nguyên nhân.',
  ].join('\n');
}

export interface TaskSink {
  submit(input: NewTaskInput): Pick<Task, 'id'>;
}

/** Nhiệm vụ phân tích nguyên nhân (giám đốc bấm). Mọi lượt LLM đi qua Orchestrator.call() vì là nhiệm vụ thường; ngân sách analysisTokens. */
export function openAnalysisTask(cluster: Cluster, deps: Pick<Deps, 'cfg' | 'logs'> & TaskSink): Pick<Task, 'id'> {
  if (!deps.cfg.enabled) throw new Error('Vòng tự cải thiện đang tắt (selfImprove.enabled=false)');
  if (cluster.key.category === 'INF' || cluster.cause === 'infra' || cluster.cause === 'tool-perm') throw new Error(`Cụm ${cluster.id} thuộc loại hạ tầng/quyền công cụ, không phân tích bằng bản vá prompt`);
  const t = deps.submit({
    title: `Phân tích nguyên nhân cụm ${cluster.id}`,
    brief: `${clusterSummary(cluster)}\n\nViệc cần làm: gán nguyên nhân gốc (prompt-missing | prompt-conflict | tool-perm | infra) kèm lập luận dựa trên bằng chứng ở trên.`,
    agentId: deps.cfg.roles.analyst,
    options: { budgetTokens: deps.cfg.budgets.analysisTokens, budgetMode: 'complete' },
  });
  deps.logs.write({ level: 'info', kind: 'selfimprove.cluster.analyzing', msg: `Phân tích ${cluster.id}`, data: { clusterId: cluster.id, taskId: t.id, analyst: deps.cfg.roles.analyst } });
  return t;
}

// ───────────────────────── Bước 3 — Đề xuất bản vá ─────────────────────────

/**
 * Nhiệm vụ viết bản vá (giám đốc bấm). Từ chối khi người viết ∈ cluster.labeledBy[] hoặc = roles.runner (CT-18); cụm phải có cause prompt-*.
 * Đề bài không chứa agentProposal và không chứa kết quả A/B của bản vá trước.
 */
export function openPatchTask(cluster: Cluster, deps: Pick<Deps, 'cfg' | 'logs'> & TaskSink, author?: string): Pick<Task, 'id'> {
  const { cfg } = deps;
  if (!cfg.enabled) throw new Error('Vòng tự cải thiện đang tắt (selfImprove.enabled=false)');
  const who = author ?? cfg.roles.author;
  if (cluster.labeledBy.includes(who)) throw new Error(`Người viết bản vá (${who}) đã gán nhãn cụm ${cluster.id}: phải tách vai`);
  if (who === cfg.roles.runner) throw new Error(`Người viết bản vá (${who}) trùng người chạy A/B (roles.runner): phải tách vai`);
  if (cluster.cause !== 'prompt-missing' && cluster.cause !== 'prompt-conflict') throw new Error(`Cụm ${cluster.id} chưa có nguyên nhân prompt-missing/prompt-conflict`);
  const t = deps.submit({
    title: `Đề xuất bản vá cho cụm ${cluster.id}`,
    brief: `${clusterSummary(cluster)}\n\nViệc cần làm: viết MỘT bản vá unified diff chạm đúng MỘT tệp (src/prompts.ts hoặc agents/<phòng>/<id>.md) trong báo cáo, kèm giả thuyết và chỉ số chính. Không sửa tệp trực tiếp.`,
    agentId: who,
    options: { budgetTokens: cfg.budgets.patchTokens, budgetMode: 'complete' },
  });
  deps.logs.write({ level: 'info', kind: 'selfimprove.patch.opening', msg: `Viết bản vá ${cluster.id}`, data: { clusterId: cluster.id, taskId: t.id, author: who } });
  return t;
}

// ───────────────────────── Bước 4 — A/B trên bộ giữ lại ─────────────────────────

/** Hash tệp: tệp văn bản (UTF-8 hợp lệ, không NUL) đổi CRLF→LF; nhị phân băm nguyên byte. */
export function fileHash(buf: Buffer): string {
  let norm = buf;
  if (!buf.includes(0)) {
    try {
      norm = Buffer.from(new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/\r\n/g, '\n'), 'utf8');
    } catch {
      norm = buf;
    }
  }
  return crypto.createHash('sha256').update(norm).digest('hex');
}

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** sha256 các dòng `đường-dẫn<TAB>sha256` ('/', tương đối, sắp theo tên), mỗi dòng kết thúc LF. */
export function treeHash(dir: string): { files: number; sha: string } {
  const lines = walk(dir).map((p) => `${path.relative(dir, p).split(path.sep).join('/')}\t${fileHash(fs.readFileSync(p))}`);
  return { files: lines.length, sha: crypto.createHash('sha256').update(Buffer.from(lines.join('\n') + '\n')).digest('hex') };
}

export interface HoldoutCheck {
  ok: boolean;
  lockSha256: string;
  mismatches: string[];
}

/** So hash task.json và hidden/ của từng bài với holdout-lock.json. Lệch ⇒ ok=false (A/B không được dựng). KHÔNG sửa lock. */
export function verifyHoldout(deps: Pick<Deps, 'cfg' | 'root'>, tasksDir = path.join(deps.root, 'bench', 'vs-claude', 'tasks')): HoldoutCheck {
  const lockFile = path.resolve(deps.root, deps.cfg.holdoutLock);
  const raw = fs.readFileSync(lockFile);
  const lock = JSON.parse(raw.toString('utf8')) as Record<string, { taskJson: string; hiddenFiles: number; hiddenSha: string }>;
  const mismatches: string[] = [];
  for (const t of deps.cfg.ab.tasks) {
    const want = lock[t];
    const dir = path.join(tasksDir, t);
    if (!want) {
      mismatches.push(`${t}: không có trong lock`);
      continue;
    }
    try {
      const tj = fileHash(fs.readFileSync(path.join(dir, 'task.json')));
      const h = treeHash(path.join(dir, 'hidden'));
      if (tj !== want.taskJson) mismatches.push(`${t}: task.json`);
      if (h.sha !== want.hiddenSha || h.files !== want.hiddenFiles) mismatches.push(`${t}: hidden/`);
    } catch {
      mismatches.push(`${t}: không đọc được`);
    }
  }
  return { ok: mismatches.length === 0, lockSha256: fileHash(raw), mismatches };
}

export type AbPhase = 'screen' | 'confirm';
export interface ProposalMeta {
  pid: string;
  clusterId?: string;
  author: string;
  labeledBy: string[];
  kind: 'optimize' | 'collect';
}
export interface AbSpec {
  pid: string;
  phase: AbPhase;
  lockSha256: string;
  tasks: string[];
  repeats: number;
  runs: number;
  runner: string;
  seed: string;
  tokenBudget: number;
  /** thư mục mã khởi đầu của từng bài ('repo' hoặc 'starter'); harness hiện chỉ đọc 'starter' (điều kiện chặn (a) của S2a) */
  startDirs: Record<string, 'repo' | 'starter' | null>;
  /** mỗi nhánh một baseUrl/dataDir riêng; chỉ là lệnh, chưa chạy */
  commands: { A: string[]; B: string[] };
}

export interface SystemEvent {
  kind: string;
  data?: Record<string, unknown>;
}
/** Đọc toàn bộ sự kiện hệ thống (data/logs/system.jsonl) theo kind. */
export function readEvents(deps: Pick<Deps, 'logs'>, kinds: string[]): SystemEvent[] {
  let raw = '';
  try {
    raw = fs.readFileSync(deps.logs.fileFor('system'), 'utf8');
  } catch {
    return [];
  }
  const out: SystemEvent[] = [];
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    try {
      const e = JSON.parse(l) as SystemEvent;
      if (kinds.includes(e.kind)) out.push(e);
    } catch {
      /* bỏ dòng hỏng */
    }
  }
  return out;
}

/** Số lần xác nhận đã chạy trên lockSha256 kể từ lần `holdout.renewed {by:'director'}` gần nhất (cả pass lẫn fail). */
export function confirmRunsOnLock(deps: Pick<Deps, 'logs'>, lockSha256: string): number {
  let n = 0;
  for (const e of readEvents(deps, ['selfimprove.ab.started', 'selfimprove.holdout.renewed'])) {
    if (e.data?.lockSha256 !== lockSha256) continue;
    if (e.kind === 'selfimprove.holdout.renewed') {
      if (e.data?.by === 'director') n = 0;
    } else if (e.data?.phase === 'confirm') n++;
  }
  return n;
}

const readMeta = (dataDir: string, pid: string): ProposalMeta => {
  const f = siPath(dataDir, 'proposals', pid, 'meta.json');
  if (!fs.existsSync(f)) throw new Error(`Không thấy đề xuất ${pid} (thiếu meta.json)`);
  return JSON.parse(fs.readFileSync(f, 'utf8')) as ProposalMeta;
};

/**
 * CHỈ dựng đặc tả/lệnh A/B, không chạy gì và không ghi `ab.started` (gọi recordAbStarted khi thật sự bắt đầu). Từ chối khi:
 * runner = author hoặc ∈ labeledBy[] (CT-09) · hash bộ giữ lại lệch (CT-12) · bộ bài ≠ 10 · đủ maxConfirmRunsPerLock lần xác nhận (CT-19, ghi holdout.exhausted).
 */
export function buildAbSpec(pid: string, phase: AbPhase, deps: Deps, opts: { runner?: string; seed?: string; urls?: { A: string; B: string } } = {}): AbSpec {
  const { cfg } = deps;
  if (!cfg.enabled) throw new Error('Vòng tự cải thiện đang tắt (selfImprove.enabled=false)');
  const meta = readMeta(deps.dataDir, pid);
  const runner = opts.runner ?? cfg.roles.runner;
  if (runner === meta.author) throw new Error(`Người chạy A/B (${runner}) trùng người viết bản vá: phải tách vai`);
  if ((meta.labeledBy ?? []).includes(runner)) throw new Error(`Người chạy A/B (${runner}) đã gán nhãn cụm của bản vá: phải tách vai`);
  const hv = verifyHoldout(deps);
  if (!hv.ok) throw new Error(`Hash bộ bài giữ lại lệch so với holdout-lock.json (${hv.mismatches.join('; ')}): không dựng A/B`);
  if (cfg.ab.tasks.length !== 10) throw new Error(`Bộ giữ lại phải đúng 10 bài, đang có ${cfg.ab.tasks.length}`);
  if (phase === 'confirm') {
    const confirmRuns = confirmRunsOnLock(deps, hv.lockSha256);
    if (confirmRuns >= cfg.ab.maxConfirmRunsPerLock) {
      deps.logs.write({ level: 'warn', kind: 'selfimprove.holdout.exhausted', msg: 'Bộ giữ lại đã đủ số lần xác nhận', data: { lockSha256: hv.lockSha256, confirmRuns } });
      throw new Error(`Bộ giữ lại đã chạy xác nhận ${confirmRuns}/${cfg.ab.maxConfirmRunsPerLock} lần: cần giám đốc làm mới (holdout.renewed) hoặc đổi bộ`);
    }
  }
  const repeats = phase === 'screen' ? cfg.ab.screenRepeats : cfg.ab.confirmRepeats;
  const seed = opts.seed ?? crypto.createHash('sha256').update(`${pid}:${phase}:${hv.lockSha256}`).digest('hex').slice(0, 8);
  const urls = opts.urls ?? { A: 'http://127.0.0.1:7420', B: 'http://127.0.0.1:7421' };
  const tasksDir = path.join(deps.root, 'bench', 'vs-claude', 'tasks');
  const startDirs = Object.fromEntries(cfg.ab.tasks.map((t) => [t, (['repo', 'starter'] as const).find((d) => fs.existsSync(path.join(tasksDir, t, d))) ?? null]));
  const cmd = (url: string, out: string): string[] => ['node', 'bench/vs-claude/run.mjs', '--arms', 'B0', '--tasks', cfg.ab.tasks.join(','), '--repeats', String(repeats), '--ccoding-url', url, '--seed', seed, '--out', out];
  return {
    pid,
    phase,
    lockSha256: hv.lockSha256,
    tasks: [...cfg.ab.tasks],
    repeats,
    runs: cfg.ab.tasks.length * 2 * repeats,
    runner,
    seed,
    tokenBudget: phase === 'screen' ? cfg.budgets.abScreenTokens : cfg.budgets.abConfirmTokens,
    startDirs,
    commands: { A: cmd(urls.A, `data/${SI_DIR}/ab/${pid}/${phase}/A`), B: cmd(urls.B, `data/${SI_DIR}/ab/${pid}/${phase}/B`) },
  };
}

/** Ghi `selfimprove.ab.started` khi lượt A/B thật sự bắt đầu (đây là sự kiện mà ngưỡng maxConfirmRunsPerLock đếm). */
export function recordAbStarted(spec: AbSpec, deps: Pick<Deps, 'logs'>): void {
  deps.logs.write({ level: 'info', kind: 'selfimprove.ab.started', msg: `A/B ${spec.pid} ${spec.phase}`, data: { pid: spec.pid, phase: spec.phase, lockSha256: spec.lockSha256, tasks: spec.tasks, repeats: spec.repeats, runner: spec.runner, seed: spec.seed } });
}

// ── decide(): quyết định A/B (D5) ──

export interface AbRun {
  phase: AbPhase;
  task: string;
  arm: 'A' | 'B';
  tokens: number;
  wallSec: number;
  /** tỉ lệ test ẩn đạt, 0..1 */
  safety: number;
  /** lượt bị xóa (429, leak): không tính, chỉ đếm theo nhánh */
  dropped?: boolean;
}
export interface Interval {
  est: number;
  lo: number;
  hi: number;
}
export interface Decision {
  decision: 'pass' | 'fail' | 'need-more-tasks';
  token: Interval;
  time: Interval;
  safety: Interval;
  nConfirm: number;
  dropped: { A: number; B: number };
  reasons: string[];
}

// phân vị chuẩn (Abramowitz–Stegun 26.2.23) và hiệu chỉnh t (Cornish–Fisher)
function zInv(p: number): number {
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3);
  return p < 0.5 ? -z : z;
}
const tInv = (p: number, df: number): number => {
  const z = zInv(p);
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
};
const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;

/** CI theo bài (ghép cặp): mỗi bài một hiệu số, khoảng tin cậy t trên trung bình các bài. Bonferroni 3 chỉ số (bảo thủ hơn Holm), hai phía 95 %. */
function pairedCi(diffs: number[]): Interval {
  const n = diffs.length;
  const m = mean(diffs);
  const sd = n > 1 ? Math.sqrt(diffs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0;
  const crit = n > 1 ? tInv(1 - 0.05 / 2 / 3, n - 1) : 0;
  const half = (crit * sd) / Math.sqrt(n);
  return { est: m, lo: m - half, hi: m + half };
}

/**
 * Chỉ dùng lượt phase 'confirm' (D7: không gộp sàng lọc). Ngưỡng D5 (giả định): token cận trên B/A < 0,95 (kind 'optimize') hoặc < 1,05 ('collect');
 * thời gian cận trên B/A < 1,05; an toàn cận dưới hiệu tỉ lệ test ẩn ≥ −0,02. Chưa hiện thực: điều kiện (3) τ² và (5) một bài mất ≥ 10 test — S3/S7 bổ sung.
 */
export function decide(runs: AbRun[], kind: ProposalMeta['kind'] = 'optimize'): Decision {
  const confirm = runs.filter((r) => r.phase === 'confirm');
  const dropped = { A: confirm.filter((r) => r.dropped && r.arm === 'A').length, B: confirm.filter((r) => r.dropped && r.arm === 'B').length };
  const kept = confirm.filter((r) => !r.dropped);
  const tasks = [...new Set(kept.map((r) => r.task))].sort();
  const per = (task: string, arm: 'A' | 'B', f: (r: AbRun) => number): number | null => {
    const v = kept.filter((r) => r.task === task && r.arm === arm).map(f);
    return v.length ? mean(v) : null;
  };
  const paired = (f: (r: AbRun) => number, op: (b: number, a: number) => number): number[] =>
    tasks.flatMap((t) => {
      const a = per(t, 'A', f);
      const b = per(t, 'B', f);
      return a === null || b === null ? [] : [op(b, a)];
    });
  const logR = (b: number, a: number): number => Math.log(b) - Math.log(a);
  const tok = paired((r) => r.tokens, logR);
  const wall = paired((r) => r.wallSec, logR);
  const saf = paired((r) => r.safety, (b, a) => b - a);
  const exp = (i: Interval): Interval => ({ est: Math.exp(i.est), lo: Math.exp(i.lo), hi: Math.exp(i.hi) });
  const nan: Interval = { est: NaN, lo: NaN, hi: NaN };
  const out: Decision = { decision: 'need-more-tasks', token: nan, time: nan, safety: nan, nConfirm: confirm.length, dropped, reasons: [] };
  if (tok.length < 2) {
    out.reasons.push('Chưa đủ bài có cả hai nhánh trong pha xác nhận (cần ≥ 2)');
    return out;
  }
  out.token = exp(pairedCi(tok));
  out.time = exp(pairedCi(wall));
  out.safety = pairedCi(saf);
  const tokLimit = kind === 'collect' ? 1.05 : 0.95;
  if (!(out.token.hi < tokLimit)) out.reasons.push(`Token: cận trên B/A ${out.token.hi.toFixed(3)} ≥ ${tokLimit}`);
  if (!(out.time.hi < 1.05)) out.reasons.push(`Thời gian: cận trên B/A ${out.time.hi.toFixed(3)} ≥ 1,05`);
  if (!(out.safety.lo >= -0.02)) out.reasons.push(`An toàn: cận dưới ${(out.safety.lo * 100).toFixed(1)} điểm % < −2`);
  out.decision = out.reasons.length ? 'fail' : 'pass';
  return out;
}

// ───────────────────────── Bước 5–7 — Duyệt, áp dụng, theo dõi ─────────────────────────

const sha256 = (s: string | Buffer): string => crypto.createHash('sha256').update(s).digest('hex');
function safePid(pid: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(pid) || pid.includes(String('.').repeat(2))) throw new Error(`Mã đề xuất không hợp lệ: ${pid}`);
  return pid;
}
const propDir = (dataDir: string, pid: string, ...p: string[]): string => siPath(dataDir, 'proposals', safePid(pid), ...p);

export interface Screening {
  ok: boolean;
  violations: string[];
}

const FORBIDDEN_FILES = [
  /^src\/tools\/(claude-guard|guard-paths|shell-policy|workspace)\.ts$/,
  /^src\/(config|logger|selfimprove)\.ts$/,
  /^src\/util\/redact\.ts$/,
  /^\.claude\//,
  /(^|\/)settings[^/]*\.json$/,
  /^(AGENTS|CLAUDE)\.md$/,
  /^docs\/data-protection-assessment\.md$/,
];
const ALLOWED_TARGETS = [/^src\/prompts\.ts$/, /^agents\/[^/]+\/[^/]+\.md$/];
const FORBIDDEN_TEXT: [RegExp, string][] = [
  [/CLASSIFICATION_RULE/, 'CLASSIFICATION_RULE'],
  [/Phân loại dữ liệu của nhiệm vụ/, 'dòng "Phân loại dữ liệu của nhiệm vụ"'],
  [/Quy tắc chung/, 'mục "Quy tắc chung"'],
  [/\b(dataProtection|allowedRuntimes|hashChain|denyCommands)\b/, 'chính sách dữ liệu/runtime'],
  [/\b(redact\w*|guard|hook|access|runtime)\b/, 'từ khóa bảo vệ (redact/guard/hook/access/runtime)'],
  [/\btools:|^[+-]\s*"?tools"?\s*:/m, 'quyền công cụ (tools:)'],
];

/**
 * Thuần: loại bản vá chạm vùng cấm (spec §4 điểm 2). Mục nào không xác định được thì loại. Có `deps` + `pid` và không ok thì ghi
 * `selfimprove.rejected {pid, by:'auto', violations}`.
 */
export function screenPatch(patch: string, deps?: Pick<Deps, 'logs'>, pid?: string): Screening {
  const violations: string[] = [];
  const norm = patch.replace(/\r\n/g, '\n');
  if (!norm.trim()) violations.push('Bản vá rỗng');
  if (/^GIT binary patch$/m.test(norm) || /^Binary files /m.test(norm)) violations.push('Bản vá nhị phân');
  const files = new Set<string>();
  for (const m of norm.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) {
    files.add(m[1]);
    files.add(m[2]);
  }
  if (!files.size) for (const m of norm.matchAll(/^\+\+\+ b\/(\S+)$/gm)) files.add(m[1]);
  if (!files.size && norm.trim()) violations.push('Không xác định được tệp bị chạm');
  if (files.size > 1) violations.push(`Chạm ${files.size} tệp (chỉ cho phép một)`);
  for (const f of files) {
    if (f.split('/').includes(String('.').repeat(2)) || f.startsWith('/')) violations.push(`Đường dẫn không an toàn: ${f}`);
    else if (FORBIDDEN_FILES.some((re) => re.test(f))) violations.push(`Tệp bị cấm: ${f}`);
    else if (!ALLOWED_TARGETS.some((re) => re.test(f))) violations.push(`Tệp ngoài phạm vi cho phép (src/prompts.ts, agents/<phòng>/<id>.md): ${f}`);
  }
  const body = norm.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l)).join('\n');
  for (const [re, label] of FORBIDDEN_TEXT) if (re.test(body)) violations.push(`Chạm ${label}`);
  const out = { ok: violations.length === 0, violations: [...new Set(violations)] };
  if (!out.ok && deps && pid) deps.logs.write({ level: 'warn', kind: 'selfimprove.rejected', msg: `Loại tự động ${pid}`, data: { pid, by: 'auto', violations: out.violations } });
  return out;
}

/** Tệp duy nhất mà bản vá chạm (hoặc null). */
const targetOf = (patch: string): string | null => /^diff --git a\/(\S+) b\//m.exec(patch.replace(/\r\n/g, '\n'))?.[1] ?? null;

/** Lưu bản vá + meta, ghi `selfimprove.proposed {pid, patchSha256}`, rồi sàng lọc (không ok ⇒ thêm `rejected {by:'auto'}`). */
export function recordProposed(pid: string, patch: string, meta: ProposalMeta & { hypothesis?: string }, deps: Pick<Deps, 'logs' | 'dataDir'>): Screening {
  const dir = propDir(deps.dataDir, pid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'patch.diff'), patch, 'utf8');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, pid }, null, 2), 'utf8');
  deps.logs.write({ level: 'info', kind: 'selfimprove.proposed', msg: `Đề xuất ${pid}`, data: { pid, patchSha256: sha256(patch), clusterId: meta.clusterId, author: meta.author, target: targetOf(patch) } });
  return screenPatch(patch, deps, pid);
}

/** Ghi kết quả A/B để giao diện hiển thị. deltaPass = ước lượng hiệu tỉ lệ test ẩn đạt (B−A). */
export function recordAbDecision(pid: string, d: Decision, deps: Pick<Deps, 'logs'>): void {
  deps.logs.write({ level: 'info', kind: 'selfimprove.ab.decided', msg: `A/B ${pid}: ${d.decision}`, data: { pid, deltaPass: Number.isFinite(d.safety.est) ? d.safety.est : null, decision: d.decision } });
}

/** Ghi quyết định của giám đốc; `by:'director'` cố định vì chỉ route đã xác thực mới được gọi hàm này (agent không có đường tới). */
export function recordDirector(kind: 'approved' | 'rejected' | 'rollback.confirmed', pid: string, deps: Pick<Deps, 'logs'>, reason?: string): SystemEvent {
  safePid(pid);
  const data: Record<string, unknown> = { pid, by: 'director' };
  if (reason) data.reason = clip(reason, 300);
  deps.logs.write({ level: 'info', kind: `selfimprove.${kind}`, msg: `Giám đốc: ${kind} ${pid}`, data });
  return { kind: `selfimprove.${kind}`, data };
}

const PID_KINDS = ['selfimprove.proposed', 'selfimprove.approved', 'selfimprove.rejected', 'selfimprove.applied', 'selfimprove.apply.failed', 'selfimprove.rollback.proposed', 'selfimprove.rollback.confirmed', 'selfimprove.rolledback', 'selfimprove.ab.started', 'selfimprove.ab.decided', 'selfimprove.monitor'];
const forPid = (evs: SystemEvent[], pid: string): SystemEvent[] => evs.filter((e) => e.data?.pid === pid);

export type ProposalStatus = 'proposed' | 'rejected' | 'approved' | 'applied' | 'rollback.proposed' | 'rolledback';
/** Trạng thái theo sự kiện của một pid, đọc theo thứ tự ghi. `approved` chỉ tính khi by:'director'. */
export function proposalStatus(evs: SystemEvent[]): ProposalStatus | null {
  let st: ProposalStatus | null = null;
  for (const e of evs) {
    if (e.kind === 'selfimprove.proposed') st = 'proposed';
    else if (e.kind === 'selfimprove.rejected') st = 'rejected';
    else if (e.kind === 'selfimprove.approved' && e.data?.by === 'director' && (st === 'proposed' || st === null)) st = 'approved';
    else if (e.kind === 'selfimprove.applied') st = 'applied';
    else if (e.kind === 'selfimprove.rollback.proposed' && st === 'applied') st = 'rollback.proposed';
    else if (e.kind === 'selfimprove.rolledback') st = 'rolledback';
  }
  return st;
}

export interface ProposalView {
  id: string;
  cluster: string | null;
  targetFile: string | null;
  status: ProposalStatus;
  screening: Screening;
  ab: { screenRuns: number; confirmRuns: number; maxConfirmRuns: number; result: null | { deltaPass: number | null; decision: string } };
  /** văn bản không đáng tin, đã che PII/bí mật ở server */
  agentProposal: string;
  diff: string;
}

/** Hợp đồng GET /api/selfimprove/proposals. agentProposal và diff đã qua redact() (secrets + pii) ở đây, không dựa vào client. */
export function listProposals(deps: Pick<Deps, 'cfg' | 'logs' | 'dataDir'>): ProposalView[] {
  let ids: string[] = [];
  try {
    ids = fs.readdirSync(siPath(deps.dataDir, 'proposals'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
  const evs = readEvents(deps, PID_KINDS);
  const incidents = loadIncidents(deps.dataDir);
  const out: ProposalView[] = [];
  for (const id of ids) {
    const mine = forPid(evs, id);
    const status = proposalStatus(mine);
    if (!status) continue;
    let meta: Partial<ProposalMeta> = {};
    let patch = '';
    try {
      meta = JSON.parse(fs.readFileSync(propDir(deps.dataDir, id, 'meta.json'), 'utf8'));
      patch = fs.readFileSync(propDir(deps.dataDir, id, 'patch.diff'), 'utf8');
    } catch {
      /* thiếu tệp: vẫn hiện với trường rỗng */
    }
    let prop = '';
    if (meta.clusterId) {
      try {
        const c = JSON.parse(fs.readFileSync(siPath(deps.dataDir, 'clusters', `${meta.clusterId}.json`), 'utf8')) as Cluster;
        prop = incidents.filter((i) => c.incidents.includes(i.id) && i.agentProposal).map((i) => i.agentProposal).join('\n---\n');
      } catch {
        /* chưa có cụm */
      }
    }
    const decided = mine.filter((e) => e.kind === 'selfimprove.ab.decided').pop();
    const started = mine.filter((e) => e.kind === 'selfimprove.ab.started');
    out.push({
      id,
      cluster: meta.clusterId ?? null,
      targetFile: targetOf(patch),
      status,
      screening: screenPatch(patch),
      ab: {
        screenRuns: started.filter((e) => e.data?.phase === 'screen').length,
        confirmRuns: started.filter((e) => e.data?.phase === 'confirm').length,
        maxConfirmRuns: deps.cfg.ab.maxConfirmRunsPerLock,
        result: decided ? { deltaPass: (decided.data?.deltaPass as number | null) ?? null, decision: String(decided.data?.decision) } : null,
      },
      agentProposal: redact(prop, { secrets: true, pii: true }),
      diff: redact(patch, { secrets: true, pii: true }),
    });
  }
  return out;
}

export interface ApplyOptions {
  /** Chạy typecheck/test trên cây đã áp; trả lý do lỗi hoặc null nếu đạt. Mặc định `npm run typecheck` rồi `npm test`. */
  verify?: (root: string) => string | null;
}

function defaultVerify(root: string): string | null {
  for (const args of [['run', 'typecheck'], ['test']]) {
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 900_000, shell: process.platform === 'win32' });
    if (r.status !== 0) return `npm ${args.join(' ')} lỗi: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-400)}`;
  }
  return null;
}

const nextTagNo = (root: string): number => Math.max(0, ...git(root, ['tag', '--list', 'prompts-v*'], 15_000).out.split('\n').map((x) => Number(/^prompts-v(\d+)$/.exec(x.trim())?.[1] ?? 0))) + 1;

/** Kiểm chuỗi băm nhật ký hệ thống (đồng bộ). */
const chainOk = (deps: Pick<Deps, 'logs'>): boolean => verifyChain(deps.logs.fileFor('system')).ok;

/**
 * Chỉ áp khi LogStore (đọc lại, không tin tham số) có `selfimprove.approved {by:'director'}` còn hiệu lực, chuỗi băm hợp lệ,
 * sha256(patch.diff) khớp `selfimprove.proposed` và screenPatch vẫn ok (CT-07, CT-08). Một commit riêng chỉ chứa tệp bị vá + thẻ prompts-vN.
 * Không reset --hard, không push. Lỗi apply/verify ⇒ hoàn tác bằng `git apply -R`, ghi `apply.failed`, ném lỗi. Không có timer tự duyệt.
 */
export function applyApproved(pid: string, deps: Deps, opts: ApplyOptions = {}): { commit: string; tag: string } {
  safePid(pid);
  if (!deps.cfg.enabled) throw new Error('Vòng tự cải thiện đang tắt (selfImprove.enabled=false)');
  if (!chainOk(deps)) throw new Error('Chuỗi băm nhật ký hệ thống không hợp lệ: không áp dụng');
  const mine = forPid(readEvents(deps, PID_KINDS), pid);
  const proposed = mine.filter((e) => e.kind === 'selfimprove.proposed').pop();
  if (!proposed) throw new Error(`Chưa có đề xuất ${pid} trong nhật ký`);
  if (proposalStatus(mine) !== 'approved') throw new Error(`Đề xuất ${pid} chưa được giám đốc duyệt (hoặc đã bị từ chối/áp/rollback)`);
  const patchFile = propDir(deps.dataDir, pid, 'patch.diff');
  let patch = '';
  try {
    patch = fs.readFileSync(patchFile, 'utf8');
  } catch {
    throw new Error(`Thiếu patch.diff của ${pid}`);
  }
  if (sha256(patch) !== proposed.data?.patchSha256) throw new Error(`sha256 của bản vá khác bản đã đề xuất (${pid}): không áp dụng`);
  const scr = screenPatch(patch);
  if (!scr.ok) throw new Error(`Bản vá vi phạm danh sách cấm: ${scr.violations.join('; ')}`);
  const target = targetOf(patch)!;
  const fail = (reason: string, undo: boolean): never => {
    if (undo) git(deps.root, ['apply', '-R', '--whitespace=nowarn', patchFile], 30_000);
    deps.logs.write({ level: 'warn', kind: 'selfimprove.apply.failed', msg: `Áp ${pid} lỗi`, data: { pid, reason: clip(reason, 300) } });
    throw new Error(`Áp dụng ${pid} thất bại: ${reason}`);
  };
  const chk = git(deps.root, ['apply', '--check', '--whitespace=nowarn', patchFile], 30_000);
  if (!chk.ok) fail(`git apply --check: ${chk.out}`, false);
  const ap = git(deps.root, ['apply', '--whitespace=nowarn', patchFile], 30_000);
  if (!ap.ok) fail(`git apply: ${ap.out}`, false);
  const bad = (opts.verify ?? defaultVerify)(deps.root);
  if (bad) fail(bad, true);
  let hyp = '';
  try {
    hyp = clip((JSON.parse(fs.readFileSync(propDir(deps.dataDir, pid, 'meta.json'), 'utf8')) as { hypothesis?: string }).hypothesis, 80);
  } catch {
    /* không có giả thuyết */
  }
  const cid = clusterIdOf(deps.dataDir, pid);
  const add = git(deps.root, ['add', '--', target], 30_000);
  if (!add.ok) fail(`git add: ${add.out}`, true);
  const cm = git(deps.root, [...identity(deps.root), 'commit', '--no-verify', '-m', `selfimprove: ${pid} ${cid} ${hyp}`.trim()], 120_000);
  if (!cm.ok) fail(`git commit: ${cm.out}`, true);
  const commit = git(deps.root, ['rev-parse', 'HEAD'], 15_000).out.trim();
  const tag = `prompts-v${nextTagNo(deps.root)}`;
  git(deps.root, [...identity(deps.root), 'tag', tag, commit], 15_000);
  deps.logs.write({ level: 'info', kind: 'selfimprove.applied', msg: `Đã áp ${pid}`, data: { pid, commit, tag, target } });
  return { commit, tag };
}
function clusterIdOf(dataDir: string, pid: string): string {
  try {
    return (JSON.parse(fs.readFileSync(propDir(dataDir, pid, 'meta.json'), 'utf8')) as ProposalMeta).clusterId ?? '';
  } catch {
    return '';
  }
}

/**
 * Chưa có `selfimprove.rollback.confirmed {by:'director'}` sau lần `applied` ⇒ CHỈ ghi `rollback.proposed`, không revert (CT-16).
 * Có xác nhận ⇒ `git revert --no-edit <commit>`, thẻ prompts-vN+1, ghi `rolledback {revertCommit, by:'director'}`.
 */
export function rollback(pid: string, deps: Deps, reason = 'Giám đốc yêu cầu'): { reverted: boolean; revertCommit?: string; tag?: string } {
  safePid(pid);
  if (!deps.cfg.enabled) throw new Error('Vòng tự cải thiện đang tắt (selfImprove.enabled=false)');
  const mine = forPid(readEvents(deps, PID_KINDS), pid);
  const st = proposalStatus(mine);
  if (st !== 'applied' && st !== 'rollback.proposed') throw new Error(`Đề xuất ${pid} chưa được áp dụng hoặc đã rollback`);
  const appliedIdx = mine.map((e) => e.kind).lastIndexOf('selfimprove.applied');
  const applied = mine[appliedIdx];
  const confirmed = mine.slice(appliedIdx).some((e) => e.kind === 'selfimprove.rollback.confirmed' && e.data?.by === 'director');
  if (!confirmed || !chainOk(deps)) {
    if (st !== 'rollback.proposed') deps.logs.write({ level: 'info', kind: 'selfimprove.rollback.proposed', msg: `Đề nghị rollback ${pid}`, data: { pid, reason: clip(reason, 200), severity: 'strong' } });
    return { reverted: false };
  }
  const commit = String(applied.data?.commit ?? '');
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('Commit đã áp không hợp lệ trong nhật ký');
  const rv = git(deps.root, [...identity(deps.root), 'revert', '--no-edit', commit], 120_000);
  if (!rv.ok) {
    git(deps.root, ['revert', '--abort'], 15_000);
    throw new Error(`git revert thất bại: ${rv.out.slice(0, 300)}`);
  }
  const revertCommit = git(deps.root, ['rev-parse', 'HEAD'], 15_000).out.trim();
  const tag = `prompts-v${nextTagNo(deps.root)}`;
  git(deps.root, [...identity(deps.root), 'tag', tag, revertCommit], 15_000);
  deps.logs.write({ level: 'info', kind: 'selfimprove.rolledback', msg: `Đã rollback ${pid}`, data: { pid, revertCommit, tag, by: 'director' } });
  return { reverted: true, revertCommit, tag };
}

export interface TaskMetric {
  taskId: string;
  /** tỉ lệ lệnh kiểm tra đạt 0..1 */
  checkPassRate: number;
  /** 1 nếu đạt ngay lần đầu */
  firstPassOk: number;
}
export interface MonitorSource {
  /** `monitorTasks` nhiệm vụ thật đầu tiên sau lúc áp */
  after: TaskMetric[];
  /** `baselineTasks` nhiệm vụ gần nhất trước đó */
  before: TaskMetric[];
  /** check.regression mới xuất hiện sau lúc áp */
  regressions: { agentId: string; taskId: string }[];
}

/** agents/<phòng>/<id>.md ⇒ id; src/prompts.ts ⇒ null (ảnh hưởng mọi agent). */
function patchedAgent(patch: string): string | null {
  const t = targetOf(patch);
  const m = t && /^agents\/[^/]+\/([^/]+)\.md$/.exec(t);
  return m ? m[1] : null;
}

/**
 * Theo dõi sau áp (không LLM, không revert). Chưa đủ `monitorTasks` nhiệm vụ ⇒ null. Ghi monitor.json và `selfimprove.monitor`.
 * check.regression của agent bị vá ⇒ `rollback.proposed` severity 'strong'; chỉ thấp hơn trung bình (n nhỏ, báo giả cao) ⇒ 'early' (CT-20).
 * Nguồn số liệu (computeKpi, check.regression) do bên gọi cấp qua `src`; module không đọc KPI.
 */
export function monitorApplied(pid: string, src: MonitorSource, deps: Deps): { severity: 'early' | 'strong' | null } | null {
  safePid(pid);
  if (!deps.cfg.enabled) return null;
  const st = proposalStatus(forPid(readEvents(deps, PID_KINDS), pid));
  if (st !== 'applied' && st !== 'rollback.proposed') return null; // đã có phiếu 'early' thì vẫn nhận thêm bằng chứng để nâng lên 'strong'
  if (src.after.length < deps.cfg.monitorTasks || !src.before.length) return null;
  const avg = (a: TaskMetric[], f: (m: TaskMetric) => number): number => mean(a.map(f));
  const metrics = {
    checkPassRate: { before: avg(src.before, (m) => m.checkPassRate), after: avg(src.after, (m) => m.checkPassRate) },
    firstPassOk: { before: avg(src.before, (m) => m.firstPassOk), after: avg(src.after, (m) => m.firstPassOk) },
  };
  let patch = '';
  try {
    patch = fs.readFileSync(propDir(deps.dataDir, pid, 'patch.diff'), 'utf8');
  } catch {
    /* không còn bản vá: coi như vá mọi agent */
  }
  const who = patchedAgent(patch);
  const own = src.regressions.filter((r) => who === null || r.agentId === who);
  const lower = metrics.checkPassRate.after < metrics.checkPassRate.before || metrics.firstPassOk.after < metrics.firstPassOk.before;
  const severity: 'early' | 'strong' | null = own.length ? 'strong' : lower ? 'early' : null;
  const n = src.after.length;
  fs.writeFileSync(propDir(deps.dataDir, pid, 'monitor.json'), JSON.stringify({ pid, n, metrics, regressions: own.length, severity }, null, 2), 'utf8');
  deps.logs.write({ level: 'info', kind: 'selfimprove.monitor', msg: `Theo dõi ${pid}`, data: { pid, n, metrics } });
  if (severity) {
    const reason = severity === 'strong' ? `Có ${own.length} check.regression mới thuộc agent bị vá` : `n = ${n}, thấp hơn trung bình ${src.before.length} nhiệm vụ trước; tỉ lệ báo giả cao — nên kéo dài theo dõi (monitorTasks 5–10)`;
    deps.logs.write({ level: 'warn', kind: 'selfimprove.rollback.proposed', msg: `Đề nghị rollback ${pid} (${severity})`, data: { pid, reason, severity } });
  }
  return { severity };
}

const DAY_MS = 86_400_000;
/** Sàn lưu giữ nhật ký xử lý DLCN: 6 tháng (AGENTS.md) ≈ 183 ngày. */
export const MIN_RETENTION_DAYS = 183;

/**
 * Dọn tệp dưới data/self-improve/ theo retentionDays nhưng không bao giờ xóa tệp trẻ hơn 183 ngày (CT-11).
 * Chỉ xóa tệp thường, không theo liên kết. Trả danh sách tệp đã xóa (tương đối so với data/self-improve/).
 */
export function purgeExpired(dataDir: string, retentionDays: number, now = Date.now()): string[] {
  const days = Math.max(MIN_RETENTION_DAYS, Number.isFinite(retentionDays) ? retentionDays : MIN_RETENTION_DAYS);
  const root = siPath(dataDir);
  if (!fs.existsSync(root)) return [];
  const removed: string[] = [];
  const visit = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(f);
      else if (e.isFile() && now - fs.statSync(f).mtimeMs > days * DAY_MS) {
        fs.rmSync(f);
        removed.push(path.relative(root, f).split(path.sep).join('/'));
      }
    }
  };
  visit(root);
  return removed;
}
