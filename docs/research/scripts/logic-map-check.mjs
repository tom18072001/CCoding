#!/usr/bin/env node
// FX19 — kiểm tự động tham chiếu `tệp:dòng` trong bản đồ logic, báo cáo và backlog.
// Dùng: node docs/research/scripts/logic-map-check.mjs [--base <commit>] [--root <thư-mục-repo>]
//                                                      [--no-default] [--json] [tệp.md ...]
// Mốc (commit) lấy từ --base, hoặc từ dòng `Mốc: <hash 40 ký tự>` trong 10 dòng đầu của logic-map.md
// (chấp nhận bọc ** hoặc dấu backtick quanh hash).
// Mặc định quét: analysis/decisions/logic-map.md, analysis/decisions/report.md, improvement-backlog.md
// (đều dưới docs/research/); tệp thêm qua tham số; --no-default bỏ danh sách mặc định.
// Tham chiếu hợp lệ: `đường/dẫn.ts:N` hoặc `:N–M` (cũng nhận bí danh khai báo dạng `orch` = `src/orchestrator.ts`
// và tên tệp trần như lane.ts nếu duy nhất dưới src/), kèm ký hiệu trong ngoặc ngay sau, vd. lane.ts:129 (`chooseLane`).
// Kiểm: git show <mốc>:<tệp> — dòng (hoặc dải) phải chứa ký hiệu. Tham chiếu không kèm ký hiệu đếm riêng, chỉ cảnh báo.
// Exit 0 khi không lệch; 1 khi có lệch; 2 khi lỗi cấu hình (không có mốc, không đọc được tệp).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';

const DEFAULT_FILES = [
  'docs/research/analysis/decisions/logic-map.md',
  'docs/research/analysis/decisions/report.md',
  'docs/research/improvement-backlog.md',
];

const args = process.argv.slice(2);
let base; let root = process.cwd(); let noDefault = false; let asJson = false;
const extra = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--base') base = args[++i];
  else if (a === '--root') root = resolve(args[++i]);
  else if (a === '--no-default') noDefault = true;
  else if (a === '--json') asJson = true;
  else extra.push(a);
}
const die = (m) => { console.error(`logic-map-check: ${m}`); process.exit(2); };

const nfc = (s) => s.normalize('NFC');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

const files = [...(noDefault ? [] : DEFAULT_FILES.map((f) => join(root, f))), ...extra.map((f) => resolve(f))];
const texts = new Map();
for (const f of files) {
  if (!existsSync(f)) { if (noDefault || extra.includes(f)) die(`không thấy ${f}`); continue; }
  texts.set(f, nfc(readFileSync(f, 'utf8')));
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
const byBase = new Map();
for (const p of tracked) {
  if (!p.startsWith('src/')) continue;
  const b = p.split('/').pop();
  byBase.set(b, byBase.has(b) ? null : p);
}
function resolvePath(p) {
  if (aliases.has(p)) return aliases.get(p);
  if (tracked.includes(p)) return p;
  if (!p.includes('/') && byBase.get(p)) return byBase.get(p);
  return null;
}

const cache = new Map();
function linesAt(path) {
  if (!cache.has(path)) {
    try { cache.set(path, nfc(git('show', `${base}:${path}`)).split(/\r?\n/)); } catch { cache.set(path, null); }
  }
  return cache.get(path);
}

const aliasKeys = [...aliases.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const pathPart = `(?:[A-Za-z0-9_./-]+\\.(?:ts|mjs|js|json)${aliasKeys.length ? `|${aliasKeys.join('|')}` : ''})`;
const refRe = new RegExp(`(?<![\\w./-])(${pathPart}):(\\d+)(?:[–-](\\d+))?(?!\\d)(\`?)(?:[ \\t]*\\(([^)\\n]*)\\))?`, 'gu');

let total = 0; let withSymbol = 0;
const bad = []; const noSymbol = [];
for (const [f, text] of texts) {
  const rel = relative(root, f).split('\\').join('/');
  text.split(/\r?\n/).forEach((line, idx) => {
    for (const m of line.matchAll(refRe)) {
      const [, rawPath, a, b, , paren] = m;
      total++;
      const where = `${rel}:${idx + 1}`;
      const from = Number(a); const to = b ? Number(b) : from;
      const ref = `${rawPath}:${a}${b ? `–${b}` : ''}`;
      let sym;
      if (paren !== undefined) {
        const bt = paren.match(/`([^`]+)`/);
        const cand = (bt ? bt[1] : paren).trim().replace(/\(\)$/, '');
        if (bt || /^[A-Za-z_$][\w$]*[A-Z_.][\w$.]*$/.test(cand)) sym = cand; // ngoặc chữ thường thuần không phải ký hiệu
      }
      if (!sym) { noSymbol.push({ where, ref }); continue; }
      withSymbol++;
      const path = resolvePath(rawPath);
      if (!path) { bad.push({ where, ref, symbol: sym, reason: `không thấy tệp ${rawPath} ở mốc` }); continue; }
      const ls = linesAt(path);
      if (!ls) { bad.push({ where, ref, symbol: sym, reason: `không đọc được ${path} ở mốc` }); continue; }
      if (from < 1 || to > ls.length || to < from) { bad.push({ where, ref, symbol: sym, reason: `dòng ngoài tệp (${path} có ${ls.length} dòng)` }); continue; }
      const hit = ls.slice(from - 1, to).some((l) => l.includes(sym));
      if (!hit) {
        const near = []; ls.forEach((l, i) => { if (l.includes(sym)) near.push(i + 1); });
        bad.push({ where, ref, symbol: sym, reason: `dòng ${from}${to > from ? `–${to}` : ''} của ${path} không chứa "${sym}"${near.length ? `; ký hiệu có ở dòng ${near.slice(0, 5).join(', ')}` : ''}` });
      }
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ base, total, withSymbol, mismatched: bad.length, noSymbol: noSymbol.length, bad, noSymbolRefs: noSymbol }, null, 2));
} else {
  console.log(`Mốc: ${base}`);
  console.log(`Tổng tham chiếu tệp:dòng: ${total} (có ký hiệu: ${withSymbol}, không ký hiệu: ${noSymbol.length}); lệch: ${bad.length}.`);
  for (const r of bad) console.log(`LỆCH ${r.where} — ${r.ref} (\`${r.symbol}\`): ${r.reason}`);
  if (noSymbol.length) {
    console.error(`Cảnh báo: ${noSymbol.length} tham chiếu không kèm ký hiệu trong ngoặc, chưa kiểm được:`);
    for (const r of noSymbol) console.error(`  ${r.where} — ${r.ref}`);
  }
  console.log(bad.length ? `Không đạt: ${bad.length}/${withSymbol} tham chiếu có ký hiệu bị lệch.` : `Đạt: ${withSymbol} tham chiếu có ký hiệu khớp ở mốc.`);
}
process.exit(bad.length ? 1 : 0);
