#!/usr/bin/env node
// KHÔNG gán nhãn chia được hay không, KHÔNG chọn bài: script chỉ liệt kê khác biệt tất định giữa repoDir và solutionDir.
// Dùng: node bench/vs-claude/e9/gold-from-solution.mjs [--tasks-dir <dir>] [--out <file>]
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORED = new Set(['node_modules', '.git', '.venv', '__pycache__', '.ccoding']);
export const MAX_BYTES = 1024 * 1024; // quá lớn: không diff theo dòng
export const MAX_EDIT = 20000; // chặn chi phí Myers (D tối đa)

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function walk(root, rel = '', out = []) {
  const entries = readdirSync(join(root, rel), { withFileTypes: true })
    .filter((e) => !IGNORED.has(e.name))
    .sort((a, b) => cmp(a.name, b.name));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

function readNorm(path) {
  const buf = readFileSync(path);
  if (buf.length > MAX_BYTES) return { big: true, buf };
  if (buf.includes(0)) return { binary: true, buf };
  const text = buf.toString('utf8').replace(/\r\n/g, '\n');
  const lines = text === '' ? [] : text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { lines, norm: lines.join('\n'), buf };
}

// Myers: độ dài kịch bản sửa ngắn nhất D (thêm + xóa), hoặc -1 nếu vượt giới hạn.
function myersD(a, b) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea);
  const B = b.slice(s, eb);
  const N = A.length;
  const M = B.length;
  if (N === 0) return M;
  if (M === 0) return N;
  const max = Math.min(N + M, MAX_EDIT);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) return d;
    }
  }
  return -1;
}

function diffLines(a, b) {
  const d = myersD(a, b);
  if (d < 0) return null;
  const added = (d + (b.length - a.length)) / 2;
  return { added, removed: d - added };
}

function moduleOf(p) {
  const i = p.indexOf('/');
  return i < 0 ? '.' : p.slice(0, i);
}

function compareDirs(repo, sol) {
  const A = new Set(walk(repo));
  const B = new Set(walk(sol));
  const all = [...new Set([...A, ...B])].sort(cmp);
  const files = [];
  for (const p of all) {
    const inA = A.has(p);
    const inB = B.has(p);
    const fa = inA ? readNorm(join(repo, p)) : null;
    const fb = inB ? readNorm(join(sol, p)) : null;
    let change;
    let added = null;
    let removed = null;
    let flag = null;
    if (inA && inB) {
      if (fa.buf.equals(fb.buf)) continue;
      change = 'modified';
    } else change = inB ? 'added' : 'deleted';
    const parts = [fa, fb].filter(Boolean);
    if (parts.some((f) => f.binary)) flag = 'binary';
    else if (parts.some((f) => f.big)) flag = 'too_large';
    else if (change === 'modified' && fa.norm === fb.norm) continue; // chỉ khác CRLF
    else {
      const r = diffLines(fa ? fa.lines : [], fb ? fb.lines : []);
      if (!r) flag = 'too_large';
      else { added = r.added; removed = r.removed; }
    }
    files.push({ path: p, change, linesAdded: added, linesRemoved: removed, module: moduleOf(p), flag });
  }
  return files;
}

export function build(tasksDir) {
  const ids = readdirSync(tasksDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(cmp);
  const tasks = [];
  for (const id of ids) {
    const tj = join(tasksDir, id, 'task.json');
    if (!existsSync(tj)) continue;
    const t = JSON.parse(readFileSync(tj, 'utf8'));
    if (!t.repoDir || !t.solutionDir) continue;
    const repo = join(tasksDir, id, t.repoDir);
    const sol = join(tasksDir, id, t.solutionDir);
    if (!existsSync(repo) || !existsSync(sol) || !statSync(repo).isDirectory() || !statSync(sol).isDirectory()) continue;
    const files = compareDirs(repo, sol);
    const modules = [...new Set(files.map((f) => f.module))].sort(cmp);
    tasks.push({ id: t.id ?? id, size: t.size ?? null, sizeBasis: t.sizeBasis ?? null, modules, files });
  }
  tasks.sort((a, b) => cmp(a.id, b.id));
  const body = { version: 1, taskCount: tasks.length, tasks };
  const sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ...body, sha256 };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const tasksDir = resolve(opt('--tasks-dir') ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks'));
  const json = JSON.stringify(build(tasksDir), null, 2) + '\n';
  const out = opt('--out');
  if (out) writeFileSync(out, json);
  else process.stdout.write(json);
}
