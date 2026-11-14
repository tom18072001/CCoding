// LLM judges: checklist (per-item yes/no) and blinded pairwise preference. Both call `claude -p` with no tools.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { claudeEnv } from './claude.mjs';
import { fisherYates, mulberry32 } from './stats.mjs';

/** Remove cues that reveal which system wrote a deliverable. */
export function blind(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/CCoding|ccoding|herdr|Claude Code/gi, '[SYS]')
    .replace(/\b(orchestrator|dev-lead|research-lead|solution-architect|senior-swe|backend-dev|frontend-dev|data-engineer|devops|security|business-analyst|ba-presales|tech-writer|qa-tester|literature-researcher|data-scientist|methodologist|academic-writer|peer-reviewer|cto)\b/gi, '[ROLE]')
    .replace(/Trưởng phòng|Điều phối viên|Phòng (Phát triển|Nghiên cứu)|Kiến trúc sư|Phản biện/gi, '[ROLE]')
    .replace(/\[bench [^\]]*\]/g, '')
    // SR-08b: tên mô hình, dòng đồng tác giả và biểu tượng cảm xúc cũng là dấu hiệu nhận ra hệ thống
    .replace(/\b(claude[- ]?(?:opus|sonnet|haiku|fable)?[- ]?\d*(?:[.-]\d+)*|opus|sonnet|haiku|fable|anthropic)\b/gi, '[MODEL]')
    .replace(/^.*Co-Authored-By:.*$/gim, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** SR-08b: đoán ngôn ngữ chính ('vi' nếu tỉ lệ ký tự có dấu tiếng Việt đủ cao, ngược lại 'en'). Ghi lại để biết cặp lệch ngôn ngữ (lộ hệ thống). */
export function detectLang(text) {
  const t = String(text ?? '');
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (!letters) return 'en';
  const vi = (t.match(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/giu) ?? []).length;
  return vi / letters > 0.02 ? 'vi' : 'en';
}

/** SR-08b: ghép tệp sản phẩm thành một văn bản với tiêu đề trung tính (tên tệp REVIEW.md/NOTES.md tự nó là dấu hiệu). */
export function joinParts(parts) {
  return parts.map((t, i) => (parts.length > 1 ? `## Part ${i + 1}\n` : '') + String(t)).join('\n\n');
}

const logFact = (m) => { let r = 0; for (let i = 2; i <= m; i++) r += Math.log(i); return r; };

/** Kiểm định dấu hai phía chính xác (hòa bị loại): p = min(1, 2·P[X ≤ min(wx,wy)]), X ~ Bin(n, 1/2). */
export function signTest(wx, wy) {
  const n = wx + wy;
  if (n === 0) return { n, p: 1 };
  const k = Math.min(wx, wy), ln = logFact(n);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(ln - logFact(i) - logFact(n - i) - n * Math.LN2);
  return { n, p: Math.min(1, 2 * tail) };
}

/** Khoảng tin cậy Wilson cho tỉ lệ k/n (z = 1,96 mặc định). */
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

function ask(prompt, { model = 'opus', bin = 'claude', binArgs = [] } = {}) {
  const r = spawnSync(bin, [...binArgs, '-p', prompt, '--output-format', 'json', '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config'], { cwd: os.tmpdir(), env: claudeEnv(), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`judge failed: ${r.stderr?.slice(-500)}`);
  const out = JSON.parse(r.stdout);
  const text = String(out.result ?? '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${text.slice(0, 300)}`);
  return { json: JSON.parse(m[0]), usage: out.usage, costUsd: out.total_cost_usd };
}

/** Returns { [itemId]: boolean }. Each item is judged strictly: partial or implied coverage = false. */
export async function judgeChecklist(text, items, opts = {}) {
  const list = items.map((it) => `- ${it.id}: ${it.question}`).join('\n');
  const prompt = `You are a strict grader. Read the DOCUMENT and answer each checklist question with true only if the document explicitly and correctly satisfies it; vague, implied or incorrect coverage is false.\n\nCHECKLIST:\n${list}\n\nDOCUMENT:\n<<<\n${blind(text).slice(0, 120000)}\n>>>\n\nReply with only a JSON object mapping each id to true or false.`;
  const { json } = ask(prompt, opts);
  return Object.fromEntries(items.map((it) => [it.id, json[it.id] === true]));
}

/**
 * Blinded pairwise preference, run in both orders to cancel position bias.
 * Returns { winner: 'x'|'y'|'tie', votes: [...] } where x/y are the caller's labels.
 */
export async function judgePair(brief, rubric, x, y, opts = {}) {
  const once = (first, second) => {
    const prompt = `Two anonymous deliverables answer the same brief. Judge which better satisfies the brief and rubric: correctness first, then completeness, then clarity. Ignore length, style and language (Vietnamese or English) unless they hurt usefulness.\n\nBRIEF:\n${brief}\n\nRUBRIC:\n${rubric}\n\nDELIVERABLE A:\n<<<\n${blind(first).slice(0, 60000)}\n>>>\n\nDELIVERABLE B:\n<<<\n${blind(second).slice(0, 60000)}\n>>>\n\nReply with only JSON: {"winner":"A"|"B"|"tie","reason":"<one sentence>"}`;
    return ask(prompt, opts).json;
  };
  const v1 = once(x, y), v2 = once(y, x);
  const map1 = { A: 'x', B: 'y', tie: 'tie' }[v1.winner] ?? 'tie';
  const map2 = { A: 'y', B: 'x', tie: 'tie' }[v2.winner] ?? 'tie';
  return { winner: map1 === map2 ? map1 : 'tie', votes: [{ order: 'xy', ...v1 }, { order: 'yx', ...v2 }] };
}

// ---------- SR-08a: giám khảo thứ hai, đồng thuận, phiếu người ----------

/** Tỉ lệ đồng thuận giữa hai dãy phán quyết cùng độ dài (undefined nếu rỗng/lệch độ dài). */
export function agreementRate(a, b) {
  if (!a.length || a.length !== b.length) return undefined;
  return a.filter((x, i) => x === b[i]).length / a.length;
}

/** Cohen's kappa cho hai dãy nhãn (undefined khi mẫu rỗng; 1 khi cả hai không biến thiên và trùng nhau). */
export function cohenKappa(a, b) {
  if (!a.length || a.length !== b.length) return undefined;
  const n = a.length, po = a.filter((x, i) => x === b[i]).length / n;
  const labels = [...new Set([...a, ...b])];
  const pe = labels.reduce((s, l) => s + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n), 0);
  return pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
}

/** Số cặp tối thiểu cho phiếu người: ceil(frac · n), ít nhất 1 khi n > 0. */
export const ballotCount = (n, frac = 0.2) => (n ? Math.min(n, Math.max(1, Math.ceil(n * frac - 1e-9))) : 0);

/** Chọn ngẫu nhiên có hạt ≥ frac số cặp (chỉ số, giữ thứ tự gốc). */
export function pickBallots(n, { frac = 0.2, seed = 20261104 } = {}) {
  const idx = fisherYates([...Array(n).keys()], mulberry32(seed)).slice(0, ballotCount(n, frac));
  return idx.sort((a, b) => a - b);
}

/** Mã cặp ẩn danh: băm có muối của id cặp; không chứa tên bài, nhánh hay lượt chạy. */
export const ballotCode = (id, salt) => `P${createHash('sha256').update(`${salt}|${id}`).digest('hex').slice(0, 8)}`;

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
/** CSV phiếu: chỉ mã cặp ẩn danh, hạng mục, tệp A/B đã làm mù, cột trống cho người chấm. Không có id, tên nhánh hay PII. */
export function ballotsCsv(rows) {
  const head = ['pairCode', 'category', 'fileA', 'fileB', 'humanWinner', 'note'];
  return `${[head, ...rows.map((r) => [r.code, r.category, r.fileA, r.fileB, '', ''])].map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
}
