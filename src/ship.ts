import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { isSafeRef } from './git.js';
import { redact } from './util/redact.js';
import type { Task } from './types.js';

/**
 * "Sẵn sàng gộp" của một nhiệm vụ làm trên nhánh riêng + các thao tác giám đốc bấm:
 * - push: đẩy nhánh nhiệm vụ lên remote (để mở PR / người khác xem) — không bao giờ --force;
 * - ff:   đẩy commit HEAD của nhánh nhiệm vụ vào nhánh xuất phát trên remote (vd. origin/ND57-da-nv) CHỈ khi là fast-forward;
 * - link PR (GitHub): trang so sánh nhánh xuất phát…nhánh nhiệm vụ.
 * Mọi lệnh git chạy trong repo của dự án (worktree dùng chung ref), không đổi nhánh đang checkout, không ghi index.
 */

export interface ShipStatus {
  branch: string;
  head?: string;
  /** Nhánh xuất phát của dự án (ref như cấu hình, vd. origin/ND57-da-nv) và phần tách: remote + tên nhánh trên remote. */
  baseRef?: string;
  remote?: string;
  baseBranch?: string;
  /** URL remote đã bỏ thông tin đăng nhập. */
  remoteUrl?: string;
  /** Trang so sánh để mở PR (chỉ GitHub). */
  compareUrl?: string;
  /** Số commit của nhánh chưa có trong nhánh xuất phát. */
  ahead?: number;
  /** Số commit của nhánh xuất phát chưa có trong nhánh nhiệm vụ (khác 0 → không fast-forward được). */
  behind?: number;
  /** Nhánh nhiệm vụ đã có trên remote và trùng HEAD. */
  pushed?: boolean;
  /** Đẩy vào nhánh xuất phát được dạng fast-forward. */
  ff?: boolean;
  /** Không fast-forward: tệp sẽ xung đột khi gộp (git merge-tree). */
  conflicts?: string[];
  uncommitted: number;
  /** Tệp có dòng thêm mới trông như khóa/mật khẩu (theo mẫu che bí mật). */
  secrets: string[];
  review: 'approved' | 'pending' | 'none';
  regressions: string[];
  failing: string[];
  /** Thời điểm fetch remote gần nhất trong lần kiểm tra này (không fetch → dùng ref cục bộ đã có). */
  fetched?: boolean;
  blockers: string[];
  warnings: string[];
}

export class ShipError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

function g(dir: string, args: string[], timeoutMs = 60_000): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { ok: r.status === 0, out: r.stdout ?? '', err: `${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim() };
}

/** Bỏ user:token@ khỏi URL remote trước khi hiển thị/ghi log. */
export function cleanUrl(url: string): string {
  return url.trim().replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, '$1');
}

/** https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1 từ URL remote GitHub (https hoặc ssh). */
export function compareUrl(remoteUrl: string, base: string | undefined, branch: string): string | undefined {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(cleanUrl(remoteUrl));
  if (!m) return undefined;
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  // không có nhánh xuất phát trên remote → so với nhánh mặc định của repo
  return `https://github.com/${m[1]}/${m[2]}/compare/${base ? `${enc(base)}...` : ''}${enc(branch)}?expand=1`;
}

/** baseRef dạng "<remote>/<nhánh>" với remote có thật → tách ra; ngược lại undefined. */
function splitBase(repo: string, baseRef: string | undefined): { remote: string; branch: string } | undefined {
  if (!baseRef || !isSafeRef(baseRef)) return undefined;
  const i = baseRef.indexOf('/');
  if (i <= 0) return undefined;
  const remote = baseRef.slice(0, i);
  if (!g(repo, ['remote', 'get-url', remote], 15_000).ok) return undefined;
  return { remote, branch: baseRef.slice(i + 1) };
}

