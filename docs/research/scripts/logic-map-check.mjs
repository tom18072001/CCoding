#!/usr/bin/env node
// FX19 (làm cứng, BRIEF-22c K1) — kiểm tự động tham chiếu `tệp:dòng` trong bản đồ logic, báo cáo, backlog và bài.
// Dùng: node docs/research/scripts/logic-map-check.mjs [--base <commit>] [--root <thư-mục-repo>]
//        [--no-default] [--json] [--no-strict] [--sample N [--seed S]] [tệp.md ...]
// Mốc (commit) lấy từ --base, hoặc từ dòng `Mốc: <hash 40 ký tự>` trong 10 dòng đầu của logic-map.md
// (chấp nhận bọc ** hoặc dấu backtick quanh hash).
//
// Quy tắc (mặc định là --strict; --no-strict chỉ để chẩn đoán):
//  1. Mỗi tham chiếu `đường/dẫn.ext:N` (hoặc `:N–M`) phải kèm ký hiệu ĐẶC THÙ ngay sau, trong ngoặc: (`ký hiệu`) hoặc (“cụm”).
//  2. Ký hiệu đặc thù là một trong ba loại:
//       a. định danh (tên hàm, hằng, khóa cấu hình): ≥ 4 ký tự, chỉ gồm chữ/số/_/$/./-, không thuộc danh sách từ chung;
//       b. tiêu đề mục Markdown: dòng đích bắt đầu bằng `#` và chứa chữ của tiêu đề (≥ 4 ký tự);
//       c. cụm chữ ≥ 12 ký tự (có thể gồm khoảng trắng).
//  3. Ký hiệu phải có trên ĐÚNG dòng ở mốc (`git show <mốc>:<tệp>`). Định danh khớp theo ranh giới từ.
//     Tham chiếu dải N–M: ký hiệu phải có trên dòng N hoặc dòng M (đầu hoặc cuối dải), không khớp theo cả dải.
//  4. Thiếu ký hiệu đặc thù, hoặc chỉ có ký hiệu ngắn/chung ⇒ lỗi (strict) hay cảnh báo (--no-strict).
//  5. Phạm vi tệp đích: agents/*.md (bắt buộc kèm cụm trích), src/**, bench/**, tệp cấu hình gốc đã theo dõi
//     (vd. ccoding.config.json). .md ngoài agents/ không được quét. Bí danh `orch` = `src/orchestrator.ts` khai báo
//     dạng `orch` = `src/orchestrator.ts` trong tệp quét; tên trần như lane.ts nếu duy nhất dưới src/ (agents/ với .md).
// Tệp quét mặc định (dưới docs/research/): analysis/decisions/{logic-map,report,model-per-role,scorecard}.md,
// improvement-backlog.md (từ khối B-20 trở đi), paper/paper.md (chỉ §4.4). Tệp thêm qua tham số; --no-default bỏ mặc định.
// --sample N --seed S: chọn N tham chiếu bằng PRNG có seed (mulberry32), cùng seed ⇒ cùng mẫu; in tệp:dòng, ký hiệu,
// đoạn chữ quanh tham chiếu trong bài và dòng thật ở mốc để người đọc kiểm bằng mắt. Không đổi mã thoát.
// Exit 0 khi không lệch; 1 khi có lệch; 2 khi lỗi cấu hình (không có mốc, không đọc được tệp, tham số sai).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';

