#!/usr/bin/env node
// B-05 — kiểm nhất quán số liệu nghiên cứu.
// Dùng: node docs/research/scripts/consistency-check.mjs [thư-mục-gốc] [--json] [--facts <tệp>]
// Quét docs/research/** và docs/PROCESS-REVIEW.md (chỉ .md), bỏ qua CHANGELOG.md và context/.
// Đọc docs/research/facts.json:
//   stale:   [{id, pattern, reason, files?, exceptions?}]  — cụm đã lỗi thời, khớp là lỗi.
//   numbers: [{id, value, pattern, files, exceptions}]     — nhóm bắt đầu tiên của pattern (hoặc cả khớp)
//                                                            phải bằng value.
//   exceptions: [{file, line?, reason}] — bỏ qua khi khớp tệp (và dòng nếu có); reason bắt buộc.
// Exit 1 nếu có lỗi; --json in mảng [{file, line, id, kind, message}].
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
let factsArg;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') continue;
  if (args[i] === '--facts') { factsArg = args[++i]; continue; }
  positional.push(args[i]);
}
const root = positional[0] ?? process.cwd();
const factsPath = factsArg ?? join(root, 'docs', 'research', 'facts.json');

const nfc = (s) => s.normalize('NFC');
const toPosix = (p) => p.split(sep).join('/');

function globToRegExp(glob) {
  let re = '';
  const g = nfc(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'u');
}

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'context' || e.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.md$/i.test(e.name) && e.name.toLowerCase() !== 'changelog.md') out.push(full);
  }
}

function fail(msg) {
  console.error(`consistency-check: ${msg}`);
  process.exit(2);
}

if (!existsSync(factsPath)) fail(`không thấy ${factsPath}`);
let facts;
try { facts = JSON.parse(readFileSync(factsPath, 'utf8')); }
catch (e) { fail(`facts.json không phải JSON hợp lệ: ${e.message}`); }

const compile = (item) => {
  try { return new RegExp(nfc(item.pattern), 'u'); }
  catch (e) { return fail(`mục ${item.id}: pattern lỗi: ${e.message}`); }
};
const stale = (facts.stale ?? []).map((s) => ({ ...s, re: compile(s), fileRes: (s.files ?? ['**/*']).map(globToRegExp) }));
const numbers = (facts.numbers ?? []).map((n) => ({ ...n, re: compile(n), fileRes: (n.files ?? ['**/*']).map(globToRegExp) }));
for (const item of [...stale, ...numbers]) {
  for (const ex of item.exceptions ?? []) {
    if (!ex.file || !ex.reason) fail(`mục ${item.id}: exception thiếu file hoặc reason`);
  }
}

const files = [];
walk(join(root, 'docs', 'research'), files);
const review = join(root, 'docs', 'PROCESS-REVIEW.md');
if (existsSync(review)) files.push(review);

const excepted = (item, rel, line) =>
  (item.exceptions ?? []).some((ex) => nfc(ex.file) === rel && (ex.line === undefined || ex.line === line));

const results = [];
for (const abs of files.sort()) {
  const rel = nfc(toPosix(relative(root, abs)));
  const lines = nfc(readFileSync(abs, 'utf8')).split(/\r?\n/);
  const relFromResearch = rel.replace(/^docs\/research\//, '');
  for (const s of stale) {
    if (!s.fileRes.some((r) => r.test(rel) || r.test(relFromResearch))) continue;
    lines.forEach((text, i) => {
      if (s.re.test(text) && !excepted(s, rel, i + 1)) {
        results.push({ file: rel, line: i + 1, id: s.id, kind: 'stale', message: `cụm lỗi thời — ${s.reason}` });
      }
    });
  }
  for (const n of numbers) {
    if (!n.fileRes.some((r) => r.test(rel) || r.test(relFromResearch))) continue;
    lines.forEach((text, i) => {
      const m = n.re.exec(text);
      if (!m) return;
      const found = (m[1] ?? m[0]).trim();
      if (found !== nfc(String(n.value)) && !excepted(n, rel, i + 1)) {
        results.push({ file: rel, line: i + 1, id: n.id, kind: 'number', message: `số sai: "${found}", chuẩn "${n.value}"` });
      }
    });
  }
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) console.log(`${r.file}:${r.line} — ${r.id} — ${r.message}`);
  const byId = {};
  for (const r of results) byId[r.id] = (byId[r.id] ?? 0) + 1;
  const summary = Object.entries(byId).map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(results.length ? `\n${results.length} lỗi (${summary}) trong ${files.length} tệp.` : `Đạt: ${files.length} tệp, không lệch số liệu.`);
}
process.exit(results.length ? 1 : 0);
