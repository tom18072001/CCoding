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
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { LogStore } from './logger.js';
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
