import { extractJson } from './util/json-extract.js';
import { emptyUsage, type AgentDef, type ReviewCheck, type ReviewIssue, type Subtask } from './types.js';

export interface PlanResult {
  summary: string;
  decisions: string[];
  subtasks: Subtask[];
  parsed: boolean;
  /** B-10: JSON kế hoạch bị cắt cụt/không đóng (có "subtasks" nhưng không đọc hết được). */
  truncated?: boolean;
  /** B-10: đích kế hoạch khai ngoài phạm vi kèm lý do. */
  outOfScope?: Array<{ target: string; reason: string }>;
}

interface RawSubtask {
  id?: unknown;
  title?: unknown;
  assignee?: unknown;
  description?: unknown;
  dependsOn?: unknown;
  depends_on?: unknown;
  deliverable?: unknown;
}

export const MAX_SUBTASKS = 8;

export function skillScore(text: string, a: AgentDef): number {
  const t = text.toLowerCase();
  return a.skills.reduce((n, s) => (t.includes(s.replace(/-/g, ' ')) || t.includes(s) ? n + 2 : n), 0) + (t.includes(a.id) ? 3 : 0);
}

/** Ghép tên người giao việc mà LLM viết (id, @id, tên, chức danh) về id agent hợp lệ. */
export function matchAssignee(raw: string, roster: AgentDef[], context = ''): AgentDef | undefined {
  const r = raw.trim().replace(/^@/, '').toLowerCase();
  if (r) {
    const exact = roster.find((a) => a.id.toLowerCase() === r || a.name.toLowerCase() === r);
    if (exact) return exact;
    const partial = roster.find((a) => r.includes(a.id.toLowerCase()) || a.title.toLowerCase().includes(r) || r.includes(a.name.toLowerCase()));
    if (partial) return partial;
  }
  const scored = roster
    .filter((a) => a.role !== 'lead')
    .map((a) => ({ a, s: skillScore(`${raw} ${context}`, a) }))
    .sort((x, y) => y.s - x.s);
  return scored[0]?.s ? scored[0].a : undefined;
}

/** Loại bỏ phụ thuộc vòng (giữ thứ tự xuất hiện). */
export function breakCycles(subtasks: Subtask[]): Subtask[] {
  const ids = new Set(subtasks.map((s) => s.id));
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  for (const s of subtasks) s.dependsOn = [...new Set(s.dependsOn.filter((d) => ids.has(d) && d !== s.id))];
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (s: Subtask) => {
    state.set(s.id, 1);
    s.dependsOn = s.dependsOn.filter((d) => {
      const st = state.get(d) ?? 0;
      if (st === 1) return false; // cạnh tạo vòng
      if (st === 0) visit(byId.get(d)!);
      return true;
    });
    state.set(s.id, 2);
  };
  for (const s of subtasks) if (!state.get(s.id)) visit(s);
  return subtasks;
}

export function newSubtask(p: Partial<Subtask> & Pick<Subtask, 'id' | 'title' | 'assignee'>): Subtask {
  return { description: '', dependsOn: [], status: 'pending', attempts: 0, usage: emptyUsage(), ...p };
}

/** Kế hoạch dự phòng khi trưởng phòng trả lời không đúng định dạng. */
export function fallbackPlan(brief: string, roster: AgentDef[], lead: AgentDef): PlanResult {
  const members = roster.filter((a) => a.role === 'member');
  const ranked = members.map((a) => ({ a, s: skillScore(brief, a) })).sort((x, y) => y.s - x.s);
  const picks = (ranked.filter((x) => x.s > 0).length ? ranked.filter((x) => x.s > 0) : ranked).slice(0, 2).map((x) => x.a);
  const workers = picks.length ? picks : [lead];
  return {
    summary: 'Kế hoạch dự phòng: giao cho thành viên có kỹ năng phù hợp nhất.',
    decisions: [],
    parsed: false,
    subtasks: workers.map((a, i) =>
      newSubtask({
        id: `S${i + 1}`,
        title: `${a.title}: xử lý yêu cầu`,
        assignee: a.id,
        description: brief,
        dependsOn: i === 0 ? [] : ['S1'],
        deliverable: 'Báo cáo Markdown',
      }),
    ),
  };
}

