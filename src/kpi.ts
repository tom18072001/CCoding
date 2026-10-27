import type { Config } from './config.js';
import type { Registry } from './registry.js';
import type { Store } from './store.js';
import type { AgentDef, ChatMessage, ProjectDef, Task, ToolAccess, ToolCallRecord } from './types.js';
import { isCheckCommand, isNoMatch } from './tools/workspace.js';
import { readJsonl } from './util/fsx.js';

/**
 * KPI của sub-agent — chấm như nhân sự một phòng ban thật, dựa trên log đã ghi:
 *   calls.jsonl (mỗi lượt gọi: token, công cụ, lỗi, chẩn đoán, văn bản trả về), task.json (hạng mục, số lần chạy),
 *   transcript (mọi vòng review: lỗi blocker/major/minor theo hạng mục → người phụ trách).
 * Bốn nhóm điểm (0–100): Chất lượng (qua review lần đầu, ít blocker) · Hiệu quả (token/hạng mục so với đồng nghiệp, số lần làm lại)
 * · Tin cậy (lượt gọi hỏng, thao tác công cụ lỗi, chạm trần vòng công cụ) · Tuân thủ (đủ mục trong "Mẫu đầu ra" của agent.md,
 * có bằng chứng: lệnh kiểm chứng với agent chạy lệnh, nguồn DOI/URL với agent tra cứu).
 * Điểm tổng = trung bình có trọng số (40/25/20/15) trên các nhóm có dữ liệu. Kèm "việc cần sửa" sinh tự động theo ngưỡng.
 */

export interface CallRow {
  ts: string;
  callId: string;
  taskId: string;
  subtaskId?: string;
  department: string;
  agentId: string;
  phase: string;
  runtime: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite?: number;
  durationMs: number;
  error?: string;
  errorKind?: string;
  attempts?: Array<{ kind: string; ms?: number }>;
  turns?: number;
  truncated?: boolean;
  diag?: string;
  tools?: ToolCallRecord[];
  text?: string;
}

export interface KpiSource {
  tasks: Task[];
  calls(taskId: string): CallRow[];
  transcript(taskId: string): ChatMessage[];
  project(id: string): ProjectDef | undefined;
  agent(id: string): AgentDef | undefined;
  /** Quyền công cụ thực tế của nhiệm vụ (để biết agent có được chạy lệnh không). */
  access(task: Task): ToolAccess;
}

export interface AgentKpi {
  agentId: string;
  name: string;
  department: string;
  role: string;
  tasks: number;
  calls: number;
  /** Lượt gọi hỏng do chính agent/đầu ra (rỗng, quá ngữ cảnh, lỗi khác) — tính vào KPI. */
  failedCalls: number;
  /** Lượt gọi hỏng do hạ tầng (hạn mức, giới hạn tốc độ, đăng nhập, mạng) — KHÔNG tính vào KPI của agent. */
  infraFailedCalls: number;
  failovers: number;
  phases: Record<string, number>;
  subtasks: number;
  attemptsAvg: number;
  attemptsMax: number;
  /** perSubtask: token của các lượt gắn với hạng mục (thực thi/sửa) chia cho số hạng mục — không tính lượt review/họp/lập kế hoạch. */
  tokens: { input: number; cache: number; output: number; total: number; subtaskWork: number; perSubtask: number };
  durationSec: number;
  outTokPerSec?: number;
  tools: { calls: number; failed: number; byName: Record<string, { n: number; failed: number }>; capHits: number; avgTurns: number; maxTurns: number };
  truncated: number;
  /** reviewed: hạng mục được review; firstPassOk: không bị blocker/major ở lần review đầu; finalClean: không còn blocker ở lần review cuối; blocker/major/minor: số lần bị nêu qua mọi vòng. */
  quality: { reviewed: number; firstPassOk: number; finalClean: number; blocker: number; major: number; minor: number; topIssues: string[] };
  compliance: { outputs: number; templateCoverage?: number; missing: Array<{ heading: string; count: number }>; summaryOk: number };
  evidence: { execEligible: number; execWithCommands: number; doi: number; urls: number; unverified: number; webCalls: number };
  reviewer?: { reviews: number; issuesRaised: number; verified: number; checkable: number };
  /** Trưởng phòng: chịu trách nhiệm kết quả của phòng — budgetRatio = token thực tế / ngân sách các lượt phòng mình phụ trách. */
  lead?: { plans: number; planFallback: number; syntheses: number; budget?: number; used?: number; budgetRatio?: number };
  scores: { quality?: number; efficiency?: number; reliability?: number; compliance?: number };
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  findings: string[];
}

