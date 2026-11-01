import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isWorktreeOf } from './git.js';
import { redact } from './util/redact.js';
import type { ProjectDef, Task } from './types.js';

/**
 * Diff thay đổi của một nhiệm vụ cho giao diện (chỉ đọc git, không bao giờ sửa index/worktree):
 * - worktree của nhiệm vụ còn → so commit gốc (`task.baseRef`) với trạng thái hiện tại (gồm cả phần chưa commit, tệp mới);
 * - worktree đã gỡ → so commit gốc với nhánh nhiệm vụ trong repo của dự án;
 * - `commit` → thay đổi của một commit trên nhánh (commit gộp `--no-ff` của hạng mục: so với cha thứ nhất).
 * Không chạy diff driver/textconv của repo, che bí mật, ẩn nội dung tệp .env/khóa, giới hạn kích thước.
 */

export interface DiffFile {
  path: string;
  oldPath?: string;
  /** A thêm · M sửa · D xóa · R đổi tên · C chép · T đổi kiểu · ? tệp mới chưa track. */
  status: string;
  add: number;
  del: number;
  binary?: boolean;
  /** Tệp nhạy cảm (.env, khóa…) — chỉ hiện tên, không hiện nội dung. */
  hidden?: boolean;
}

export interface DiffCommit {
  sha: string;
  subject: string;
  date: string;
  merge: boolean;
}

export interface DiffSummary {
  source: 'worktree' | 'branch';
  base: string;
  branch?: string;
  head?: string;
  /** Có commit được chọn → danh sách tệp là của riêng commit đó. */
  commit?: string;
  commits: DiffCommit[];
  files: DiffFile[];
  totals: { files: number; add: number; del: number };
  /** Số tệp chưa commit trong worktree (agent đang làm hoặc CCoding chưa commit). */
  uncommitted: number;
  truncated?: boolean;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: string;
  text: string;
  binary?: boolean;
  hidden?: boolean;
  truncated?: boolean;
}

export class DiffError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

interface Source {
  dir: string;
  source: 'worktree' | 'branch';
  base: string;
  branch?: string;
  /** Ref để so (HEAD của worktree hoặc tên nhánh). */
  head: string;
}

const SHA = /^[0-9a-f]{7,40}$/i;
const MAX_FILES = 800;
const MAX_COMMITS = 200;
const MAX_TEXT = 400_000;
const MAX_UNTRACKED_BYTES = 1_000_000;
/** Không hiện nội dung: biến môi trường, khóa, chứng chỉ. */
const SENSITIVE = /(^|\/)\.env(\.|$)|(^|\/)\.npmrc$|(^|\/)\.netrc$|\.(pem|key|p12|pfx|jks|keystore)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i;
/** Thư mục làm việc riêng của CCoding trong worktree — không phải thay đổi của dự án. */
const INTERNAL = /^\.ccoding\//;

export const isSha = (s: string) => SHA.test(s);

/** Thư mục repo của dự án (đường dẫn tương đối tính từ thư mục gốc CCoding). */
export function repoDirFor(project: ProjectDef | undefined, root: string): string | undefined {
  if (!project?.workspace) return undefined;
  return path.isAbsolute(project.workspace) ? project.workspace : path.join(root, project.workspace);
}

/**
 * git chỉ đọc: không giữ khóa index phụ (agent/CCoding có thể đang commit cùng lúc), đường dẫn hiểu theo nghĩa đen
 * (tệp tên `:(…)` không thành pathspec), chỉ lấy stdout (cảnh báo CRLF trên Windows nằm ở stderr) và cho đầu ra lớn.
 */
