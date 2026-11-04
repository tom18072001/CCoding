import crypto from 'node:crypto';
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

export interface ResolvedBase {
  /** Ref dùng làm điểm xuất phát (nhánh cục bộ hoặc `origin/<nhánh>`). */
  ref: string;
  /** Commit đầy đủ của ref tại thời điểm chọn (undefined nếu không phân giải được). */
  commit?: string;
  source: 'local' | 'remote';
  warning?: string;
}

/**
 * Chọn base cho worktree nhiệm vụ. Nếu `baseRef` là nhánh cục bộ và repo có remote `origin`: fetch đúng nhánh đó (có timeout),
 * rồi so hai phía. Cục bộ đi sau, không đi trước → dùng `origin/<baseRef>`; bằng nhau hoặc chỉ đi trước → dùng cục bộ;
 * lệch hai chiều → ném lỗi (không tạo worktree). Fetch lỗi → dùng cục bộ kèm cảnh báo. Không sửa nhánh cục bộ, không force.
 * `baseRef` không phải nhánh (commit, HEAD, nhánh nối từ nhiệm vụ trước) hoặc không có remote → giữ hành vi cũ.
 */
export function resolveBase(repo: string, baseRef: string | undefined, fetchTimeoutMs = 60_000): ResolvedBase {
  const name = baseRef || 'HEAD';
  const full = (ref: string) => {
    const r = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], 15_000);
    return r.ok ? r.out.trim().split('\n')[0] : undefined;
  };
  const legacy: ResolvedBase = { ref: name, commit: full(name), source: 'local' };
  if (name === 'HEAD' || !isSafeRef(name)) return legacy;
  if (!git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], 15_000).ok) return legacy;
  const remote = 'origin';
  if (!git(repo, ['remote', 'get-url', remote], 15_000).ok) return legacy;
  const f = git(repo, ['fetch', '--quiet', remote, name], fetchTimeoutMs);
  const remoteRef = `${remote}/${name}`;
  const remoteCommit = f.ok ? full(`refs/remotes/${remoteRef}`) : undefined;
  if (!remoteCommit) {
    const why = f.ok ? `không thấy nhánh ${remoteRef} sau khi fetch` : `fetch ${remote} ${name} lỗi: ${f.out.slice(0, 160)}`;
    return { ...legacy, warning: `Không cập nhật được base từ remote (${why}) — dùng nhánh cục bộ \`${name}\` có thể đã cũ.` };
  }
  const c = git(repo, ['rev-list', '--left-right', '--count', `${name}...refs/remotes/${remoteRef}`], 30_000);
  const [ahead, behind] = c.ok ? c.out.trim().split(/\s+/).map(Number) : [NaN, NaN];
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return { ...legacy, warning: `Không so được \`${name}\` với \`${remoteRef}\` (${c.out.slice(0, 160)}) — dùng nhánh cục bộ.` };
  }
  if (ahead > 0 && behind > 0) {
    throw new Error(`Nhánh cục bộ \`${name}\` và \`${remoteRef}\` đã lệch nhau (cục bộ có ${ahead} commit riêng, remote có ${behind} commit riêng). Không tạo worktree — hãy hợp nhất hoặc chọn nhánh nào làm base rồi chạy lại.`);
  }
  if (behind > 0) return { ref: remoteRef, commit: remoteCommit, source: 'remote' };
  return legacy;
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
  // --no-verify: hook của repo (husky, lint-staged, commitlint…) thường không chạy được trong worktree của CCoding và agent không sửa được
  return git(wt, [...identity(wt), 'commit', '--no-verify', '-m', message], 300_000);
}

/** Đang dở một lần merge (còn MERGE_HEAD). */
export function mergeInProgress(wt: string): boolean {
  return git(wt, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], 15_000).ok;
}

