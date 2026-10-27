import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Tiện ích git tối thiểu cho worktree của nhiệm vụ (không bao giờ push). */

export interface GitResult {
  ok: boolean;
  out: string;
}

export function git(cwd: string, args: string[], timeoutMs = 120_000): GitResult {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() || (r.error ? r.error.message : '') };
}

export function isGitRepo(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const r = git(dir, ['rev-parse', '--is-inside-work-tree'], 15_000);
  return r.ok && r.out.trim() === 'true';
}

export function headCommit(dir: string): string | undefined {
  const r = git(dir, ['rev-parse', 'HEAD'], 15_000);
  return r.ok ? r.out.trim().split('\n')[0] : undefined;
}

export function currentBranch(dir: string): string | undefined {
  const r = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], 15_000);
  return r.ok ? r.out.trim() : undefined;
}

/** Tên ref an toàn để dùng làm điểm xuất phát (không bắt đầu bằng '-', không có '..'). */
export function isSafeRef(ref: string): boolean {
  return /^[\w][\w./-]{0,119}$/.test(ref) && !ref.includes('..') && !ref.endsWith('.lock') && !ref.endsWith('/');
}

/**
 * Tạo worktree mới trên nhánh riêng từ `startPoint` (mặc định HEAD hiện tại) hoặc gắn lại nhánh đã có.
 * startPoint dạng remote/nhánh (vd. origin/main) được fetch trước — lỗi mạng thì dùng bản đã có.
 */
export function addWorktree(repo: string, wtPath: string, branch: string, startPoint = 'HEAD'): GitResult {
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const exists = git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000).ok;
  if (exists) return git(repo, ['worktree', 'add', wtPath, branch]);
  if (!isSafeRef(startPoint)) return { ok: false, out: `Điểm xuất phát không hợp lệ: ${startPoint}` };
  const slash = startPoint.indexOf('/');
  if (startPoint !== 'HEAD' && slash > 0) {
    const remote = startPoint.slice(0, slash);
    if (git(repo, ['remote', 'get-url', remote], 15_000).ok) git(repo, ['fetch', '--quiet', remote, startPoint.slice(slash + 1)], 120_000);
  }
  return git(repo, ['worktree', 'add', '--no-track', '-b', branch, wtPath, startPoint]);
}

/** File chưa track (vd. .env) chép từ repo gốc sang worktree để chạy test/migration — không bao giờ đọc nội dung. */
export function copyUntracked(repo: string, wtPath: string, names: string[]): string[] {
  const copied: string[] = [];
  for (const n of names) {
    const src = path.join(repo, n);
    const dst = path.join(wtPath, n);
    if (!fs.existsSync(src) || fs.existsSync(dst) || !fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, dst);
    copied.push(n);
  }
  return copied;
}

/** Thống kê thay đổi so với commit gốc (gồm cả file chưa commit). */
export function changeSummary(wt: string, base?: string): string {
  git(wt, ['add', '-A', '--intent-to-add'], 30_000);
  const stat = git(wt, ['diff', '--stat', base ?? 'HEAD'], 30_000);
  const status = git(wt, ['status', '--short'], 30_000);
  const parts: string[] = [];
  if (stat.ok && stat.out) parts.push(stat.out);
  else if (status.ok && status.out) parts.push(status.out);
  return parts.join('\n').slice(0, 8000);
}

/** Commit mọi thay đổi của agent trên nhánh worktree (không push). */
export function commitAll(wt: string, message: string): GitResult {
  git(wt, ['add', '-A'], 60_000);
  const st = git(wt, ['status', '--porcelain'], 30_000);
  if (st.ok && !st.out) return { ok: true, out: 'không có thay đổi' };
  const hasIdentity = git(wt, ['config', 'user.email'], 10_000).out.includes('@');
  const ident = hasIdentity ? [] : ['-c', 'user.name=CCoding Office', '-c', 'user.email=ccoding@localhost'];
  return git(wt, [...ident, 'commit', '-m', message], 300_000);
}