// Phần của tệp được quét: from/to là regex trên từng dòng. `to` là dòng đầu tiên NGOÀI phần (không quét).
const DEFAULT_FILES = [
  { f: 'docs/research/analysis/decisions/logic-map.md' },
  { f: 'docs/research/analysis/decisions/report.md' },
  { f: 'docs/research/improvement-backlog.md', from: /^\*\*\(b\) Mục mới B-20/ },
  { f: 'docs/research/analysis/decisions/model-per-role.md' },
  { f: 'docs/research/analysis/decisions/scorecard.md' },
  { f: 'docs/research/paper/paper.md', from: /^### 4\.4 /, to: /^#{1,3} (?!4\.4 )/ },
];

export const MIN_IDENT_LEN = 4;
export const MIN_PHRASE_LEN = 12;
// Từ chung: có thể khớp ở nhiều dòng/ngữ cảnh nên không đủ làm ký hiệu đặc thù.
export const GENERIC_SYMBOLS = new Set([
  'single', 'accept', 'plan', 'gate', 'final', 'route', 'skip', 'brief', 'full', 'run', 'main', 'task', 'step', 'lane', 'mode',
  'agent', 'model', 'error', 'result', 'report', 'review', 'names', 'tasks', 'want', 'call', 'prev', 'body', 'files', 'roots',
  'why', 'after', 'prior', 'done', 'pause', 'prefs', 'bash', 'true', 'false', 'null', 'this', 'const', 'return', 'from', 'with',
  'data', 'text', 'path', 'name', 'type', 'list', 'item', 'line', 'file', 'value', 'state', 'args', 'opts', 'options', 'config',
  'input', 'output', 'rule', 'rules', 'check', 'tool', 'tools', 'diff', 'code', 'cwd', 'env', 'note', 'notes', 'key', 'keys',
]);

const args = process.argv.slice(2);
let base; let root = process.cwd(); let noDefault = false; let asJson = false; let strict = true;
let sampleN = null; let seed = 1;
const extra = [];
const dieEarly = (m) => { console.error(`logic-map-check: ${m}`); process.exit(2); };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--strict') strict = true;
  else if (a === '--no-strict') strict = false;
  else if (a === '--base') base = args[++i];
  else if (a === '--root') root = resolve(args[++i]);
  else if (a === '--no-default') noDefault = true;
  else if (a === '--json') asJson = true;
  else if (a === '--sample') { sampleN = Number(args[++i]); if (!Number.isInteger(sampleN) || sampleN < 0) dieEarly('--sample cần số nguyên ≥ 0'); }
  else if (a === '--seed') { seed = Number(args[++i]); if (!Number.isInteger(seed)) dieEarly('--seed cần số nguyên'); }
  else if (a.startsWith('--')) dieEarly(`tham số không hợp lệ: ${a}`);
  else extra.push(a);
}
const die = dieEarly;

const nfc = (s) => s.normalize('NFC');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// files: {abs, from, to}
const entries = [
  ...(noDefault ? [] : DEFAULT_FILES.map((e) => ({ abs: join(root, e.f), from: e.from, to: e.to }))),
  ...extra.map((f) => ({ abs: resolve(f) })),
];
const texts = new Map(); const scope = new Map();
for (const e of entries) {
  if (!existsSync(e.abs)) { if (noDefault || extra.some((x) => resolve(x) === e.abs)) die(`không thấy ${e.abs}`); continue; }
  texts.set(e.abs, nfc(readFileSync(e.abs, 'utf8')));
  scope.set(e.abs, e);
}
// Phạm vi dòng quét [lo, hi) (chỉ số 0-based) cho một tệp.
function scanRange(abs, lines) {
  const e = scope.get(abs);
  let lo = 0; let hi = lines.length;
  if (e?.from) { lo = lines.findIndex((l) => e.from.test(l)); if (lo < 0) lo = lines.length; }
  if (e?.to) { const k = lines.findIndex((l, i) => i > lo && e.to.test(l)); if (k >= 0) hi = k; }
  return [lo, hi];
}