function g(dir: string, args: string[], timeoutMs = 60_000): { ok: boolean; out: string } {
  const r = spawnSync('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.quotepath=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return r.status === 0 ? { ok: true, out: r.stdout ?? '' } : { ok: false, out: `${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim() };
}

/** Tìm nơi lấy diff: worktree còn → worktree; không thì nhánh trong repo dự án. Không có nhánh/commit gốc → undefined. */
export function locate(task: Pick<Task, 'workspace' | 'branch' | 'baseRef'>, repoDir: string | undefined): Source | undefined {
  const base = task.baseRef;
  if (!base || !SHA.test(base) || !task.branch) return undefined;
  if (task.workspace && repoDir && fs.existsSync(task.workspace) && isWorktreeOf(task.workspace, repoDir)) {
    return { dir: task.workspace, source: 'worktree', base, branch: task.branch, head: 'HEAD' };
  }
  if (repoDir && fs.existsSync(repoDir) && g(repoDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${task.branch}`], 15_000).ok) {
    return { dir: repoDir, source: 'branch', base, branch: task.branch, head: `refs/heads/${task.branch}` };
  }
  return undefined;
}

function commits(src: Source): DiffCommit[] {
  const r = g(src.dir, ['log', `--max-count=${MAX_COMMITS}`, '--format=%H%x1f%s%x1f%cI%x1f%P%x1e', `${src.base}..${src.head}`, '--']);
  if (!r.ok) return [];
  return r.out
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, date, parents] = line.split('\x1f');
      return { sha, subject: subject ?? '', date: date ?? '', merge: (parents ?? '').trim().split(/\s+/).length > 1 };
    })
    .filter((c) => SHA.test(c.sha));
}

/** `--numstat -z` + `--name-status -z` → danh sách tệp. */
function parseFiles(numstat: string, nameStatus: string): DiffFile[] {
  const files = new Map<string, DiffFile>();
  const ns = nameStatus.split('\0');
  for (let i = 0; i < ns.length; ) {
    const st = ns[i++];
    if (!st) continue;
    const letter = st[0];
    if (letter === 'R' || letter === 'C') {
      const oldPath = ns[i++];
      const p = ns[i++];
      if (p) files.set(p, { path: p, oldPath, status: letter, add: 0, del: 0 });
    } else {
      const p = ns[i++];
      if (p) files.set(p, { path: p, status: letter, add: 0, del: 0 });
    }
  }
  const nm = numstat.split('\0');
  for (let i = 0; i < nm.length; ) {
    const head = nm[i++];
    if (!head) continue;
    const [a, d, p0] = head.split('\t');
    let p = p0;
    if (p0 === '' || p0 === undefined) {
      i++; // đường dẫn cũ (đổi tên)
      p = nm[i++];
    }
    if (!p) continue;
    const f = files.get(p) ?? { path: p, status: 'M', add: 0, del: 0 };
    if (a === '-' || d === '-') f.binary = true;
    else {
      f.add = Number(a) || 0;
      f.del = Number(d) || 0;
    }
    files.set(p, f);
  }
  return [...files.values()];
}

function rangeArgs(src: Source, commit?: string): string[] {
  if (commit) return [`${commit}^1`, commit];
  return src.source === 'worktree' ? [src.base] : [src.base, src.head];
}

const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '--no-textconv', '-M'];

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

/** Tệp mới chưa track trong worktree (agent vừa tạo, CCoding chưa commit). */
function untracked(src: Source): string[] {
  if (src.source !== 'worktree') return [];
  const r = g(src.dir, ['ls-files', '--others', '--exclude-standard', '-z']);
  return r.ok ? r.out.split('\0').filter((p) => p && !INTERNAL.test(p)) : [];
}

/** Đọc tệp trong worktree, không theo symlink ra ngoài thư mục. */
function readInside(dir: string, rel: string, limit: number): { buf?: Buffer; size: number } {
  const abs = path.resolve(dir, rel);
  const root = path.resolve(dir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return { size: 0 };
  try {
    const st = fs.lstatSync(abs);
    if (!st.isFile()) return { size: 0 };
    if (st.size > limit) return { size: st.size };
    return { buf: fs.readFileSync(abs), size: st.size };
  } catch {
    return { size: 0 };
  }
}

function countLines(buf: Buffer): number {
  if (!buf.length) return 0;
  let n = 0;
  for (const b of buf) if (b === 10) n++;
  return buf.at(-1) === 10 ? n : n + 1;
}

export function diffSummary(src: Source, commit?: string): DiffSummary {
  const list = commits(src);
  if (commit) {
    if (!SHA.test(commit)) throw new DiffError(400, 'Mã commit không hợp lệ');
    const want = commit.toLowerCase();
    const c = list.find((x) => x.sha.startsWith(want));
    if (!c) throw new DiffError(404, 'Commit không thuộc nhánh của nhiệm vụ');
    commit = c.sha;
  }
  const range = rangeArgs(src, commit);
  const numstat = g(src.dir, ['diff', ...DIFF_FLAGS, '--numstat', '-z', ...range, '--']);
  const nameStatus = g(src.dir, ['diff', ...DIFF_FLAGS, '--name-status', '-z', ...range, '--']);
  if (!numstat.ok || !nameStatus.ok) throw new DiffError(409, `Không đọc được diff: ${(numstat.ok ? nameStatus.out : numstat.out).slice(0, 200)}`);
  let files = parseFiles(numstat.out, nameStatus.out).filter((f) => !INTERNAL.test(f.path));
  let uncommitted = 0;
  if (!commit && src.source === 'worktree') {
    const st = g(src.dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
    if (st.ok) uncommitted = st.out.split('\0').filter((x) => x.length > 3 && !INTERNAL.test(x.slice(3))).length;
    for (const p of untracked(src)) {
      if (files.some((f) => f.path === p)) continue;
      const { buf } = readInside(src.dir, p, MAX_UNTRACKED_BYTES);
      files.push({ path: p, status: '?', add: buf && !isBinary(buf) ? countLines(buf) : 0, del: 0, binary: buf ? isBinary(buf) : undefined });
    }
  }
  for (const f of files) if (SENSITIVE.test(f.path)) f.hidden = true;
  files.sort((a, b) => a.path.localeCompare(b.path));
  const truncated = files.length > MAX_FILES;
  if (truncated) files = files.slice(0, MAX_FILES);
  const totals = files.reduce((t, f) => ({ files: t.files + 1, add: t.add + f.add, del: t.del + f.del }), { files: 0, add: 0, del: 0 });
  const head = g(src.dir, ['rev-parse', src.head], 15_000);
  return {
    source: src.source,
    base: src.base,
    branch: src.branch,
    head: head.ok ? head.out.trim().split('\n')[0] : undefined,
    commit,
    commits: list,
    files,
    totals,
    uncommitted,
    truncated: truncated || undefined,
  };
}

/** Diff của một tệp — tệp phải nằm trong danh sách thay đổi (không đọc được tệp tùy ý của repo). */
export function fileDiff(src: Source, file: string, commit?: string): FileDiff {
  if (!file || file.includes('\0')) throw new DiffError(400, 'Thiếu đường dẫn tệp');
  const sum = diffSummary(src, commit);
  const f = sum.files.find((x) => x.path === file);
  if (!f) throw new DiffError(404, 'Tệp không nằm trong thay đổi của nhiệm vụ');
  const base: FileDiff = { path: f.path, oldPath: f.oldPath, status: f.status, text: '', binary: f.binary };
  if (f.hidden) return { ...base, hidden: true };
  if (f.binary) return base;
  let text: string;
  if (f.status === '?') {
    const { buf, size } = readInside(src.dir, f.path, MAX_UNTRACKED_BYTES);
    if (!buf) return { ...base, truncated: size > MAX_UNTRACKED_BYTES || undefined };
    if (isBinary(buf)) return { ...base, binary: true };
    const body = buf.toString('utf8');
    const lines = body.endsWith('\n') ? body.slice(0, -1).split('\n') : body.split('\n');
    text = `diff --git a/${f.path} b/${f.path}\nnew file (chưa commit)\n--- /dev/null\n+++ b/${f.path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
  } else {
    const paths = f.oldPath ? [f.oldPath, f.path] : [f.path];
    const r = g(src.dir, ['diff', ...DIFF_FLAGS, ...rangeArgs(src, sum.commit), '--', ...paths]);
    if (!r.ok) throw new DiffError(409, `Không đọc được diff của tệp: ${r.out.slice(0, 200)}`);
    text = r.out;
  }
  const truncated = text.length > MAX_TEXT;
  if (truncated) text = text.slice(0, MAX_TEXT);
  return { ...base, text: redact(text, { secrets: true, pii: false }), truncated: truncated || undefined };
}

/**
 * Hạng mục nào đã đụng tới từng tệp (để bình luận trên diff gửi đúng người sửa):
 * 1) commit trên nhánh có tên hạng mục — "CCoding <task> S2: …" (worktree con), "CCoding <task>: gộp S2 — …" (gộp, so với cha thứ nhất),
 *    "… hoàn tất gộp … (S2)"; bỏ "phần đã làm trước khi gộp S2" (là việc của hạng mục khác);
 * 2) lệnh ghi/sửa tệp trong nhật ký (`tool.call` write_file/edit_file kèm subtaskId) — đường dẫn tuyệt đối khớp theo đuôi.
 */
export function ownersOf(src: Source, taskId: string, files: string[], tools: Array<{ subtaskId?: string; name?: string; args?: string; department?: string }> = []): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  const add = (file: string, sub: string) => (out[file] ??= new Set()).add(sub);
  const want = new Set(files);
  const esc = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reSub = new RegExp(`^CCoding ${esc} (S\\d+):`, 'i');
  const reMerge = new RegExp(`^CCoding ${esc}: gộp (S\\d+)\\b`, 'i');
  const reDone = /hoàn tất gộp .*\((S\d+)\)\s*$/i;
  for (const c of commits(src)) {
    const m = reSub.exec(c.subject) ?? reMerge.exec(c.subject) ?? reDone.exec(c.subject);
    if (!m) continue;
    const r = g(src.dir, ['diff', '--name-only', '-z', '--no-renames', `${c.sha}^1`, c.sha, '--'], 30_000);
    if (!r.ok) continue;
    for (const f of r.out.split('\0')) if (f && want.has(f)) add(f, m[1].toUpperCase());
  }
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  const wtDir = new RegExp(`/wt-${esc}(?:--[\\w-]+)?/(.+)$`, 'i');
  for (const t of tools) {
    if (!t.subtaskId || (t.name !== 'write_file' && t.name !== 'edit_file')) continue;
    // write_file/edit_file: "<đường dẫn tương đối> (…)"; claude-cli: đường dẫn tuyệt đối trong worktree (con) của nhiệm vụ
    let p = norm(String(t.args ?? '').replace(/\s+\([^)]*\)\s*$/, '').trim());
    if (!p) continue;
    const abs = /^([a-z]:)?\//i.test(p);
    const inWt = wtDir.exec(p);
    if (inWt) p = inWt[1];
    // nhật ký biết phòng của hạng mục → "phòng|S2" (nhiệm vụ liên phòng có S2 ở cả hai phòng); commit chỉ biết "S2"
    for (const f of want) if (p === f || (abs && !inWt && p.endsWith(`/${f}`))) add(f, t.department ? `${t.department}|${t.subtaskId}` : t.subtaskId);
  }
  return Object.fromEntries(Object.entries(out).map(([f, s]) => [f, [...s].sort()]));
}