/** Tệp có dòng THÊM trông như bí mật (khóa API, private key, mật khẩu trong chuỗi kết nối…) giữa base và head. */
export function secretFiles(repo: string, base: string, head: string): string[] {
  const r = g(repo, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-U0', base, head, '--']);
  if (!r.ok) return [];
  const hits = new Set<string>();
  let file = '';
  for (const line of r.out.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('+') && !line.startsWith('+++') && redact(line, { secrets: true, pii: false }) !== line) hits.add(file);
  }
  return [...hits].filter(Boolean).sort();
}

export function shipStatus(task: Task, repo: string, baseRef: string | undefined, o: { fetch?: boolean } = {}): ShipStatus {
  const branch = task.branch;
  if (!branch || !isSafeRef(branch)) throw new ShipError(404, 'Nhiệm vụ không làm trên nhánh git riêng');
  if (!fs.existsSync(repo) || !g(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000).ok) throw new ShipError(404, `Không còn nhánh ${branch} trong repo của dự án`);
  const head = g(repo, ['rev-parse', `refs/heads/${branch}`], 15_000).out.trim();
  const st: ShipStatus = { branch, head, baseRef, uncommitted: 0, secrets: [], review: 'none', regressions: [], failing: [], blockers: [], warnings: [] };
  const base = splitBase(repo, baseRef);
  const remote = base?.remote ?? (g(repo, ['remote', 'get-url', 'origin'], 15_000).ok ? 'origin' : undefined);
  if (remote) {
    st.remote = remote;
    st.remoteUrl = cleanUrl(g(repo, ['remote', 'get-url', remote], 15_000).out);
  }
  if (base) {
    st.baseBranch = base.branch;
    if (o.fetch) st.fetched = g(repo, ['fetch', '--quiet', '--no-tags', base.remote, `refs/heads/${base.branch}:refs/remotes/${base.remote}/${base.branch}`], 120_000).ok;
  }
  if (remote && o.fetch) {
    // nhánh nhiệm vụ trên remote (không tạo ref cục bộ mới nếu chưa có)
    const ls = g(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], 60_000);
    if (ls.ok) st.pushed = ls.out.trim().split(/\s+/)[0] === head;
  } else if (remote) {
    const tr = g(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`], 15_000);
    st.pushed = tr.ok ? tr.out.trim() === head : false;
  }
  const baseCommit = base ? g(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${base.remote}/${base.branch}`], 15_000).out.trim() : task.baseRef;
  if (baseCommit) {
    const c = g(repo, ['rev-list', '--left-right', '--count', `${baseCommit}...${head}`], 30_000);
    if (c.ok) {
      const [behind, ahead] = c.out.trim().split(/\s+/).map(Number);
      st.ahead = ahead;
      st.behind = behind;
      st.ff = base ? behind === 0 && ahead > 0 : undefined;
    }
    if (base && st.behind) {
      const mt = g(repo, ['merge-tree', '--write-tree', '--name-only', '--no-messages', baseCommit, head], 60_000);
      // mã 1 = có xung đột: dòng 1 là tree, các dòng sau là tệp xung đột
      if (!mt.ok && mt.out.trim()) st.conflicts = mt.out.trim().split('\n').slice(1).filter(Boolean).slice(0, 50);
      else if (mt.ok) st.conflicts = [];
    }
    st.secrets = secretFiles(repo, task.baseRef && /^[0-9a-f]{7,40}$/i.test(task.baseRef) ? task.baseRef : baseCommit, head);
  }
  // phần chưa commit trong worktree (agent đang làm / CCoding chưa commit) — không nằm trong nhánh khi đẩy
  if (task.workspace && fs.existsSync(task.workspace)) {
    const s = g(task.workspace, ['status', '--porcelain', '-z', '--untracked-files=all'], 30_000);
    if (s.ok) st.uncommitted = s.out.split('\0').filter((x) => x.length > 3 && !x.slice(3).startsWith('.ccoding/')).length;
  }
  const reviews = task.runs.filter((r) => r.subtasks.some((s) => s.status === 'done'));
  st.review = !reviews.some((r) => r.review) ? 'none' : reviews.every((r) => !r.review || r.review.approved) && !task.attention ? 'approved' : 'pending';
  const pc = task.projectChecks;
  for (const l of pc?.latest ?? []) {
    const b = pc?.baseline?.find((x) => x.command === l.command);
    if (!l.ok && b?.ok) st.regressions.push(l.command);
    else if (!l.ok) st.failing.push(l.command);
  }
  if (task.status === 'running' || task.status === 'queued') st.blockers.push('Nhiệm vụ đang chạy');
  if (st.uncommitted) st.blockers.push(`${st.uncommitted} tệp chưa commit trong worktree (không nằm trong nhánh)`);
  if (st.secrets.length) st.blockers.push(`Có dòng trông như khóa/mật khẩu trong ${st.secrets.length} tệp: ${st.secrets.slice(0, 5).join(', ')}`);
  if (st.review === 'pending') st.warnings.push('Review chưa duyệt / nhiệm vụ "cần xem"');
  if (st.regressions.length) st.warnings.push(`Lệnh kiểm tra hồi quy: ${st.regressions.join(' · ')}`);
  if (st.failing.length) st.warnings.push(`Lệnh kiểm tra hỏng: ${st.failing.join(' · ')}`);
  if (!remote) st.blockers.push('Repo không có remote');
  if (st.conflicts?.length) st.warnings.push(`Xung đột với ${baseRef} ở ${st.conflicts.length} tệp — gộp/rebase trước khi đẩy vào nhánh xuất phát`);
  if (st.remoteUrl) st.compareUrl = compareUrl(st.remoteUrl, st.baseBranch, branch);
  return st;
}

