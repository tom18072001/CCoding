/**
 * B-10 — Cổng phủ kế hoạch (docs/research/improvement-backlog.md §5 B-10). Hàm thuần, không gọi LLM, không đọc đĩa.
 *
 * Chạy sau parsePlan, trước execute:
 *  - Quy tắc A: mọi đích (tệp/module) nêu trong đề bài hoặc tóm tắt kế hoạch phải có hạng mục nhận (title/description/deliverable)
 *    hoặc được khai ngoài phạm vi kèm lý do.
 *  - Quy tắc B: kế hoạch phải đọc được đầy đủ — số hạng mục khớp số tự khai, deliverable có thật, vai trong mô tả khớp assignee,
 *    JSON không cụt.
 */

export interface GateSubtask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  deliverable?: string;
  /** parsePlan: tên người nhận LLM viết không khớp roster — cổng B báo, không đổi lặng lẽ. */
  assigneeUnmatched?: string;
}

export interface OutOfScopeItem { target: string; reason: string }

export interface PlanGateInput {
  brief: string;
  planSummary: string;
  subtasks: GateSubtask[];
  /** Đích kế hoạch khai ngoài phạm vi (phải có lý do mới được tính). */
  outOfScope?: OutOfScopeItem[];
  /** parsePlan báo JSON cụt/không đóng. */
  truncated?: boolean;
  /** git ls-files — để nhận tên không có đuôi tệp và gộp tên rút gọn. */
  repoFiles?: string[];
  /** id mọi agent có thể được nhắc trong mô tả (quy tắc B-iii). Mặc định: assignee của kế hoạch. */
  agentIds?: string[];
  /** id → role + skills (từ registry) để khớp vai của đề bài với assignee. Thiếu thì chỉ khớp theo id. */
  /** Kế hoạch của vòng bổ sung: chỉ kiểm theo các tiêu chí của vòng (chữ tên + chi tiết), không theo toàn đề bài. */
  followup?: { criteria: string[] };
  agentRoles?: Record<string, { role: string; skills: string[]; /** tools của agent (registry); có thì cổng kiểm hạng mục cần lệnh với agent không có run_command. */ tools?: string[] }>;
}

export interface PlanGateResult {
  blocked: boolean;
  rules: ('A' | 'B' | 'brief-item')[];
  uncovered: string[];
  reasons: string[];
  /** Có khi kế hoạch là của vòng bổ sung: mã K áp dụng và có bỏ rule A/brief-item không. */
  followupScope?: { codes: string[]; skipped: boolean };
}

const SOURCE_EXT = 'js|mjs|cjs|jsx|ts|tsx|mts|cts|py|go|rs|java|kt|cs|rb|php|sh|sql|css|html|vue|svelte|c|h|cpp|hpp';
/** Tệp tài liệu/cấu hình thường chỉ là tham khảo trong đề bài (SPEC.md, package.json) — không tính là đích phải có người nhận. */
const PATH_RE = new RegExp(`(?<![\\w@/.-])((?:[\\w.-]+/)*[\\w-][\\w.-]*\\.(?:${SOURCE_EXT}))(?![\\w])`, 'gi');

const NUM_WORDS: Record<string, number> = { một: 1, hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5, sáu: 6, bảy: 7, bẩy: 7, tám: 8, chín: 9, mười: 10 };
// "một hạng mục sở hữu…" là mạo từ, không phải số đếm → không nhận "một"; số phải đứng đầu câu hoặc sau động từ chia việc
const COUNT_RE = /(?:^|[.;\n]\s*|(?:chia|tách|giữ|có|gồm|thành|giao|lập)\s+(?:làm\s+|thành\s+)?)(\d{1,2}|hai|ba|bốn|năm|sáu|bảy|bẩy|tám|chín|mười)\s+(?:hạng mục|phần việc|đầu việc|việc con|subtasks?)(?![\p{L}])/iu;
/** Câu có các cụm này nhắc tệp để tham khảo/không sửa — đích trong câu đó coi là ngoài phạm vi có lý do. */
const OUT_RE = /đã có sẵn|có sẵn|không ai sửa|không sửa|không đụng|giữ nguyên|chỉ đọc|chỉ để tham khảo|tham khảo|ngoài phạm vi|không thuộc phạm vi|chỉ dùng api/iu;
const PLACEHOLDER_RE = /^[\s\-–—_.*()\[\]]*(?:không dùng|không có|không áp dụng|n\/a|na|none|null|tbd|todo|trống|chưa có|\.\.\.|…)?[\s\-–—_.*()\[\]]*$/iu;
const ASSIGN_RE = /(?:giao cho|assignee[^:\n]{0,30}:?|người làm|người nhận|được giao cho|chỉ giao cho|do)\s+@?([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/giu;

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

function pathsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PATH_RE)) {
    const p = norm(m[1]);
    if (/[<>*{}]/.test(p)) continue;
    out.push(p);
  }
  return out;
}