export function parsePlan(text: string, roster: AgentDef[], lead: AgentDef, brief: string): PlanResult {
  const raw = extractJson<{ summary?: unknown; decisions?: unknown; subtasks?: RawSubtask[]; outOfScope?: unknown; out_of_scope?: unknown }>(text);
  if (!raw || !Array.isArray(raw.subtasks) || raw.subtasks.length === 0) {
    const fb = fallbackPlan(brief, roster, lead);
    return text.includes('"subtasks"') ? { ...fb, truncated: true } : fb;
  }
  // còn nhiều "assignee" trong văn bản hơn số hạng mục đọc được → JSON bị cắt giữa chừng
  const truncated = (text.match(/"assignee"\s*:/g)?.length ?? 0) > raw.subtasks.length;
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  const subtasks: Subtask[] = [];
  raw.subtasks.slice(0, MAX_SUBTASKS).forEach((r, i) => {
    let id = String(r.id ?? `S${i + 1}`).trim().slice(0, 12) || `S${i + 1}`;
    if (used.has(id)) id = `S${i + 1}`;
    while (used.has(id)) id = `${id}b`;
    used.add(id);
    idMap.set(String(r.id ?? id), id);
    const title = String(r.title ?? `Hạng mục ${i + 1}`).slice(0, 160);
    const description = String(r.description ?? '');
    const who = matchAssignee(String(r.assignee ?? ''), roster, `${title} ${description}`) ?? lead;
    const deps = (Array.isArray(r.dependsOn) ? r.dependsOn : Array.isArray(r.depends_on) ? r.depends_on : []).map(String);
    subtasks.push(newSubtask({ id, title, assignee: who.id, description, dependsOn: deps, deliverable: r.deliverable ? String(r.deliverable) : undefined }));
  });
  for (const s of subtasks) s.dependsOn = s.dependsOn.map((d) => idMap.get(d) ?? d);
  const decisions = Array.isArray(raw.decisions) ? raw.decisions.map(String) : typeof raw.decisions === 'string' ? [raw.decisions] : [];
  const oosRaw = raw.outOfScope ?? raw.out_of_scope;
  const outOfScope = (Array.isArray(oosRaw) ? oosRaw : [])
    .map((o: any) => ({ target: String(typeof o === 'string' ? o.split(/\s+[—–-]\s+|:\s+/)[0] : (o?.target ?? o?.path ?? o?.file ?? '')).trim(), reason: String(typeof o === 'string' ? o.split(/\s+[—–-]\s+|:\s+/).slice(1).join(' — ') : (o?.reason ?? o?.why ?? '')).trim() }))
    .filter((o) => o.target);
  return {
    summary: String(raw.summary ?? '').slice(0, 1000),
    decisions,
    subtasks: breakCycles(subtasks),
    parsed: true,
    ...(truncated ? { truncated } : {}),
    ...(outOfScope.length ? { outOfScope } : {}),
  };
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  issues: ReviewIssue[];
  /** Lệnh kiểm tra reviewer khai báo đã chạy ("checks" trong JSON). */
  checks: ReviewCheck[];
  parsed: boolean;
}

/**
 * Lỗi review không trỏ đúng mã hạng mục (vd. "Lỗi 3/4 (src/promotions.js)") trước đây không vào vòng sửa nào → nhiệm vụ xong mà lỗi
 * còn nguyên (benchtest C7 t2, 2/11: 52/60 test ẩn). Gán mỗi lỗi blocker/major như vậy cho hạng mục gần nhất theo từ chung (tên tệp,
 * từ khóa) — hòa thì lấy hạng mục đầu; giữ nhãn gốc trong nội dung. Trả về số lỗi đã gán.
 */
export function assignStrayIssues(issues: ReviewIssue[], subtasks: Array<Pick<Subtask, 'id' | 'title' | 'description'>>): number {
  if (!subtasks.length) return 0;
  const ids = new Set(subtasks.map((s) => s.id));
  const words = (t: string) => new Set((t.toLowerCase().match(/[\p{L}\p{N}_./-]{3,}/gu) ?? []).flatMap((w) => [w, ...w.split(/[./-]/).filter((x) => x.length >= 3)]));
  let n = 0;
  for (const i of issues) {
    if (i.severity === 'minor' || ids.has(i.subtask)) continue;
    const want = words(`${i.subtask} ${i.comment}`);
    let best = subtasks[0];
    let bestScore = -1;
    for (const s of subtasks) {
      const have = words(`${s.id} ${s.title} ${s.description}`);
      let score = 0;
      for (const w of want) if (have.has(w)) score++;
      if (score > bestScore) [best, bestScore] = [s, score];
    }
    i.comment = `(${i.subtask || 'không ghi hạng mục'}) ${i.comment}`;
    i.subtask = best.id;
    n++;
  }
  return n;
}