/** Đẩy nhánh nhiệm vụ / fast-forward vào nhánh xuất phát. Không bao giờ --force. Trả về mô tả ngắn để ghi log/tin nhắn. */
export function shipPush(task: Task, repo: string, baseRef: string | undefined, action: 'push' | 'ff', o: { override?: boolean } = {}): { st: ShipStatus; ref: string; head: string; out: string } {
  const st = shipStatus(task, repo, baseRef, { fetch: true });
  if (st.blockers.length) throw new ShipError(409, st.blockers.join(' · '));
  if (!st.remote || !st.head) throw new ShipError(409, 'Repo không có remote');
  if (action === 'ff') {
    if (!st.baseBranch) throw new ShipError(409, 'Nhánh xuất phát của dự án không phải nhánh remote (dạng origin/<nhánh>) — chỉ đẩy nhánh nhiệm vụ được');
    if (!st.ahead) throw new ShipError(409, `Nhánh không có commit mới so với ${baseRef}`);
    if (!st.ff) throw new ShipError(409, `${baseRef} đã có ${st.behind ?? '?'} commit mới mà nhánh nhiệm vụ chưa có — không fast-forward được (gộp/rebase trước)`);
    if ((st.review === 'pending' || st.regressions.length || st.failing.length) && !o.override) throw new ShipError(409, `${st.warnings.join(' · ')} — xác nhận "vẫn đẩy" nếu chắc chắn`);
  }
  const ref = action === 'ff' ? st.baseBranch! : st.branch;
  // đẩy đúng commit đã kiểm (sha), không đẩy tên nhánh — tránh lẫn commit phát sinh giữa lúc kiểm và lúc đẩy
  const r = g(repo, ['push', '--porcelain', st.remote, `${st.head}:refs/heads/${ref}`], 180_000);
  const out = cleanUrl(`${r.out}\n${r.err}`.trim()).slice(0, 1500);
  if (!r.ok) throw new ShipError(502, `git push lỗi: ${out.slice(0, 600) || 'không rõ'}`);
  // cập nhật ref theo dõi cục bộ để lần kiểm sau thấy ngay (không chạm nhánh đang checkout)
  g(repo, ['update-ref', `refs/remotes/${st.remote}/${ref}`, st.head], 15_000);
  return { st, ref, head: st.head, out };
}