export interface KpiReport {
  generatedAt: string;
  tasks: Array<{ id: string; title: string; status: string; tokens: number }>;
  agents: AgentKpi[];
  departments: Array<{ id: string; agents: number; tokens: number; score: number; calls: number }>;
  method: string;
}

const WEIGHTS = { quality: 0.4, efficiency: 0.25, reliability: 0.2, compliance: 0.15 } as const;
const ISSUE_RE = /^-\s*\[(blocker|major|minor)\]\s*([A-Za-z0-9._-]+)\s*:\s*(.+)$/;
const DOI_RE = /\b10\.\d{4,9}\/[^\s)\]>,;"']+/g;
const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
const UNVERIFIED_RE = /CHƯA[ -]?(KIỂM CHỨNG|KC)|\[CẦN NGUỒN\]|chưa kiểm chứng/gi;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[`*_#:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Tiêu đề mục trong "Mẫu đầu ra" của agent.md (dòng "## …" trong khối code của mục đó). */
export function templateHeadings(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^##\s+Mẫu đầu ra/.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  let inCode = false;
  for (const l of lines.slice(start + 1)) {
    if (/^```/.test(l)) {
      if (inCode) break; // hết khối mẫu
      inCode = true;
      continue;
    }
    if (!inCode && /^##\s+/.test(l)) break; // sang mục khác của hồ sơ (mẫu không nằm trong khối code)
    if (/^##\s+/.test(l)) out.push(l.replace(/^##\s+/, '').trim());
  }
  return out.filter(Boolean);
}