export function parseReview(text: string, subtaskIds: string[]): ReviewResult {
  const raw = extractJson<{ approved?: unknown; summary?: unknown; issues?: unknown; checks?: unknown }>(text);
  // không đọc được kết luận → KHÔNG coi là đã duyệt (trước đây mặc định chấp nhận khiến review hỏng thành "Duyệt" giả)
  if (!raw) return { approved: false, summary: `Không đọc được kết luận review dạng JSON — chưa coi là đã duyệt.${text.trim() ? ` Nội dung: ${text.trim().slice(0, 500)}` : ''}`, issues: [], checks: [], parsed: false };
  const issues: ReviewIssue[] = (Array.isArray(raw.issues) ? raw.issues : [])
    .map((i: any) => ({
      subtask: String(i?.subtask ?? i?.subtaskId ?? ''),
      severity: (['blocker', 'major', 'minor'].includes(i?.severity) ? i.severity : 'minor') as ReviewIssue['severity'],
      comment: String(i?.comment ?? i?.issue ?? ''),
    }))
    .filter((i) => i.comment);
  const blocking = issues.some((i) => i.severity !== 'minor' && subtaskIds.includes(i.subtask));
  const approved = raw.approved === undefined ? !blocking : Boolean(raw.approved) && !blocking;
  const checks: ReviewCheck[] = (Array.isArray(raw.checks) ? raw.checks : [])
    .map((c: any) => {
      const code = Number(c?.exitCode ?? c?.exit_code ?? c?.exit);
      return {
        command: String(c?.command ?? c?.cmd ?? '').slice(0, 300),
        exitCode: Number.isFinite(code) ? code : undefined,
        ok: typeof c?.ok === 'boolean' ? c.ok : Number.isFinite(code) ? code === 0 : undefined,
        note: c?.note || c?.result ? String(c.note ?? c.result).slice(0, 300) : undefined,
      };
    })
    .filter((c) => c.command)
    .slice(0, 20);
  return { approved, summary: String(raw.summary ?? ''), issues, checks, parsed: true };
}

export interface AcceptResult {
  accepted: boolean;
  parsed: boolean;
  summary: string;
  criteria: Array<{ name: string; result: 'pass' | 'fail' | 'unknown'; evidence: string; scope?: 'in' | 'decision' }>;
  risks: string[];
  followUps: Array<{ title: string; brief: string; department?: string }>;
  /** Phần hiển thị: câu trả lời bỏ khối JSON kết luận. */
  body: string;
}

