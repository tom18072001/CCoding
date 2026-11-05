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
}

export interface PlanGateResult {
  blocked: boolean;
  rules: ('A' | 'B')[];
  uncovered: string[];
  reasons: string[];
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
export function checkPlanReadable(input: Pick<PlanGateInput, 'planSummary' | 'subtasks' | 'truncated' | 'agentIds'>): string[] {
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
  if (input.truncated) reasons.push('(iv) JSON kế hoạch bị cắt cụt hoặc không đóng');
  return reasons;
}

export function planGate(input: PlanGateInput): PlanGateResult {
  const { uncovered } = checkPlanCoverage(input);
  const readable = checkPlanReadable(input);
  const rules: ('A' | 'B')[] = [];
  const reasons: string[] = [];
  if (uncovered.length) {
    rules.push('A');
    reasons.push(`A: chưa có hạng mục nhận ${uncovered.join(', ')}`);
  }
  if (readable.length) {
    rules.push('B');
    for (const r of readable) reasons.push(`B ${r}`);
  }
  return { blocked: rules.length > 0, rules, uncovered, reasons };
}