/** Gộp tên rút gọn vào đường dẫn dài hơn (agg.js ↔ src/agg.js), lấy dạng đầy đủ nhất. */
function mergeShort(paths: string[], repoFiles: string[] = []): string[] {
  const all = [...new Set(paths)];
  const full = (p: string): string => {
    const hit = repoFiles.map(norm).find((f) => f === p || f.endsWith(`/${p}`));
    if (hit) return hit;
    const longer = all.filter((q) => q !== p && q.endsWith(`/${p}`)).sort((a, b) => b.length - a.length)[0];
    return longer ?? p;
  };
  return [...new Set(all.map(full))];
}

/** Câu chứa vị trí idx; dấu chấm trong tên tệp (agg.js) không phải ranh giới câu — chỉ tính chấm theo sau bởi khoảng trắng/hết chuỗi. */
function sentenceOf(text: string, idx: number): string {
  const cut = /\.(?=\s|$)|[;\n]/g;
  let start = 0;
  for (const m of text.matchAll(cut)) {
    const at = m.index ?? 0;
    if (at < idx) start = at + 1;
    else return text.slice(start, at + 1);
  }
  return text.slice(start);
}

/**
 * Tập đích D: đường dẫn tệp nguồn nêu trong đề bài hoặc tóm tắt kế hoạch, tên rút gọn được gộp vào dạng đầy đủ.
 * Đích trong câu của tóm tắt có cụm "đã có sẵn / không ai sửa / chỉ dùng API…" không đưa vào D (đã ngoài phạm vi, có lý do ngay trong câu).
 */
export function planTargets(brief: string, planSummary: string, repoFiles: string[] = []): string[] {
  const found: string[] = pathsIn(brief);
  for (const m of planSummary.matchAll(new RegExp(PATH_RE.source, 'gi'))) {
    const p = norm(m[1]);
    if (/[<>*{}]/.test(p)) continue;
    if (OUT_RE.test(sentenceOf(planSummary, m.index ?? 0))) continue;
    // "…qua src/index.js", "import từ src/x.js": chỉ là chỗ nối, không phải việc phải làm
    if (/(?:qua|từ|import|require|dùng|gọi)\s+$/iu.test(planSummary.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0))) continue;
    found.push(p);
  }
  // tên không có đuôi nhưng khớp git ls-files (vd. `Makefile`, `bin/logq`) — chỉ lấy khi đề bài nêu trong dấu ` `
  for (const m of brief.matchAll(/`([\w./-]+)`/g)) {
    const p = norm(m[1]);
    if (p.includes('/') && repoFiles.map(norm).includes(p)) found.push(p);
  }
  // tệp tham khảo trong đề bài ("theo SPEC.md", "trong src/index.js") không phải đích
  const refOnly = new Set<string>();
  for (const m of brief.matchAll(new RegExp(PATH_RE.source, 'gi'))) {
    const pre = brief.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (/(?:theo|đọc|xem|tham khảo|dựa trên|giữ nguyên|không sửa|API đã chốt trong)\s*(?:đặc tả|file|tệp)?\s*(?:trong)?\s*$/iu.test(pre)) refOnly.add(norm(m[1]));
  }
  const merged = mergeShort(found, repoFiles);
  return merged.filter((p) => !refOnly.has(p) || found.filter((x) => x === p).length > 1);
}

/** Hạng mục đòi chạy lệnh thật (test/build/typecheck/migration/script/đo): cần agent có run_command. */
const NEEDS_CMD_RE = /(?<![\p{L}])chạy\s+(?:lại\s+)?(?:các\s+)?(?:lệnh|test|build|typecheck|lint|migration|script|benchmark|đo|\x60)/iu;

const subtaskText = (s: GateSubtask): string => norm(`${s.title}\n${s.description}\n${s.deliverable ?? ''}`);