/** Đọc kết luận nghiệm thu của CTO (khối JSON cuối). Không đọc được → chưa coi là nghiệm thu, parsed=false. */
export function parseAcceptance(text: string): AcceptResult {
  type Raw = { accepted?: unknown; summary?: unknown; criteria?: unknown; risks?: unknown; followUps?: unknown; follow_ups?: unknown };
  // khối kết luận là khối ```json CUỐI có "accepted"/"criteria" — CTO có thể trích JSON khác (package.json…) làm bằng chứng phía trước
  let raw: Raw | undefined;
  let body = text.trim();
  const fences = [...text.matchAll(/```json\s*\n([\s\S]*?)```/gi)];
  for (let i = fences.length - 1; i >= 0 && !raw; i--) {
    try {
      const o = JSON.parse(fences[i][1]) as Raw;
      if (o && typeof o === 'object' && ('accepted' in o || 'criteria' in o)) {
        raw = o;
        body = (text.slice(0, fences[i].index) + text.slice(fences[i].index! + fences[i][0].length)).trim();
      }
    } catch {
      /* khối khác / hỏng: thử khối trước */
    }
  }
  if (!raw) {
    const any = extractJson<Raw>(text);
    if (any && ('accepted' in any || 'criteria' in any)) raw = any;
  }
  if (!raw) return { accepted: false, parsed: false, summary: '', criteria: [], risks: [], followUps: [], body };
  const res = (v: unknown): 'pass' | 'fail' | 'unknown' => {
    const t = String(v ?? '').toLowerCase();
    return /^(pass|đạt|dat|ok|yes|true)$/.test(t) ? 'pass' : /^(fail|không|khong|không đạt|no|false)$/.test(t) ? 'fail' : 'unknown';
  };
  // phân loại phạm vi: chỉ tiêu chí chưa đạt mới có; thiếu hoặc giá trị lạ → decision (an toàn)
  const scopeOf = (v: unknown): 'in' | 'decision' => {
    const t = String(v ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    return /^(in|in-scope|inscope|trong-phạm-vi|trong-pham-vi|trong phạm vi)$/.test(t) ? 'in' : 'decision';
  };
  const criteria = (Array.isArray(raw.criteria) ? raw.criteria : [])
    .map((c: any) => {
      const result = res(c?.result ?? c?.status);
      const base = { name: String(c?.name ?? c?.criterion ?? '').slice(0, 300), result, evidence: String(c?.evidence ?? '').slice(0, 500) };
      return result === 'pass' ? base : { ...base, scope: scopeOf(c?.scope) };
    })
    .filter((c) => c.name)
    .slice(0, 20);
  const risks = (Array.isArray(raw.risks) ? raw.risks : []).map((r) => String(r ?? '').slice(0, 400)).filter(Boolean).slice(0, 12);
  const fu = Array.isArray(raw.followUps) ? raw.followUps : Array.isArray(raw.follow_ups) ? raw.follow_ups : [];
  const followUps = fu
    .map((f: any) => ({ title: String(f?.title ?? '').slice(0, 120), brief: String(f?.brief ?? f?.description ?? '').slice(0, 4000), department: ['dev', 'research'].includes(f?.department) ? String(f.department) : undefined }))
    .filter((f) => f.title && f.brief)
    .slice(0, 5);
  // kết luận chung phải khớp bảng: còn tiêu chí không đạt / chưa kiểm được thì chưa nghiệm thu
  const accepted = Boolean(raw.accepted) && criteria.length > 0 && criteria.every((c) => c.result === 'pass');
  return { accepted, parsed: true, summary: String(raw.summary ?? '').slice(0, 600), criteria, risks, followUps, body };
}

export interface RouteResult {
  departments: string[];
  joint: boolean;
  title?: string;
  reason: string;
}

export function parseRoute(text: string, known: string[]): RouteResult | undefined {
  const raw = extractJson<{ departments?: unknown; department?: unknown; mode?: unknown; title?: unknown; reason?: unknown }>(text);
  if (!raw) return undefined;
  const list = (Array.isArray(raw.departments) ? raw.departments : raw.department ? [raw.department] : []).map(String).filter((d) => known.includes(d));
  if (!list.length) return undefined;
  const joint = raw.mode === 'joint' || list.length > 1;
  return { departments: joint ? orderJoint(list) : [list[0]], joint, title: raw.title ? String(raw.title) : undefined, reason: String(raw.reason ?? '') };
}

/** Liên phòng: nghiên cứu luôn đi trước phát triển. */
export function orderJoint(list: string[]): string[] {
  const uniq = [...new Set(list)];
  return uniq.sort((a, b) => (a === 'research' ? -1 : b === 'research' ? 1 : 0));
}

/** Định tuyến dự phòng bằng từ khóa khi không có router hoặc router trả lời sai. */
export function keywordRoute(brief: string, depts: Array<{ id: string; keywords: string[] }>): RouteResult {
  const t = brief.toLowerCase();
  const scored = depts.map((d) => ({ id: d.id, s: d.keywords.filter((k) => t.includes(k)).length })).sort((a, b) => b.s - a.s);
  const top = scored[0];
  const research = scored.find((x) => x.id === 'research');
  const dev = scored.find((x) => x.id === 'dev');
  if (research && dev && research.s >= 2 && dev.s >= 2) {
    return { departments: ['research', 'dev'], joint: true, reason: 'Từ khóa của cả hai phòng đều nổi bật → liên phòng (nghiên cứu trước).' };
  }
  return { departments: [top?.id ?? 'dev'], joint: false, reason: `Khớp ${top?.s ?? 0} từ khóa của phòng ${top?.id ?? 'dev'}.` };
}

/** Các hạng mục sẵn sàng chạy: phụ thuộc đã xong, người phụ trách đang rảnh. */
export function readySubtasks(subtasks: Subtask[], busyAgents: Set<string>): Subtask[] {
  const done = new Set(subtasks.filter((s) => s.status === 'done').map((s) => s.id));
  const picked = new Set<string>();
  return subtasks.filter((s) => {
    if (s.status !== 'pending') return false;
    if (!s.dependsOn.every((d) => done.has(d))) return false;
    if (busyAgents.has(s.assignee) || picked.has(s.assignee)) return false;
    picked.add(s.assignee);
    return true;
  });
}

/** Hạng mục bị chặn vĩnh viễn vì phụ thuộc thất bại/bị bỏ qua. */
export function blockedSubtasks(subtasks: Subtask[]): Subtask[] {
  const bad = new Set(subtasks.filter((s) => s.status === 'failed' || s.status === 'skipped').map((s) => s.id));
  return subtasks.filter((s) => s.status === 'pending' && s.dependsOn.some((d) => bad.has(d)));
}