if (!base) {
  for (const [f, t] of texts) {
    if (!/logic-map\.md$/i.test(f)) continue;
    const m = t.split(/\r?\n/).slice(0, 10).join('\n').match(/Mốc:\s*[*`]*\s*([0-9a-f]{40})\b/);
    if (m) { base = m[1]; break; }
  }
}
if (!base) die('không có mốc: thêm dòng `Mốc: <hash 40 ký tự>` ở đầu logic-map.md hoặc dùng --base');
try { base = git('rev-parse', '--verify', `${base}^{commit}`).trim(); } catch { die(`mốc ${base} không phải commit trong repo`); }

// Bí danh `orch` = `src/orchestrator.ts` khai báo trong các tệp quét.
const aliases = new Map();
for (const t of texts.values()) {
  for (const m of t.matchAll(/`([A-Za-z][\w-]*)`\s*=\s*`([\w./-]+\.(?:ts|mjs|js))`/g)) aliases.set(m[1], m[2]);
}
const tracked = git('ls-tree', '-r', '--name-only', base).split(/\r?\n/).filter(Boolean);
const trackedSet = new Set(tracked);
const byBase = new Map();
for (const p of tracked) {
  if (!p.startsWith('src/')) continue;
  const b = p.split('/').pop();
  byBase.set(b, byBase.has(b) ? null : p);
}
function resolvePath(p) {
  if (aliases.has(p)) return aliases.get(p);
  if (trackedSet.has(p)) return p;
  if (!p.includes('/') && byBase.get(p)) return byBase.get(p);
  return null;
}
// Tham chiếu hồ sơ agent (agents/**/*.md): tên đầy đủ hoặc tên trần duy nhất dưới agents/. .md khác không được quét.
const byBaseAgent = new Map();
for (const p of tracked) {
  if (!p.startsWith('agents/') || !p.endsWith('.md')) continue;
  const b = p.split('/').pop();
  byBaseAgent.set(b, byBaseAgent.has(b) ? null : p);
}
function resolveAgentMd(p) {
  if (trackedSet.has(p) && p.startsWith('agents/')) return p;
  if (!p.includes('/') && byBaseAgent.get(p)) return byBaseAgent.get(p);
  return null;
}

const cache = new Map();
function linesAt(path) {
  if (!cache.has(path)) {
    try { cache.set(path, nfc(git('show', `${base}:${path}`)).split(/\r?\n/)); } catch { cache.set(path, null); }
  }
  return cache.get(path);
}

// ---- Phân loại ký hiệu ----
const IDENT_RE = /^[A-Za-z_$][\w$.-]*$/;
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// kind: 'ident' | 'phrase' | 'heading' | null (yếu). Heading chỉ xác định được khi biết dòng đích: xử lý ở matchOnLine.
export function classify(sym) {
  const s = sym.trim().replace(/\(\)$/, '');
  if (IDENT_RE.test(s)) {
    if (s.length >= MIN_IDENT_LEN && !GENERIC_SYMBOLS.has(s.toLowerCase())) return { sym: s, kind: 'ident' };
    return { sym: s, kind: null };
  }
  if (s.length >= MIN_PHRASE_LEN) return { sym: s, kind: 'phrase' };
  if (s.length >= MIN_IDENT_LEN) return { sym: s, kind: 'maybe-heading' }; // chỉ đặc thù nếu là tiêu đề mục
  return { sym: s, kind: null };
}
function matchOnLine(c, line) {
  if (c.kind === 'ident') return new RegExp(`(?<![\\w$])${escRe(c.sym)}(?![\\w$])`).test(line);
  if (c.kind === 'phrase') return line.includes(c.sym);
  if (c.kind === 'maybe-heading') return /^\s{0,3}#{1,6}\s/.test(line) && line.includes(c.sym);
  return false;
}

const aliasKeys = [...aliases.keys()].map(escRe);
const pathPart = `(?:[A-Za-z0-9_./-]+\\.(?:ts|mjs|js|json|md)${aliasKeys.length ? `|${aliasKeys.join('|')}` : ''})`;
const refRe = new RegExp(`(?<![\\w./-])(${pathPart}):(\\d+)(?:[–-](\\d+))?(?!\\d)(\`?)(?:[ \\t]*\\(([^)\\n]*)\\))?`, 'gu');

const all = []; // mọi tham chiếu
const bad = []; const noSymbol = []; const weak = [];
let total = 0; let withSymbol = 0;
for (const [f, text] of texts) {
  const rel = relative(root, f).split('\\').join('/');
  const lines = text.split(/\r?\n/);
  const [lo, hi] = scanRange(f, lines);
  for (let idx = lo; idx < hi; idx++) {
    const line = lines[idx];
    for (const m of line.matchAll(refRe)) {
      const [whole, rawPath, a, b, , paren] = m;
      const isMd = /\.md$/.test(rawPath);
      let path = isMd ? resolveAgentMd(rawPath) : resolvePath(rawPath);
      if (isMd && !path) continue; // .md ngoài agents/ không thuộc phạm vi kiểm
      total++;
      const where = `${rel}:${idx + 1}`;
      const from = Number(a); const to = b ? Number(b) : from;
      const ref = `${rawPath}:${a}${b ? `–${b}` : ''}`;
      const ctx = line.slice(Math.max(0, m.index - 60), m.index + whole.length + 40).trim();
      const rec = { where, ref, symbol: '', path: path || null, from, to, ctx, status: 'ok', real: '' };
      all.push(rec);
      const fail = (reason, kind = 'bad') => { rec.status = kind; rec.reason = reason; bad.push({ where, ref, symbol: rec.symbol, reason }); };

      // Ký hiệu: mọi mục trong `…` hoặc “…” của ngoặc ngay sau; hoặc cả ngoặc nếu trông như định danh.
      const cands = [];
      if (paren !== undefined) {
        for (const x of paren.matchAll(/`([^`]+)`|[“"]([^”"]+)[”"]/g)) cands.push((x[1] ?? x[2]).trim());
        if (!cands.length) {
          const cand = paren.trim().replace(/\(\)$/, '');
          if (!isMd && /^[A-Za-z_$][\w$]*[A-Z_.][\w$.]*$/.test(cand)) cands.push(cand); // ngoặc chữ thường thuần không phải ký hiệu
        }
      }
      rec.symbol = cands.join(' | ');
      if (!cands.length) {
        if (isMd) { withSymbol++; fail('tham chiếu hồ sơ agent bắt buộc kèm cụm trích (`cụm` hoặc “cụm”) ngay sau'); }
        else {
          noSymbol.push({ where, ref }); rec.status = 'nosymbol';
          if (strict) fail('thiếu ký hiệu đặc thù trong ngoặc ngay sau tham chiếu (--strict): thêm (`tên hàm/hằng`) hoặc (“cụm ≥ 12 ký tự”)', 'nosymbol');
        }
        continue;
      }
      withSymbol++;
      const cls = cands.map(classify);
      const real = cls.filter((c) => c.kind);
      if (!path) path = resolvePath(rawPath);
      if (!path) { fail(`không thấy tệp ${rawPath} ở mốc`); continue; }
      rec.path = path;
      const ls = linesAt(path);
      if (!ls) { fail(`không đọc được ${path} ở mốc`); continue; }
      if (from < 1 || to > ls.length || to < from) { fail(`dòng ngoài tệp (${path} có ${ls.length} dòng)`); continue; }
      rec.real = (ls[from - 1] ?? '').trim();
      // Ký hiệu yếu: không có ứng viên đặc thù nào. maybe-heading chỉ tính khi dòng đích là tiêu đề.
      const specific = real.filter((c) => c.kind !== 'maybe-heading' || /^\s{0,3}#{1,6}\s/.test(ls[from - 1] ?? '') || /^\s{0,3}#{1,6}\s/.test(ls[to - 1] ?? ''));
      if (!specific.length) {
        weak.push({ where, ref, symbol: rec.symbol });
        rec.status = 'weak';
        if (strict) fail(`ký hiệu không đặc thù (định danh < ${MIN_IDENT_LEN} ký tự hoặc từ chung, cụm < ${MIN_PHRASE_LEN} ký tự) — chọn tên hàm/hằng, tiêu đề mục hoặc cụm ≥ ${MIN_PHRASE_LEN} ký tự (--strict)`, 'weak');
        if (strict) continue;
      }
      const pool = specific.length ? specific : cls;
      // Đúng dòng: dòng đầu hoặc dòng cuối của dải (không khớp theo cả dải).
      const edge = [ls[from - 1], ls[to - 1]];
      const hit = [from, to].find((n, i) => pool.some((c) => matchOnLine(c.kind ? c : { ...c, kind: 'phrase' }, edge[i])));
      if (hit !== undefined) { rec.matchedLine = hit; rec.real = (ls[hit - 1] ?? '').trim(); } // m3: in đúng dòng đã khớp
      else {
        const c0 = pool[0];
        const near = []; ls.forEach((l, i) => { if (matchOnLine(c0.kind ? c0 : { ...c0, kind: 'phrase' }, l)) near.push(i + 1); });
        fail(`dòng ${from}${to > from ? ` và ${to}` : ''} của ${path} không chứa "${c0.sym}"${near.length ? `; ký hiệu có ở dòng ${near.slice(0, 5).join(', ')}` : ''}`);
      }
    }
  }
}

// ---- Mẫu có seed ----
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleIndices(n, k, sd) {
  const rnd = mulberry32(sd); const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, Math.min(k, n)).sort((x, y) => x - y);
}
const sample = sampleN === null ? null : sampleIndices(all.length, sampleN, seed).map((i) => all[i]);

if (asJson) {
  console.log(JSON.stringify({ base, strict, total, withSymbol, mismatched: bad.length, noSymbol: noSymbol.length, weakSymbol: weak.length, bad, noSymbolRefs: noSymbol, weakSymbolRefs: weak, ...(sample ? { seed, sample: sample.map(({ where, ref, symbol, ctx, real, status, matchedLine }) => ({ where, ref, symbol, ctx, real, status, matchedLine: matchedLine ?? null })) } : {}) }, null, 2));
} else {
  console.log(`Mốc: ${base}`);
  console.log(`Chế độ: ${strict ? 'strict (mặc định)' : 'no-strict (chẩn đoán)'}`);
  console.log(`Tổng tham chiếu tệp:dòng: ${total} (có ký hiệu: ${withSymbol}, không ký hiệu: ${noSymbol.length}); lệch: ${bad.length}.`);
  for (const r of bad) console.log(`LỆCH ${r.where} — ${r.ref}${r.symbol ? ` (\`${r.symbol}\`)` : ''}: ${r.reason}`);
  if (!strict) {
    if (weak.length) {
      console.error(`Cảnh báo: ${weak.length} tham chiếu có ký hiệu không đặc thù (strict coi là lỗi):`);
      for (const r of weak) console.error(`  ${r.where} — ${r.ref} (\`${r.symbol}\`)`);
    }
    if (noSymbol.length) {
      console.error(`Cảnh báo: ${noSymbol.length} tham chiếu không kèm ký hiệu trong ngoặc, chưa kiểm được (strict coi là lỗi):`);
      for (const r of noSymbol) console.error(`  ${r.where} — ${r.ref}`);
    }
  }
  if (sample) {
    console.log(`\nMẫu ${sample.length}/${all.length} tham chiếu (seed ${seed}):`);
    for (const r of sample) {
      console.log(`- ${r.ref} tại ${r.where} [${r.status}]\n    ký hiệu: ${r.symbol || '(không)'}\n    trong bài: …${r.ctx}…\n    dòng thật ở mốc${r.matchedLine ? ` (dòng ${r.matchedLine})` : ''}: ${r.real || '(không đọc được)'}`);
    }
  }
  console.log(bad.length ? `Không đạt: ${bad.length}/${total} tham chiếu lệch hoặc thiếu ký hiệu đặc thù.` : `Đạt: ${total} tham chiếu khớp đúng dòng ở mốc.`);
}
process.exit(bad.length ? 1 : 0);
