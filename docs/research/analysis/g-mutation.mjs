#!/usr/bin/env node
// V4-3f-G: đo cổng lệnh kiểm tra (B-02) trên lỗi cài bằng máy. Không gọi LLM, không đọc điểm cũ để chọn mẫu.
//
// Với mỗi lượt code `done` của một tệp runs.jsonl có thư mục artifact:
//   - base: chạy `npm test` của chính sản phẩm (đúng lệnh B-02 chạy, `bench/vs-claude/lib/ccoding.mjs` checkCommands) và bộ test ẩn;
//   - mut: sinh đột biến trên tệp nguồn thuộc `task.deliverable` (không đụng tệp test), lấy mẫu cố định theo hạt giống,
//     mỗi đột biến chạy lại `npm test` (cổng có chặn không) và test ẩn (có thật là lỗi không).
// Ghi JSONL từng dòng (chạy lại được, bỏ qua khóa đã có). Phân tích ở g-analyze.mjs.
//
//   node docs/research/analysis/g-mutation.mjs --runs <runs.jsonl> --artifacts <dir> --tasks bench/vs-claude/tasks \
//        --out <out.jsonl> [--perRun 12] [--seed 20261104] [--jobs 2] [--exclude t4-perf] [--only key1,key2]
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { tapScore, deliverablePaths } from '../../../bench/vs-claude/lib/grade.mjs';

export const VISIBLE_TIMEOUT_MS = 60_000;
export const HIDDEN_TIMEOUT_MS = 60_000;
export const HIDDEN_FILE_TIMEOUT_MS = 30_000;
/** Lượt có base (npm test + test ẩn) lâu hơn ngưỡng này không được sinh đột biến (chi phí CPU); vẫn tính ở G-1, G-2. */
export const SLOW_BASE_MS = 30_000;

// ───────────── toán tử đột biến (bộ "đủ" của Offutt và cs. 1996: ROR, AOR, LCR, UOI + hằng số, đảo điều kiện) ─────────────
const K = ts.SyntaxKind;
const ROR = { [K.LessThanToken]: ['<=', '>='], [K.LessThanEqualsToken]: ['<', '>'], [K.GreaterThanToken]: ['>=', '<='], [K.GreaterThanEqualsToken]: ['>', '<'] };
const EQ = { [K.EqualsEqualsEqualsToken]: ['!=='], [K.ExclamationEqualsEqualsToken]: ['==='], [K.EqualsEqualsToken]: ['!='], [K.ExclamationEqualsToken]: ['=='] };
const AOR = { [K.PlusToken]: ['-'], [K.MinusToken]: ['+'], [K.AsteriskToken]: ['/'], [K.SlashToken]: ['*'], [K.PercentToken]: ['*'] };
const LCR = { [K.AmpersandAmpersandToken]: ['||'], [K.BarBarToken]: ['&&'] };

/** Mọi vị trí đột biến của một tệp JS: [{op, start, end, repl, line}], theo thứ tự xuất hiện. */
export function mutationSites(text, fileName = 'x.js') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = [];
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const add = (op, start, end, repl) => out.push({ op, start, end, repl, line: line(start) });
  const visit = (n) => {
    if (ts.isBinaryExpression(n)) {
      const t = n.operatorToken; const k = t.kind;
      const s = t.getStart(sf), e = t.getEnd();
      for (const [op, table] of [['ROR', ROR], ['EQ', EQ], ['AOR', AOR], ['LCR', LCR]]) for (const r of table[k] ?? []) add(op, s, e, r);
    } else if (ts.isPrefixUnaryExpression(n) && n.operator === K.ExclamationToken) {
      const s = n.getStart(sf); add('UOI', s, s + 1, '');
    } else if (ts.isNumericLiteral(n)) {
      const v = Number(n.text);
      if (Number.isFinite(v)) add('CRP', n.getStart(sf), n.getEnd(), String(v === 0 ? 1 : v + 1));
    }
    if ((ts.isIfStatement(n) || ts.isWhileStatement(n)) && n.expression) {
      const c = n.expression; add('COND', c.getStart(sf), c.getEnd(), `!(${c.getText(sf)})`);
    } else if (ts.isConditionalExpression(n)) {
      const c = n.condition; add('COND', c.getStart(sf), c.getEnd(), `!(${c.getText(sf)})`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
export const applySite = (text, s) => text.slice(0, s.start) + s.repl + text.slice(s.end);

// ───────────── ngẫu nhiên có hạt giống ─────────────
export function rng(seedStr) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Lấy k phần tử không lặp (Fisher–Yates từng phần), thứ tự theo rnd. */
export function sample(arr, k, rnd) {
  const a = arr.slice(); const n = Math.min(k, a.length);
  for (let i = 0; i < n; i++) { const j = i + Math.floor(rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// ───────────── tệp sản phẩm được đột biến ─────────────
const isTestPath = (rel) => /(^|\/)(test|tests|__tests__|hidden)\//.test(rel) || /\.test\.[cm]?js$/.test(rel);
function walk(root, rel = '') {
  const d = path.join(root, rel);
  if (!fs.existsSync(d)) return [];
  if (fs.statSync(d).isFile()) return [rel];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git' ? [] : walk(root, path.posix.join(rel, e.name))));
}
export function productFiles(dir, deliverable) {
  const files = new Set();
  for (const p of deliverablePaths(deliverable)) for (const f of walk(dir, p.replace(/\/$/, ''))) if (/\.[cm]?js$/.test(f) && !isTestPath(f)) files.add(f);
  return [...files].sort();
}

// ───────────── chạy lệnh có hạn giờ, giết cả nhóm tiến trình ─────────────
function execP(cmd, args, cwd, timeoutMs, env = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd, detached: true, env: { ...process.env, NODE_TEST_CONTEXT: undefined, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; const cap = (b) => { if (out.length < 4 << 20) out += b; };
    p.stdout.on('data', cap); p.stderr.on('data', cap);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* đã thoát */ } }, timeoutMs);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, timedOut, ms: Date.now() - t0 }); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: String(e), timedOut: false, ms: Date.now() - t0 }); });
  });
}
const copyTree = (src, dst) => fs.cpSync(src, dst, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });

