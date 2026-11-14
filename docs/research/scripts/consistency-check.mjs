#!/usr/bin/env node
// B-05 — kiểm nhất quán số liệu nghiên cứu.
// Dùng: node docs/research/scripts/consistency-check.mjs [thư-mục-gốc] [--json] [--facts <tệp>]
// Quét docs/research/** và docs/PROCESS-REVIEW.md (chỉ .md), bỏ qua CHANGELOG.md, context/ và BRIEF*.md (đề bài lịch sử — đầu vào đã giao, không sửa lại).
// Đọc docs/research/facts.json:
//   stale:   [{id, pattern, reason, files?, exceptions?}]  — cụm đã lỗi thời, khớp là lỗi.
//   numbers: [{id, value, pattern, files, exceptions}]     — nhóm bắt đầu tiên của pattern (hoặc cả khớp)
//                                                            phải bằng value.
//   exceptions: [{file, line? | anchor?, reason}] — bỏ qua khi khớp tệp (và dòng nếu có); reason bắt buộc.
//     "anchor": "<cụm duy nhất>" thay cho "line": dòng được tính từ nơi cụm xuất hiện trong tệp; không thấy
//     hoặc xuất hiện hơn một lần ⇒ lỗi (exit 2). Dạng "line": N vẫn dùng được (tương thích cũ).
// Mục quét đường dẫn máy (FX20): mọi .md dưới docs/research/ không được chứa đường dẫn người dùng/tạm của máy
// (ổ Windows kèm Users, /home/<tên>/, /Users/<tên>/, /tmp/, /var/folders/, AppData\Local\Temp); có ⇒ exit 1.
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

// Tệp được miễn quét đường dẫn máy (FX20). Nguồn: docs/research/CHANGELOG.md, mục "Sau gói 15":
// tệp dữ liệu thô trong results/ (*.json, *.jsonl, stdout.txt, cấu hình, .ps1) không sửa vì sẽ sai mã băm
// (các loại này không phải .md nên không bị quét); preregistration.md là văn bản đã đăng ký, không sửa.
const MACHINE_PATH_EXEMPT = [
  'docs/research/preregistration.md',
];
const MACHINE_PATH_PATTERNS = [
  { id: 'windows-users', re: /[A-Za-z]:[\\/]+Users[\\/]/ },
  { id: 'home-linux', re: /(?<![\w.\-/])\/home\/[^\s/`)"'<>]+\// },
  { id: 'home-mac', re: /(?<![\w.\-/])\/Users\/[^\s/`)"'<>]+\// },
  { id: 'tmp', re: /(?<![\w.\-/])\/tmp\// },
  { id: 'var-folders', re: /(?<![\w.\-/])\/var\/folders\// },
  { id: 'appdata-temp', re: /AppData[\\/]+Local[\\/]+Temp/i },
];

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
    } else if (/\.md$/i.test(e.name) && e.name.toLowerCase() !== 'changelog.md' && !/^BRIEF/i.test(e.name)) out.push(full);
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

// Giải anchor thành số dòng (một lần cho mỗi exception).
for (const item of [...stale, ...numbers]) {
  for (const ex of item.exceptions ?? []) {
    if (ex.anchor === undefined) continue;
    if (ex.line !== undefined) fail(`mục ${item.id}: exception ${ex.file} có cả line và anchor`);
    const abs = join(root, ex.file);
    if (!existsSync(abs)) fail(`mục ${item.id}: exception anchor — không thấy tệp ${ex.file}`);
    const anchor = nfc(ex.anchor);
    const hits = [];
    nfc(readFileSync(abs, 'utf8')).split(/\r?\n/).forEach((t, i) => {
      let from = 0;
      for (;;) {
        const k = t.indexOf(anchor, from);
        if (k < 0) break;
        hits.push(i + 1);
        from = k + Math.max(anchor.length, 1);
      }
    });
    if (hits.length !== 1) {
      fail(`mục ${item.id}: anchor "${ex.anchor}" trong ${ex.file} ${hits.length === 0 ? 'không tìm thấy' : `xuất hiện ${hits.length} lần (dòng ${hits.join(', ')}), cần duy nhất`}`);
    }
    ex.line = hits[0];
  }
}

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
  if (!MACHINE_PATH_EXEMPT.includes(rel)) {
    lines.forEach((text, i) => {
      for (const p of MACHINE_PATH_PATTERNS) {
        if (p.re.test(text)) {
          results.push({ file: rel, line: i + 1, id: 'machine-path', kind: 'machine-path', message: `đường dẫn máy (${p.id}) — thay bằng <máy-chạy>/<máy-cloud>` });
          break;
        }
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