/** Quy tắc A: trả các đích chưa có hạng mục nhận. */
export function checkPlanCoverage(input: Pick<PlanGateInput, 'brief' | 'planSummary' | 'subtasks' | 'outOfScope' | 'repoFiles'>): { targets: string[]; uncovered: string[] } {
  const targets = planTargets(input.brief, input.planSummary, input.repoFiles);
  const hay = input.subtasks.map(subtaskText);
  const exempt = (input.outOfScope ?? []).filter((o) => o.reason.trim()).map((o) => norm(o.target));
  const uncovered = targets.filter((t) => {
    const b = base(t);
    if (hay.some((h) => h.includes(t) || h.includes(b))) return false;
    return !exempt.some((x) => x.includes(t) || t.includes(x) || x.includes(b));
  });
  return { targets, uncovered };
}

/** Quy tắc B: trả danh sách lý do kế hoạch bị coi là đọc dở (rỗng = đọc được). */
export function checkPlanReadable(input: Pick<PlanGateInput, 'planSummary' | 'subtasks' | 'truncated' | 'agentIds'> & Partial<Pick<PlanGateInput, 'agentRoles'>>): string[] {
  const reasons: string[] = [];
  const n = input.subtasks.length;
  const m = COUNT_RE.exec(input.planSummary.trim());
  if (m) {
    const claimed = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()];
    if (claimed && claimed !== n) reasons.push(`(i) tóm tắt tự khai ${claimed} hạng mục nhưng chỉ phân tích được ${n}`);
  }
  // kế hoạch bỏ hẳn trường deliverable ở mọi hạng mục là kiểu tối giản hợp lệ; chỉ coi là dở khi chỗ giữ được ghi rõ,
  // hoặc khi các hạng mục khác có deliverable mà hạng mục này để rỗng (trường bị mất giữa chừng)
  const hasReal = input.subtasks.some((s) => (s.deliverable ?? '').trim() && !PLACEHOLDER_RE.test(s.deliverable ?? ''));
  for (const s of input.subtasks) {
    const d = (s.deliverable ?? '').trim();
    if (d ? PLACEHOLDER_RE.test(d) : hasReal) reasons.push(`(ii) ${s.id}: deliverable ${d ? `là chỗ giữ "${d}"` : 'rỗng'}`);
  }
  const ids = new Set([...(input.agentIds ?? []), ...input.subtasks.map((s) => s.assignee)].map((x) => x.toLowerCase()));
  for (const s of input.subtasks) {
    for (const mm of s.description.matchAll(ASSIGN_RE)) {
      const who = mm[1].toLowerCase();
      if (ids.has(who) && who !== s.assignee.toLowerCase()) {
        reasons.push(`(iii) ${s.id}: mô tả nêu vai ${who} nhưng assignee là ${s.assignee}`);
        break;
      }
    }
  }
  for (const s of input.subtasks) {
    if (s.assigneeUnmatched) reasons.push(`(v) ${s.id}: người nhận "${s.assigneeUnmatched}" không có trong roster — không được tự đổi sang ${s.assignee}, trưởng phòng phải giao lại đúng người`);
    const info = input.agentRoles?.[s.assignee.toLowerCase()] ?? input.agentRoles?.[s.assignee];
    if (info?.tools && !info.tools.includes('run_command') && NEEDS_CMD_RE.test(`${s.title}
${s.description}`)) reasons.push(`(vi) ${s.id}: hạng mục cần chạy lệnh nhưng người nhận ${s.assignee} chỉ đọc/ghi tệp, không có công cụ chạy lệnh — giao cho người có quyền chạy lệnh`);
  }
  if (input.truncated) reasons.push('(iv) JSON kế hoạch bị cắt cụt hoặc không đóng');
  return reasons;
}

export interface BriefItem {
  code: string;
  line: string;
  role?: string;
  /** Mọi vai nêu trên dòng hạng mục (chỉ có khi > 1, vd. "K4 — academic-writer, peer-reviewer:"). */
  roles?: string[];
  review: boolean;
  exempt: boolean;
}