/** B-02: `npm test` khi có package.json (như checkCommands của harness). Đỏ = mã thoát ≠ 0 hoặc quá hạn. */
export async function visible(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return { red: false, none: true, ms: 0 };
  const r = await execP('npm', ['test', '--silent'], dir, VISIBLE_TIMEOUT_MS);
  return { red: r.code !== 0 || r.timedOut, timedOut: r.timedOut, ms: r.ms };
}
/** Bộ test ẩn trong bản sao riêng (như gradeCode, hạn giờ ngắn hơn). Lỗi thật = không đạt hết. */
export async function hidden(dir, hiddenDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g-hid-'));
  try {
    copyTree(dir, tmp);
    fs.mkdirSync(path.join(tmp, 'hidden'), { recursive: true });
    const files = fs.readdirSync(hiddenDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const f of files) fs.copyFileSync(path.join(hiddenDir, f), path.join(tmp, 'hidden', f));
    const tests = files.filter((f) => f.endsWith('.test.js')).map((f) => `hidden/${f}`);
    const r = await execP(process.execPath, ['--test', '--test-force-exit', `--test-timeout=${HIDDEN_FILE_TIMEOUT_MS}`, '--test-reporter=tap', ...tests], tmp, HIDDEN_TIMEOUT_MS);
    const g = tapScore(r.out);
    return { pass: !r.timedOut && g.pass, timedOut: r.timedOut, total: g.details.total, ms: r.ms };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Đánh giá một lượt: base rồi (nếu đủ điều kiện) các đột biến. Gọi cb(row) cho từng dòng kết quả. */
/** Sai lệch G-b: chép tệp của starter mà artifact không có (vd. `data/` bị .gitignore bỏ khi commit artifact); không ghi đè. */
export function overlayStarter(work, starterDir) {
  let n = 0;
  if (!starterDir || !fs.existsSync(starterDir)) return n;
  for (const rel of walk(starterDir)) {
    const dst = path.join(work, rel);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(starterDir, rel), dst); n++;
  }
  return n;
}

export async function evalRun({ run, task, artifactDir, hiddenDir, starterDir, perRun, seed, skipMut = false }, cb) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'g-run-'));
  try {
    copyTree(artifactDir, work);
    const overlaid = overlayStarter(work, starterDir);
    const v0 = await visible(work);
    const h0 = await hidden(work, hiddenDir);
    const files = productFiles(work, task.deliverable);
    const sites = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(work, f), 'utf8');
      try { for (const s of mutationSites(text, f)) sites.push({ ...s, file: f }); } catch { /* tệp không phân tích được: bỏ */ }
    }
    const slow = v0.ms + h0.ms > SLOW_BASE_MS;
    const eligible = !v0.none && !v0.red && h0.pass && !slow && !skipMut;
    const base = { type: 'base', key: run.key, task: run.task, arm: run.arm, rep: run.rep, vRed: v0.red, vNone: !!v0.none, vTimeout: !!v0.timedOut, hPass: h0.pass, hTimeout: !!h0.timedOut, hTotal: h0.total, baseMs: v0.ms + h0.ms, slow, files: files.length, sites: sites.length, eligible, ...(overlaid ? { overlaid } : {}) };
    cb(base);
    if (!eligible) return;
    const pick = sample(sites, perRun, rng(`${seed}|${run.key}`));
    for (const [i, s] of pick.entries()) {
      const fp = path.join(work, s.file);
      const orig = fs.readFileSync(fp, 'utf8');
      fs.writeFileSync(fp, applySite(orig, s));
      let v, h;
      try { v = await visible(work); h = await hidden(work, hiddenDir); } finally { fs.writeFileSync(fp, orig); }
      cb({ type: 'mut', key: run.key, task: run.task, arm: run.arm, i, file: s.file, line: s.line, op: s.op, repl: s.repl, real: !h.pass, vRed: v.red, vTimeout: !!v.timedOut, hTimeout: !!h.timedOut });
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

// ───────────── CLI ─────────────
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const perRun = Number(args.perRun ?? 12), seed = String(args.seed ?? 20261104), jobs = Number(args.jobs ?? 2);
  const exclude = new Set(String(args.exclude ?? 't4-perf').split(',').filter(Boolean));
  const only = args.only ? new Set(args.only.split(',')) : null;
  const replace = args.replace ? new Set(args.replace.split(',')) : null; // sai lệch G-b: chạy lại các khóa này, thay dòng cũ
  const overlay = args['no-overlay'] !== 'true';
  const tasksDir = args.tasks, out = args.out;
  const runsText = fs.readFileSync(args.runs, 'utf8');
  const done = new Set();
  if (replace && fs.existsSync(out)) {
    const keep = fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.trim() && !replace.has(JSON.parse(l).key));
    fs.writeFileSync(out, keep.join('\n') + '\n');
  }
  if (fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); if (d.type === 'base') done.add(d.key); if (d.type === 'end') done.add(d.key + '#end'); }
  const header = { type: 'meta', runs: args.runs, runsSha256: crypto.createHash('sha256').update(runsText).digest('hex'), perRun, seed, jobs, exclude: [...exclude], node: process.version, startedAt: new Date().toISOString(), ...(replace ? { replace: [...replace] } : {}), overlay };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.appendFileSync(out, JSON.stringify(header) + '\n');
  const taskCache = new Map();
  const taskOf = (id) => { if (!taskCache.has(id)) { const p = path.join(tasksDir, id, 'task.json'); taskCache.set(id, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null); } return taskCache.get(id); };
  const queue = [];
  for (const l of runsText.split('\n')) {
    if (!l.trim()) continue;
    const run = JSON.parse(l);
    const task = taskOf(run.task);
    if (!task || task.grader !== 'code' || run.status !== 'done') continue;
    if (only && !only.has(run.key)) continue;
    if (replace && !replace.has(run.key)) continue;
    const artifactDir = path.join(args.artifacts, run.key);
    if (!fs.existsSync(artifactDir)) { fs.appendFileSync(out, JSON.stringify({ type: 'missing', key: run.key, task: run.task, arm: run.arm }) + '\n'); continue; }
    if (done.has(run.key + '#end')) continue;
    queue.push({ run, task, artifactDir, hiddenDir: path.join(tasksDir, run.task, 'hidden'), starterDir: overlay ? path.join(tasksDir, run.task, task.repoDir ?? 'repo') : undefined, perRun, seed, skipMut: exclude.has(run.task) });
  }
  // lượt dở dang (có base mà chưa có end): xóa dòng của lượt đó rồi làm lại
  if (done.size) {
    const keep = fs.readFileSync(out, 'utf8').split('\n').filter((l) => { if (!l.trim()) return false; const d = JSON.parse(l); return !d.key || done.has(d.key + '#end') || d.type === 'missing'; });
    fs.writeFileSync(out, keep.join('\n') + '\n');
  }
  let n = 0;
  const worker = async () => {
    for (;;) {
      const job = queue.shift(); if (!job) return;
      const rows = [];
      await evalRun(job, (r) => rows.push(r));
      rows.push({ type: 'end', key: job.run.key });
      fs.appendFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      n++; if (n % 10 === 0) process.stderr.write(`… ${n} lượt\n`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  fs.appendFileSync(out, JSON.stringify({ type: 'meta-end', finishedAt: new Date().toISOString(), runsEvaluated: n }) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