/** Tệp còn ở trạng thái xung đột (chưa `git add`). */
export function unmergedFiles(wt: string): string[] {
  const u = git(wt, ['diff', '--name-only', '--diff-filter=U'], 30_000);
  return u.ok ? u.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

const samePath = (a: string, b: string) => {
  const n = (p: string) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

/**
 * `dir` đúng là một worktree (gốc của chính nó, không phải thư mục con của repo khác) thuộc cùng repo với `peer`.
 * Tránh trường hợp worktree đã gỡ dở (mất tệp .git) khiến git rơi về repo cha chứa thư mục workspaces.
 */
export function isWorktreeOf(dir: string, peer: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const top = git(dir, ['rev-parse', '--show-toplevel'], 15_000);
  if (!top.ok || !samePath(top.out.trim(), dir)) return false;
  const common = (d: string) => {
    const r = git(d, ['rev-parse', '--git-common-dir'], 15_000);
    return r.ok ? path.resolve(d, r.out.trim()) : undefined;
  };
  const a = common(dir);
  const b = common(peer);
  return !!a && !!b && samePath(a, b);
}

/** Repo chưa cấu hình người commit → dùng danh tính CCoding cho riêng lệnh này. */
export function identity(wt: string): string[] {
  const hasIdentity = git(wt, ['config', 'user.email'], 10_000).out.includes('@');
  return hasIdentity ? [] : ['-c', 'user.name=CCoding Office', '-c', 'user.email=ccoding@localhost'];
}

/** Số commit của `ref` chưa có trong HEAD của `wt` (undefined nếu ref không tồn tại). */
export function commitsAhead(wt: string, ref: string): number | undefined {
  const r = git(wt, ['rev-list', '--count', `HEAD..${ref}`], 30_000);
  return r.ok ? Number(r.out.trim().split('\n')[0]) || 0 : undefined;
}

/** `ref` đã nằm trong lịch sử HEAD của `wt` (đã gộp). */
export function isMerged(wt: string, ref: string): boolean {
  return git(wt, ['merge-base', '--is-ancestor', ref, 'HEAD'], 30_000).ok;
}

/**
 * Gộp nhánh vào nhánh hiện tại của worktree (`--no-ff`, giữ dấu vết từng hạng mục). Xung đột → hủy merge (worktree trở lại như
 * trước) và trả danh sách tệp xung đột để người gọi xử lý.
 */
export function mergeBranch(wt: string, branch: string, message: string): GitResult & { conflicts: string[] } {
  const r = git(wt, [...identity(wt), 'merge', '--no-ff', '--no-edit', '--no-verify', '-m', message, branch], 300_000);
  if (r.ok) return { ...r, conflicts: [] };
  const conflicts = unmergedFiles(wt);
  if (mergeInProgress(wt) || conflicts.length) git(wt, ['merge', '--abort'], 60_000);
  return { ...r, conflicts };
}

/**
 * Gộp `branch` vào HEAD của `wt` nhưng KHÔNG hủy khi xung đột: worktree ở trạng thái gộp dở (MERGE_HEAD + dấu xung đột) để agent
 * giải quyết. Lỗi không do xung đột (ref sai, khóa index…) thì hủy merge dở và trả `ok: false`, `conflicts: []`.
 */
export function mergeStart(wt: string, branch: string, message: string): GitResult & { conflicts: string[] } {
  const r = git(wt, [...identity(wt), 'merge', '--no-ff', '--no-edit', '--no-verify', '-m', message, branch], 300_000);
  if (r.ok) return { ...r, conflicts: [] };
  const conflicts = unmergedFiles(wt);
  if (!conflicts.length && mergeInProgress(wt)) git(wt, ['merge', '--abort'], 60_000);
  return { ...r, conflicts };
}

/** Hoàn tất một lần gộp dở (đã hết xung đột): stage mọi thay đổi rồi tạo merge commit (kể cả khi cây trùng HEAD). */
export function completeMerge(wt: string, message: string): GitResult {
  git(wt, ['add', '-A'], 60_000);
  return git(wt, [...identity(wt), 'commit', '--no-verify', '--no-edit', '-m', message], 300_000);
}

/** `ancestor` đã nằm trong lịch sử của `ref` (cùng repo). */
export function isAncestor(wt: string, ancestor: string, ref: string): boolean {
  return git(wt, ['merge-base', '--is-ancestor', ancestor, ref], 30_000).ok;
}

/** Gỡ worktree (kể cả tệp chưa track như node_modules) rồi dọn sổ worktree của repo; nhánh giữ nguyên. */
export function removeWorktree(repo: string, wtPath: string): boolean {
  const r = git(repo, ['worktree', 'remove', '--force', wtPath], 300_000);
  if (!r.ok && fs.existsSync(wtPath)) {
    try {
      fs.rmSync(wtPath, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* tệp đang bị khóa (Windows) — để lần dọn sau */
    }
  }
  git(repo, ['worktree', 'prune'], 30_000);
  return !fs.existsSync(wtPath);
}

/** Tệp khai báo phụ thuộc/sinh mã (package.json, lockfile, requirements, go.mod, schema.prisma…) — đổi thì cần chạy lại lệnh chuẩn bị. */
export const DEPENDENCY_MANIFEST =
  /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Pipfile(\.lock)?|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|[^/]+\.csproj|packages\.lock\.json|schema\.prisma)$/i;

/** Dấu vân tay nội dung các tệp khai báo phụ thuộc trong worktree (đã track + chưa track, bỏ tệp bị .gitignore): tệp → sha1. */
export function manifestFingerprint(wt: string): Record<string, string> | undefined {
  const r = git(wt, ['ls-files', '--cached', '--others', '--exclude-standard'], 60_000);
  if (!r.ok) return undefined;
  const out: Record<string, string> = {};
  for (const f of r.out.split('\n').map((s) => s.trim().replace(/\\/g, '/')).filter((f) => f && DEPENDENCY_MANIFEST.test(f))) {
    try {
      out[f] = crypto.createHash('sha1').update(fs.readFileSync(path.join(wt, f))).digest('hex');
    } catch {
      out[f] = 'đã xóa';
    }
  }
  return out;
}

/** Tệp khai báo phụ thuộc khác nhau giữa hai dấu vân tay (thêm, xóa, đổi nội dung). */
export function manifestDiff(a: Record<string, string>, b: Record<string, string>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((f) => a[f] !== b[f]).sort();
}