const ITEM_RE = /^\s*(?:[#>*+-]+\s*)*(?:\*\*)?(K\d+)(?![\p{L}\d])\s*(?:\*\*)?\s*([—–:-])\s*(.*)$/u;
const REVIEW_ROLES = new Set(['peer-reviewer', 'code-reviewer', 'qa-tester']);
const SKIP_RE = /(?<![\p{L}])(?:không làm|chờ)(?![\p{L}])/iu;
const BELOW_SKIP_RE = /^\s*(?:[#>*+-]+\s*)*(?:\*\*)?(?:Phần\s*[^:\n]{1,20}:\s*)?(?:không làm|chờ)(?![\p{L}])/iu;
const ROLE_AFTER_RE = /^\*{0,2}\s*([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\s*\*{0,2}\s*(?::|—|–|$)/i;

/** Tiêu đề Markdown bất kỳ cấp (# … ######) — kết thúc thân hạng mục. */
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
const ROLE_TOKEN_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/i;

/** Danh sách vai ở đầu phần mô tả của dòng hạng mục: "academic-writer, peer-reviewer: …" → cả hai vai. Bỏ phần trong ngoặc. */
function rolesAfter(rest: string): string[] {
  const head = rest.replace(/\*\*/g, ' ').replace(/\([^)]*\)/g, ' ').split(/[:—–]/)[0];
  const toks = head.split(/\s*(?:,|;|\/|\+|&|\svà\s)\s*/i).map((t) => t.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  if (!toks.length || !toks.every((t) => /^[a-z][a-z0-9-]*$/.test(t))) return [];
  return toks.filter((t) => ROLE_TOKEN_RE.test(t));
}

/** Hạng mục có mã (K1, K2…) của đề bài: dòng/tiêu đề bắt đầu bằng mã + dấu —/–/-/:. Mỗi mã lấy lần xuất hiện đầu. */
export function briefItems(brief: string): BriefItem[] {
  const lines = brief.split(/\r?\n/);
  const heads: { idx: number; code: string; rest: string }[] = [];
  lines.forEach((ln, idx) => {
    const m = ITEM_RE.exec(ln);
    if (!m || /^K\d+(?![\p{L}\d])/iu.test(m[3])) return; // "K1–K3" là dải, không phải định nghĩa
    if (heads.some((h) => h.code === m[1])) return;
    heads.push({ idx, code: m[1], rest: m[3] });
  });
  return heads.map((h) => {
    const line = lines[h.idx].trim();
    // thân hạng mục: tới tiêu đề Markdown kế tiếp (mọi cấp) hoặc dòng hạng mục mã kế tiếp, mốc nào gặp trước — không kéo tới hết tệp
    const end = Math.min(...[...lines.keys()].filter((k) => k > h.idx && (ITEM_RE.test(lines[k]) || HEADING_RE.test(lines[k]))), lines.length);
    const at = /@([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/i.exec(line);
    const roles = [...new Set([...(at ? [at[1].toLowerCase()] : []), ...rolesAfter(h.rest)])];
    const single = ROLE_AFTER_RE.exec(h.rest.trim())?.[1]?.toLowerCase();
    if (!roles.length && single) roles.push(single);
    const role = roles.find((r) => REVIEW_ROLES.has(r)) ?? roles[0];
    const review = roles.some((r) => REVIEW_ROLES.has(r)) || /review|phản biện/iu.test(line);
    // chỉ xét dòng hạng mục, hoặc dòng ngay dưới mà cụm "không làm"/"chờ" đứng đầu dòng / sau nhãn "Phần …:" (không xét câu ví dụ giữa thân)
    const below = lines.slice(h.idx + 1, end).filter((l) => BELOW_SKIP_RE.test(l));
    const exempt = SKIP_RE.test(h.rest) || below.length > 0;
    return { code: h.code, line, ...(role ? { role } : {}), ...(roles.length > 1 ? { roles } : {}), review, exempt };
  });
}

/** Thân (gồm dòng đầu) của từng hạng mục có mã trong đề bài, cắt cùng cách briefItems. */
export function briefItemBodies(brief: string): Record<string, string> {
  const lines = brief.split(/\r?\n/);
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  lines.forEach((ln, idx) => {
    const m = ITEM_RE.exec(ln);
    if (!m || /^K\d+(?![\p{L}\d])/iu.test(m[3]) || seen.has(m[1])) return;
    seen.add(m[1]);
    const end = Math.min(...[...lines.keys()].filter((k) => k > idx && (ITEM_RE.test(lines[k]) || HEADING_RE.test(lines[k]))), lines.length);
    out[m[1]] = lines.slice(idx, end).join('\n');
  });
  return out;
}

/** Mã K của đề bài được tiêu chí của vòng bổ sung nhắc tới. */
export function followupCodes(brief: string, criteria: string[]): string[] {
  const text = criteria.join('\n');
  return briefItems(brief).map((i) => i.code).filter((c) => codeRe(c).test(text));
}

const codeRe = (code: string): RegExp => new RegExp(`(?<![\\p{L}\\d])${code}(?![\\p{L}\\d])`, 'iu');
const sortedParts = (id: string): string => id.split('-').sort().join('-');

function roleMatches(role: string, assignee: string, roles?: PlanGateInput['agentRoles']): boolean {
  const a = assignee.toLowerCase();
  // chỉ ép chặt vai review/qa; vai thực thi (dev-backend…) chỉ là gợi ý — mã đã được nhắc là đủ
  if (!REVIEW_ROLES.has(role) && role !== 'reviewer') return true;
  if (a === role || sortedParts(a) === sortedParts(role)) return true;
  const info = roles?.[a] ?? roles?.[assignee];
  if (!info) return false;
  const skills = info.skills.map((x) => x.toLowerCase());
  if (/^(?:code-reviewer|peer-reviewer|reviewer)$/.test(role)) return info.role === 'reviewer' || skills.includes('code-review');
  if (role === 'qa-tester') return skills.includes('testing');
  return false;
}

/** Quy tắc brief-item: trả lý do cho mỗi mã hạng mục của đề bài chưa có subtask nhắc/giao đúng vai. */
export function checkBriefItems(input: Pick<PlanGateInput, 'brief' | 'subtasks' | 'agentRoles'>, only?: string[]): string[] {
  const out: string[] = [];
  for (const it of briefItems(input.brief)) {
    if (it.exempt) continue;
    if (only && !only.includes(it.code)) continue;
    const re = codeRe(it.code);
    const hit = input.subtasks.filter((s) => re.test(`${s.title}
${s.description}`));
    if (!hit.length) { out.push(`${it.code}${it.role ? ` (vai ${it.role})` : ''}: không hạng mục kế hoạch nào nhắc mã này`); continue; }
    if (it.role && !hit.some((s) => roleMatches(it.role!, s.assignee, input.agentRoles))) out.push(`${it.code}: không hạng mục nào nhắc mã này được giao cho vai ${it.role}`);
  }
  return out;
}

export function planGate(input: PlanGateInput): PlanGateResult {
  let followupScope: PlanGateResult['followupScope'];
  let uncovered: string[] = [];
  let items: string[] = [];
  if (input.followup) {
    const codes = followupCodes(input.brief, input.followup.criteria);
    followupScope = { codes, skipped: !codes.length };
    if (codes.length) {
      const bodies = briefItemBodies(input.brief);
      uncovered = checkPlanCoverage({ ...input, brief: codes.map((c) => bodies[c] ?? '').join('\n'), planSummary: '' }).uncovered;
      items = checkBriefItems(input, codes);
    }
  } else {
    uncovered = checkPlanCoverage(input).uncovered;
    items = checkBriefItems(input);
  }
  const readable = checkPlanReadable(input);
  const rules: ('A' | 'B' | 'brief-item')[] = [];
  const reasons: string[] = [];
  if (uncovered.length) {
    rules.push('A');
    reasons.push(`A: chưa có hạng mục nhận ${uncovered.join(', ')}`);
  }
  if (readable.length) {
    rules.push('B');
    for (const r of readable) reasons.push(`B ${r}`);
  }
  if (items.length) {
    rules.push('brief-item');
    for (const r of items) reasons.push(`brief-item: ${r}`);
  }
  return { blocked: rules.length > 0, rules, uncovered, reasons, ...(followupScope ? { followupScope } : {}) };
}

/** K2: loại attention + thông báo khi cổng chặn sau khi đã sửa kế hoạch. Không nhánh nào ra lý do rỗng. */
export function planStopAttention(short: string, g: Pick<PlanGateResult, 'rules' | 'uncovered' | 'reasons'>): { reason: 'plan-coverage' | 'plan-brief-items' | 'plan-unreadable'; detail: string } {
  const itemReasons = g.reasons.filter((r) => r.startsWith('brief-item'));
  const bReasons = g.reasons.filter((r) => r.startsWith('B'));
  const codes = [...new Set(itemReasons.map((r) => /^brief-item:\s*(K\d+)/.exec(r)?.[1]).filter((x): x is string => !!x))];
  if (g.rules.includes('A')) return { reason: 'plan-coverage', detail: `Kế hoạch ${short} bỏ sót đích: ${g.uncovered.join(', ')} — không ai nhận; chưa chạy hạng mục nào` };
  if (itemReasons.length) return { reason: 'plan-brief-items', detail: `Kế hoạch ${short} thiếu hạng mục đề bài: ${codes.join(', ') || 'xem lý do'} (${itemReasons.map((r) => r.replace(/^brief-item:\s*/, '')).join('; ')}) — chưa chạy hạng mục nào` };
  return { reason: 'plan-unreadable', detail: `Kế hoạch ${short} đọc dở: ${(bReasons.length ? bReasons : g.reasons).join('; ') || 'không rõ lý do'} — chưa chạy hạng mục nào` };
}