/** Khóa so khớp một mục mẫu: phần trước "(", "·", ":" hoặc "—". */
function headingKey(h: string): string {
  return norm(h.split(/[(·:—<]/)[0]).slice(0, 28);
}

/** Tỉ lệ mục của mẫu có mặt trong đầu ra + các mục còn thiếu. */
export function templateCoverage(text: string, headings: string[]): { coverage: number; missing: string[] } {
  if (!headings.length) return { coverage: 1, missing: [] };
  const present = text
    .split('\n')
    .filter((l) => /^#{1,4}\s+/.test(l))
    .map((l) => norm(l.replace(/^#{1,4}\s+/, '')));
  const missing = headings.filter((h) => {
    const k = headingKey(h);
    return k.length > 2 && !present.some((p) => p.startsWith(k) || p.includes(k));
  });
  return { coverage: (headings.length - missing.length) / headings.length, missing };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Acc {
  k: AgentKpi;
  taskIds: Set<string>;
  turns: number[];
  coverage: number[];
  missing: Map<string, number>;
  issueTexts: string[];
  attempts: number[];
  outputs: number;
}

export function computeKpi(src: KpiSource): KpiReport {
  const acc = new Map<string, Acc>();
  const get = (id: string, dept: string): Acc => {
    let a = acc.get(id);
    if (!a) {
      const def = src.agent(id);
      a = {
        k: {
          agentId: id,
          name: def?.name ?? id,
          department: def?.department ?? dept,
          role: def?.role ?? 'member',
          tasks: 0,
          calls: 0,
          failedCalls: 0,
          infraFailedCalls: 0,
          failovers: 0,
          phases: {},
          subtasks: 0,
          attemptsAvg: 0,
          attemptsMax: 0,
          tokens: { input: 0, cache: 0, output: 0, total: 0, subtaskWork: 0, perSubtask: 0 },
          durationSec: 0,
          tools: { calls: 0, failed: 0, byName: {}, capHits: 0, avgTurns: 0, maxTurns: 0 },
          truncated: 0,
          quality: { reviewed: 0, firstPassOk: 0, finalClean: 0, blocker: 0, major: 0, minor: 0, topIssues: [] },
          compliance: { outputs: 0, missing: [], summaryOk: 0 },
          evidence: { execEligible: 0, execWithCommands: 0, doi: 0, urls: 0, unverified: 0, webCalls: 0 },
          scores: {},
          score: 0,
          grade: 'C',
          findings: [],
        },
        taskIds: new Set(),
        turns: [],
        coverage: [],
        missing: new Map(),
        issueTexts: [],
        attempts: [],
        outputs: 0,
      };
      acc.set(id, a);
    }
    return a;
  };

  const taskRows: KpiReport['tasks'] = [];
  /** Ngân sách và token thực tế theo phòng (để chấm trưởng phòng: kế hoạch có vừa ngân sách không). */
  const deptBudget = new Map<string, { budget: number; used: number }>();
  for (const task of src.tasks) {
    for (const run of task.runs) {
      const b = deptBudget.get(run.department) ?? { budget: 0, used: 0 };
      b.budget += task.options.budgetTokens / Math.max(1, task.runs.length);
      b.used += run.usage.input + run.usage.output + run.usage.cacheRead + (run.usage.cacheWrite ?? 0);
      deptBudget.set(run.department, b);
    }
    const calls = src.calls(task.id);
    const transcript = src.transcript(task.id);
    const exec = src.access(task) === 'exec';
    let tokens = 0;
    // ── lượt gọi ──
    for (const r of calls) {
      if (!r.agentId) continue;
      const a = get(r.agentId, r.department);
      const k = a.k;
      a.taskIds.add(task.id);
      k.calls++;
      k.phases[r.phase] = (k.phases[r.phase] ?? 0) + 1;
      const failed = !!r.error && !r.text;
      if (failed) {
        if (isInfra(r)) k.infraFailedCalls++;
        else k.failedCalls++;
      }
      k.failovers += (r.attempts ?? []).length;
      k.tokens.input += r.input ?? 0;
      k.tokens.cache += r.cacheRead ?? 0;
      k.tokens.output += r.output ?? 0;
      if (r.subtaskId && (r.phase === 'execute' || r.phase === 'revise')) k.tokens.subtaskWork += (r.input ?? 0) + (r.cacheRead ?? 0) + (r.output ?? 0);
      tokens += (r.input ?? 0) + (r.cacheRead ?? 0) + (r.output ?? 0) + (r.cacheWrite ?? 0);
      k.durationSec += (r.durationMs ?? 0) / 1000;
      if (r.truncated || (r.output && (r.output === 8000 || r.output === 64000) && !r.tools?.length && r.phase !== 'plan')) k.truncated++;
      if (r.diag && /chạm trần/.test(r.diag)) k.tools.capHits++;
      if (r.turns && r.turns > 1) a.turns.push(r.turns);
      for (const tc of r.tools ?? []) {
        k.tools.calls++;
        const b = (k.tools.byName[tc.name] ??= { n: 0, failed: 0 });
        b.n++;
        if (!tc.ok && !isNoMatch(tc)) {
          k.tools.failed++;
          b.failed++;
        }
        if (tc.name === 'search_papers' || tc.name === 'web_search' || tc.name === 'fetch_url') k.evidence.webCalls++;
      }
      // sản phẩm (thực thi/sửa; báo cáo tổng hợp của trưởng phòng) — tuân thủ mẫu đầu ra & bằng chứng
      if ((r.phase === 'execute' || r.phase === 'revise' || r.phase === 'synthesize') && r.text) {
        a.outputs++;
        const def = src.agent(r.agentId);
        const heads = def ? templateHeadings(def.body) : [];
        const cov = templateCoverage(r.text, heads);
        a.coverage.push(cov.coverage);
        for (const m of cov.missing) a.missing.set(m, (a.missing.get(m) ?? 0) + 1);
        if (/^#{1,3}\s*Tóm tắt/im.test(r.text)) k.compliance.summaryOk++;
        k.evidence.doi += new Set(r.text.match(DOI_RE) ?? []).size;
        k.evidence.urls += new Set(r.text.match(URL_RE) ?? []).size;
        k.evidence.unverified += (r.text.match(UNVERIFIED_RE) ?? []).length;
        const canRun = exec && (def?.tools ?? []).some((t) => t.toLowerCase() === 'bash');
        if (canRun && r.phase === 'execute') {
          k.evidence.execEligible++;
          if ((r.tools ?? []).some((tc) => tc.name === 'run_command' && isCheckCommand(tc.args))) k.evidence.execWithCommands++;
        }
      }
      if (r.phase === 'review' && r.text) {
        const rv = (k.reviewer ??= { reviews: 0, issuesRaised: 0, verified: 0, checkable: 0 });
        rv.reviews++;
        const def = src.agent(r.agentId);
        // kiểm chứng được: có quyền chạy lệnh trong repo, hoặc đã có công cụ (đọc tệp/tra nguồn) trong lượt review
        const canRun = exec && (def?.tools ?? []).some((t) => t.toLowerCase() === 'bash');
        const used = r.tools ?? [];
        if (canRun || used.length) rv.checkable++;
        if (canRun ? used.some((tc) => tc.name === 'run_command' && isCheckCommand(tc.args)) : used.some((tc) => ['fetch_url', 'search_papers', 'web_search', 'read_file', 'list_files', 'search'].includes(tc.name))) rv.verified++;
      }
      if (r.phase === 'plan') (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).plans++;
      if (r.phase === 'synthesize' && r.text) (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).syntheses++;
    }
    taskRows.push({ id: task.id, title: task.title, status: task.status, tokens });

    // ── hạng mục: số lần chạy, người phụ trách ──
    const owner = new Map<string, string>();
    for (const run of task.runs) {
      for (const st of run.subtasks) {
        owner.set(`${run.department}:${st.id}`, st.assignee);
        if (st.splitTo && !st.attempts) continue;
        const a = get(st.assignee, run.department);
        a.taskIds.add(task.id);
        a.k.subtasks++;
        a.attempts.push(st.attempts);
      }
    }
    // ── các vòng review (từ hội thoại): lần đầu = qua review lần đầu? lần cuối = còn blocker? ──
    const reviews = new Map<string, Array<Array<{ sev: string; sid: string; comment: string }>>>();
    for (const m of transcript) {
      if (m.kind === 'plan' && /kế hoạch dự phòng/.test(m.text) && m.from) {
        const l = get(m.from, m.department);
        (l.k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 }).planFallback++;
      }
      if (m.kind !== 'review' || /Không đọc được kết quả review|Không đọc được kết luận review/.test(m.text)) continue;
      const rv = get(m.from, m.department);
      const issues: Array<{ sev: string; sid: string; comment: string }> = [];
      for (const line of m.text.split('\n')) {
        const im = ISSUE_RE.exec(line.trim());
        if (!im) continue;
        const [, sev, sid, comment] = im;
        issues.push({ sev, sid, comment });
        if (rv.k.reviewer) rv.k.reviewer.issuesRaised++;
        const who = owner.get(`${m.department}:${sid}`);
        if (who) get(who, m.department).k.quality[sev as 'blocker' | 'major' | 'minor']++;
      }
      (reviews.get(m.department) ?? reviews.set(m.department, []).get(m.department)!).push(issues);
    }
    for (const [dept, list] of reviews) {
      const first = list[0];
      const last = list[list.length - 1];
      for (const run of task.runs.filter((r) => r.department === dept))
        for (const st of run.subtasks) {
          if (!st.output && !st.attempts) continue;
          const a = get(st.assignee, dept);
          a.k.quality.reviewed++;
          if (!first.some((i) => i.sid === st.id && i.sev !== 'minor')) a.k.quality.firstPassOk++;
          if (!last.some((i) => i.sid === st.id && i.sev === 'blocker')) a.k.quality.finalClean++;
          for (const i of last) if (i.sid === st.id && i.sev !== 'minor') a.issueTexts.push(`${st.id} [${i.sev}]: ${i.comment.slice(0, 140)}`);
        }
    }
  }

  // ── tổng hợp & chấm điểm ──
  const list = [...acc.values()];
  for (const a of list) {
    const k = a.k;
    k.tasks = a.taskIds.size;
    k.tokens.total = k.tokens.input + k.tokens.cache + k.tokens.output;
    k.tokens.perSubtask = k.subtasks ? Math.round(k.tokens.subtaskWork / k.subtasks) : 0;
    k.attemptsAvg = a.attempts.length ? Math.round((a.attempts.reduce((s, x) => s + x, 0) / a.attempts.length) * 10) / 10 : 0;
    k.attemptsMax = a.attempts.length ? Math.max(...a.attempts) : 0;
    k.tools.avgTurns = a.turns.length ? Math.round((a.turns.reduce((s, x) => s + x, 0) / a.turns.length) * 10) / 10 : 0;
    k.tools.maxTurns = a.turns.length ? Math.max(...a.turns) : 0;
    k.outTokPerSec = k.durationSec > 0 ? Math.round(k.tokens.output / k.durationSec) : undefined;
    k.durationSec = Math.round(k.durationSec);
    k.compliance.outputs = a.outputs;
    k.compliance.templateCoverage = a.coverage.length ? Math.round((a.coverage.reduce((s, x) => s + x, 0) / a.coverage.length) * 100) : undefined;
    k.compliance.missing = [...a.missing.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([heading, count]) => ({ heading, count }));
    k.quality.topIssues = a.issueTexts.slice(0, 4);
  }
  // hiệu quả: token/hạng mục so với trung vị đồng nghiệp cùng phòng (thành viên có hạng mục)
  const medByDept = new Map<string, number>();
  for (const d of new Set(list.map((a) => a.k.department))) medByDept.set(d, median(list.filter((a) => a.k.department === d && a.k.subtasks > 0).map((a) => a.k.tokens.perSubtask)));
  for (const a of list) {
    const k = a.k;
    const s = k.scores;
    if (k.role === 'lead') {
      // trưởng phòng chịu trách nhiệm kết quả của phòng: chất lượng = kết quả review của các hạng mục trong phòng; hiệu quả = kế hoạch có vừa ngân sách
      const team = list.filter((x) => x.k.department === k.department && x.k.role !== 'lead').map((x) => x.k.quality);
      const reviewed = team.reduce((n, q) => n + q.reviewed, 0);
      if (reviewed) s.quality = clamp((50 * team.reduce((n, q) => n + q.firstPassOk, 0) + 50 * team.reduce((n, q) => n + q.finalClean, 0)) / reviewed);
      const b = deptBudget.get(k.department);
      if (b?.budget && b.used) {
        const lead = (k.lead ??= { plans: 0, planFallback: 0, syntheses: 0 });
        lead.budget = Math.round(b.budget);
        lead.used = Math.round(b.used);
        lead.budgetRatio = Math.round((b.used / b.budget) * 10) / 10;
        s.efficiency = clamp(100 * Math.min(1, b.budget / b.used));
      }
    } else if (k.quality.reviewed) s.quality = clamp((50 * k.quality.firstPassOk + 50 * k.quality.finalClean) / k.quality.reviewed);
    if (k.subtasks) {
      const med = medByDept.get(k.department) || k.tokens.perSubtask;
      const ratio = k.tokens.perSubtask ? med / k.tokens.perSubtask : 1;
      s.efficiency = clamp(Math.min(100, 100 * ratio) - Math.max(0, k.attemptsAvg - 2) * 15);
    }
    if (k.calls) {
      const failRate = k.failedCalls / k.calls;
      const toolFail = k.tools.calls ? k.tools.failed / k.tools.calls : 0;
      const capRate = k.tools.capHits / k.calls;
      s.reliability = clamp(100 - 120 * failRate - 80 * toolFail - 40 * capRate - 10 * Math.min(3, k.truncated));
    }
    if (k.compliance.templateCoverage !== undefined) {
      let c = k.compliance.templateCoverage;
      if (k.evidence.execEligible) c = 0.6 * c + 0.4 * ((100 * k.evidence.execWithCommands) / k.evidence.execEligible);
      else if (src.agent(k.agentId)?.tools.some((t) => /websearch|webfetch/i.test(t)) && k.department === 'research')
        c = 0.7 * c + 0.3 * (k.evidence.doi + k.evidence.urls > 0 ? 100 : 0);
      s.compliance = clamp(c);
    } else if (k.reviewer?.reviews) {
      s.compliance = clamp(k.reviewer.checkable ? (100 * k.reviewer.verified) / k.reviewer.checkable : 50);
    }
    let w = 0;
    let sum = 0;
    for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
      const v = s[key];
      if (v === undefined) continue;
      w += weight;
      sum += v * weight;
    }
    k.score = w ? Math.round(sum / w) : 0;
    k.grade = k.score >= 80 ? 'A' : k.score >= 65 ? 'B' : k.score >= 50 ? 'C' : 'D';
    k.findings = findings(k, medByDept.get(k.department) ?? 0);
  }
  list.sort((x, y) => x.k.department.localeCompare(y.k.department) || y.k.tokens.total - x.k.tokens.total);
  const departments = [...new Set(list.map((a) => a.k.department))].map((id) => {
    const ag = list.filter((a) => a.k.department === id).map((a) => a.k);
    const scored = ag.filter((k) => k.score > 0);
    return {
      id,
      agents: ag.length,
      tokens: ag.reduce((s, k) => s + k.tokens.total, 0),
      calls: ag.reduce((s, k) => s + k.calls, 0),
      score: scored.length ? Math.round(scored.reduce((s, k) => s + k.score * Math.max(1, k.tokens.total), 0) / scored.reduce((s, k) => s + Math.max(1, k.tokens.total), 0)) : 0,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    tasks: taskRows,
    agents: list.map((a) => a.k),
    departments,
    method:
      'Chất lượng 40%: nửa theo tỉ lệ hạng mục không bị blocker/major ở lần review đầu, nửa theo tỉ lệ hạng mục không còn blocker ở lần review cuối · Hiệu quả 25%: token thực thi+sửa mỗi hạng mục so với trung vị đồng nghiệp cùng phòng, trừ 15 điểm mỗi lần chạy vượt 2 · Tin cậy 20%: lượt gọi hỏng do agent (không tính lỗi hạ tầng: hạn mức, đăng nhập, mạng), thao tác công cụ lỗi, chạm trần vòng công cụ, đầu ra bị cắt · Tuân thủ 15%: đủ mục trong "Mẫu đầu ra" của agent.md + bằng chứng (lệnh kiểm chứng với agent chạy lệnh, nguồn DOI/URL với agent tra cứu; reviewer: có kiểm chứng bằng công cụ). Nhóm không có dữ liệu thì bỏ qua và chia lại trọng số.',
  };
}

export interface KpiFilter {
  tasks?: string[];
  /** Chỉ nhiệm vụ tạo trong N ngày gần đây. */
  days?: number;
  department?: string;
  project?: string;
}

/** KPI từ dữ liệu thật của CCoding (data/runs/<task>/calls.jsonl, task.json, transcript.jsonl). */
export function kpiReport(d: { store: Store; registry: Registry; config: Config }, f: KpiFilter = {}): KpiReport {
  const since = f.days ? Date.now() - f.days * 86_400_000 : 0;
  const tasks = d.store
    .list()
    .filter((t) => (!f.tasks?.length || f.tasks.includes(t.id)) && (!since || Date.parse(t.createdAt) >= since) && (!f.project || t.projectId === f.project))
    .filter((t) => t.status !== 'queued');
  const rep = computeKpi({
    tasks,
    calls: (id) => readJsonl<CallRow>(d.store.callsFile(id)),
    transcript: (id) => d.store.transcript(id),
    project: (id) => d.store.project(id),
    agent: (id) => d.registry.agents.get(id),
    access: (t) => {
      const p = t.projectId ? d.store.project(t.projectId) : undefined;
      return p ? (p.toolAccess ?? d.config.tools.projectAccess) : d.config.tools.defaultAccess;
    },
  });
  if (f.department) {
    rep.agents = rep.agents.filter((a) => a.department === f.department);
    rep.departments = rep.departments.filter((x) => x.id === f.department);
  }
  return rep;
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

/** Lỗi do hạ tầng (không phải do agent): hạn mức, giới hạn tốc độ, đăng nhập/khóa, mạng/proxy. */
function isInfra(r: CallRow): boolean {
  if (r.errorKind && ['quota', 'rate', 'auth', 'transient', 'timeout'].includes(r.errorKind)) return true;
  return /No model configured|log ?in|sign in|unauthori|api key|rate.?limit|429|quota|usage limit|connection|upstream|ECONN|socket|fetch failed|50[234]|timed? ?out|TimeoutError/i.test(r.error ?? '');
}

/** "Việc cần sửa" sinh tự động theo ngưỡng — gợi ý hướng sửa agent.md / cách giao việc. */
function findings(k: AgentKpi, med: number): string[] {
  const f: string[] = [];
  const topTool = Object.entries(k.tools.byName).sort((a, b) => b[1].failed - a[1].failed)[0];
  if (k.tools.calls >= 5 && k.tools.failed / k.tools.calls >= 0.2)
    f.push(`Thao tác công cụ lỗi nhiều (${k.tools.failed}/${k.tools.calls}, ${pct(k.tools.failed, k.tools.calls)}%${topTool ? `; nhiều nhất ở ${topTool[0]} ${topTool[1].failed}/${topTool[1].n}` : ''}) — agent.md cần bước dò môi trường/lệnh của repo trước khi chạy (scripts trong package.json, shell PowerShell/bash, dịch vụ cần bật).`);
  if (k.tools.capHits >= 1 && k.tools.capHits / k.calls >= 0.3)
    f.push(`Hay chạm trần vòng công cụ (${k.tools.capHits}/${k.calls} lượt, TB ${k.tools.avgTurns} vòng, tối đa ${k.tools.maxTurns}) — đọc quá rộng: agent.md cần quy tắc khảo sát có mục tiêu (đọc theo đoạn, không đọc lại phần đã có, ghi kết quả ra tệp sớm).`);
  if (k.attemptsAvg >= 3) f.push(`Hạng mục phải chạy nhiều lần (TB ${k.attemptsAvg}, tối đa ${k.attemptsMax}) — tiêu chí xong chưa đo được hoặc hạng mục quá lớn: tách nhỏ, ghi Definition of Done kiểm chứng được.`);
  if (k.compliance.templateCoverage !== undefined && k.compliance.templateCoverage < 70 && k.compliance.outputs)
    f.push(`Đầu ra thiếu mục trong "Mẫu đầu ra" (đủ ${k.compliance.templateCoverage}%; hay thiếu: ${k.compliance.missing.slice(0, 3).map((m) => `"${m.heading.slice(0, 40)}"`).join(', ')}) — rút gọn mẫu về các mục thật sự dùng, hoặc ghi rõ mục nào bắt buộc.`);
  if (k.compliance.outputs && k.compliance.summaryOk < k.compliance.outputs)
    f.push(`${k.compliance.outputs - k.compliance.summaryOk}/${k.compliance.outputs} sản phẩm không mở đầu bằng "## Tóm tắt".`);
  if (k.evidence.execEligible >= 1 && k.evidence.execWithCommands / k.evidence.execEligible < 0.5)
    f.push(`Có quyền chạy lệnh nhưng ít kiểm chứng (${k.evidence.execWithCommands}/${k.evidence.execEligible} lượt thực thi có chạy test/typecheck/lint/build) — Definition of Done phải bắt buộc lệnh kiểm chứng + exit code thật.`);
  const shellReads = Object.entries(k.tools.byName).find(([n]) => n === 'run_command')?.[1].n ?? 0;
  const fileTools = ['read_file', 'search', 'list_files'].reduce((s, n) => s + (k.tools.byName[n]?.n ?? 0), 0);
  if (shellReads >= 10 && shellReads > 2 * fileTools)
    f.push(`Dùng run_command cho cả việc đọc/tìm code (${shellReads} lệnh so với ${fileTools} lần read_file/search/list_files) — dễ lỗi cú pháp PowerShell, sai mã hóa và tốn lượt; đọc/tìm bằng công cụ file.`);
  if (k.department === 'research' && k.compliance.outputs >= 1 && k.evidence.webCalls === 0 && k.evidence.doi + k.evidence.urls === 0 && k.role !== 'lead')
    f.push('Không có nguồn kiểm chứng được (DOI/URL) và không dùng công cụ tra cứu.');
  if (k.quality.reviewed >= 1 && (k.quality.firstPassOk / k.quality.reviewed < 0.5 || k.quality.finalClean < k.quality.reviewed))
    f.push(`Qua review lần đầu ${k.quality.firstPassOk}/${k.quality.reviewed} hạng mục, còn blocker ở review cuối ${k.quality.reviewed - k.quality.finalClean}/${k.quality.reviewed} (bị nêu qua các vòng: ${k.quality.blocker} blocker, ${k.quality.major} major). Lỗi ở review cuối: ${k.quality.topIssues.slice(0, 2).join(' | ') || '—'}`);
  if (k.failedCalls >= 2) f.push(`${k.failedCalls}/${k.calls} lượt gọi hỏng do đầu ra (rỗng/quá ngữ cảnh/lỗi khác) — kiểm tra model gán cho agent và độ dài prompt.`);
  if (k.infraFailedCalls) f.push(`(Hạ tầng, không tính điểm) ${k.infraFailedCalls} lượt hỏng do hạn mức/đăng nhập/mạng.`);
  if (k.truncated) f.push(`${k.truncated} lượt đầu ra chạm giới hạn độ dài — yêu cầu viết gọn, chi tiết đưa vào tệp.`);
  if (med && k.subtasks && k.tokens.perSubtask > 2 * med) f.push(`Tốn token gấp ${Math.round((k.tokens.perSubtask / med) * 10) / 10} lần trung vị phòng cho mỗi hạng mục (${Math.round(k.tokens.perSubtask / 1000)}k so với ${Math.round(med / 1000)}k).`);
  if (k.reviewer && k.reviewer.reviews && k.reviewer.checkable && k.reviewer.verified < k.reviewer.checkable)
    f.push(`Review không kiểm chứng bằng công cụ ${k.reviewer.checkable - k.reviewer.verified}/${k.reviewer.checkable} lần — kết luận dựa trên lời tự khai trong báo cáo.`);
  if (k.lead?.planFallback) f.push(`${k.lead.planFallback} lần kế hoạch không đúng định dạng JSON (phải dùng kế hoạch dự phòng).`);
  if (k.lead?.budgetRatio && k.lead.budgetRatio > 1.5)
    f.push(`Phòng dùng ${k.lead.budgetRatio.toString().replace('.', ',')} lần ngân sách (${fmtK(k.lead.used ?? 0)}/${fmtK(k.lead.budget ?? 0)}) — kế hoạch ôm quá nhiều việc cho một nhiệm vụ: chia theo gói/giai đoạn, mỗi hạng mục có tiêu chí xong đo được trong một lượt.`);
  if (!k.subtasks && !k.reviewer && !k.lead && (k.phases.discuss ?? 0) > 0 && Object.keys(k.phases).length === 1) f.push('Chỉ tham gia họp, không nhận hạng mục — cân nhắc không mời họp khi không có việc liên quan.');
  return f;
}

const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Bảng KPI dạng Markdown (báo cáo nhiệm vụ, CLI). */
export function kpiMarkdown(r: KpiReport, opts: { findings?: boolean } = {}): string {
  const rows = r.agents
    .filter((k) => k.calls || k.subtasks)
    .map(
      (k) =>
        `| ${k.name} (@${k.agentId}) | ${k.department} | **${k.score}** ${k.grade} | ${k.scores.quality ?? '—'} | ${k.scores.efficiency ?? '—'} | ${k.scores.reliability ?? '—'} | ${k.scores.compliance ?? '—'} | ${k.subtasks} | ${k.attemptsAvg || '—'} | ${fmtK(k.tokens.total)} | ${k.tools.calls ? `${k.tools.failed}/${k.tools.calls}` : '—'} |`,
    )
    .join('\n');
  const head = `| Agent | Phòng | Điểm | Chất lượng | Hiệu quả | Tin cậy | Tuân thủ | Hạng mục | Lần chạy TB | Token | Công cụ lỗi |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}`;
  if (!opts.findings) return head;
  const fx = r.agents
    .filter((k) => k.findings.length)
    .map((k) => `- **${k.name}** (@${k.agentId}, ${k.score} ${k.grade}):\n${k.findings.map((x) => `  - ${x}`).join('\n')}`)
    .join('\n');
  return `${head}\n\n### Việc cần sửa theo agent\n${fx || '- (không có phát hiện vượt ngưỡng)'}\n\n_Cách chấm: ${r.method}_`;
}
