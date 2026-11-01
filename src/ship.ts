import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { isSafeRef } from './git.js';
import { redact } from './util/redact.js';
import type { Task } from './types.js';

/**
 * "Sẵn sàng gộp" của một nhiệm vụ làm trên nhánh riêng + các thao tác giám đốc bấm:
 * - push: đẩy nhánh nhiệm vụ lên remote (để mở PR / người khác xem) — không bao giờ --force;
 * - ff:   đẩy commit HEAD của nhánh nhiệm vụ vào nhánh xuất phát trên remote (vd. origin/ND57-da-nv) CHỈ khi là fast-forward;
 * - link PR (GitHub): trang so sánh nhánh xuất phát…nhánh nhiệm vụ.
 * Mọi lệnh git chạy BẤT ĐỒNG BỘ (fetch/push có thể chờ mạng) trong repo của dự án (worktree dùng chung ref),
 * không đổi nhánh đang checkout, không ghi index, không hỏi đăng nhập (GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never).
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
  /** Số commit của nhánh chưa có trong nhánh xuất phát (= số commit sẽ đẩy vào nhánh xuất phát khi fast-forward). */
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
  /** "tệp:dòng" có dòng THÊM MỚI trông như khóa/mật khẩu (theo mẫu che bí mật) trong toàn bộ phần sẽ đẩy. */
  secrets: string[];
  review: 'approved' | 'pending' | 'none';
  regressions: string[];
  failing: string[];
  /** Việc nối: số commit kế thừa từ nhánh của nhiệm vụ trước (nằm trong phần sẽ đẩy) và nhiệm vụ đó. */
  inherited?: { taskId: string; commits: number; reviewOk: boolean };
  /** Có hỏi remote trong lần kiểm này và thành công không (false = dùng ref cục bộ, có thể cũ). */
  fetched?: boolean;
  /** Nhánh xuất phát có thật trên remote (chỉ biết khi có hỏi remote). */
  baseExists?: boolean;
  /** Không thể đẩy (kể cả xác nhận). */
  blockers: string[];
  /** Đẩy vào nhánh xuất phát cần xác nhận "vẫn đẩy". */
  warnings: string[];
}

export class ShipError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

/** Ngữ cảnh thêm do orchestrator cung cấp (việc nối kế thừa nhánh của nhiệm vụ trước). */
export interface ShipContext {
  inheritedFrom?: { taskId: string; head?: string; reviewOk: boolean };
}

function g(dir: string, args: string[], timeoutMs = 60_000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn('git', ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
      cwd: dir,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s: string) => {
      if (out.length < 64 * 1024 * 1024) out += s;
    });
    child.stderr.on('data', (s: string) => {
      if (err.length < 1024 * 1024) err += s;
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, out, err: `${err}${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out, err: err.trim() });
    });
  });
}

/** Bỏ user:token@ khỏi URL remote trước khi hiển thị/ghi log. */
export function cleanUrl(url: string): string {
  return url.trim().replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1');
}

/** https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1 từ URL remote GitHub (https hoặc ssh). */
export function compareUrl(remoteUrl: string, base: string | undefined, branch: string): string | undefined {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(cleanUrl(remoteUrl));
  if (!m) return undefined;
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  // không có nhánh xuất phát trên remote → so với nhánh mặc định của repo
  return `https://github.com/${m[1]}/${m[2]}/compare/${base ? `${enc(base)}...` : ''}${enc(branch)}?expand=1`;
}

/** baseRef dạng "<remote>/<nhánh>" với remote có thật → tách ra; "origin/HEAD" (con trỏ, không phải nhánh) và dạng khác → undefined. */
async function splitBase(repo: string, baseRef: string | undefined): Promise<{ remote: string; branch: string } | undefined> {
  if (!baseRef || !isSafeRef(baseRef)) return undefined;
  const i = baseRef.indexOf('/');
  if (i <= 0) return undefined;
  const remote = baseRef.slice(0, i);
  const branch = baseRef.slice(i + 1);
  if (!branch || branch === 'HEAD' || branch.startsWith('HEAD/') || !isSafeRef(branch)) return undefined;
  if (!(await g(repo, ['remote', 'get-url', remote], 15_000)).ok) return undefined;
  return { remote, branch };
}

/** "tệp:dòng" có dòng THÊM trông như bí mật (khóa API, private key, mật khẩu trong chuỗi kết nối…) trong base..head. */
export async function secretLines(repo: string, base: string, head: string): Promise<string[]> {
  const r = await g(repo, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-U0', base, head, '--']);
  if (!r.ok) return [];
  const hits: string[] = [];
  let file = '';
  let line = 0;
  for (const l of r.out.split('\n')) {
    if (l.startsWith('+++ ')) file = l.slice(4).replace(/^b\//, '');
    else if (l.startsWith('@@')) line = Number(/\+(\d+)/.exec(l)?.[1] ?? 0);
    else if (l.startsWith('+')) {
      if (redact(l, { secrets: true, pii: false }) !== l && file && file !== '/dev/null') hits.push(`${file}:${line}`);
      line++;
    }
  }
  return [...new Set(hits)].slice(0, 50);
}

export async function shipStatus(task: Task, repo: string, baseRef: string | undefined, o: { fetch?: boolean } = {}, ctx: ShipContext = {}): Promise<ShipStatus> {
  const branch = task.branch;
  if (!branch || !isSafeRef(branch)) throw new ShipError(404, 'Nhiệm vụ không làm trên nhánh git riêng');
  if (!fs.existsSync(repo) || !(await g(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], 15_000)).ok) throw new ShipError(404, `Không còn nhánh ${branch} trong repo của dự án`);
  const head = (await g(repo, ['rev-parse', `refs/heads/${branch}`], 15_000)).out.trim();
  const st: ShipStatus = { branch, head, baseRef, uncommitted: 0, secrets: [], review: 'none', regressions: [], failing: [], blockers: [], warnings: [] };
  const base = await splitBase(repo, baseRef);
  const remote = base?.remote ?? ((await g(repo, ['remote', 'get-url', 'origin'], 15_000)).ok ? 'origin' : undefined);
  if (remote) {
    st.remote = remote;
    st.remoteUrl = cleanUrl((await g(repo, ['remote', 'get-url', remote], 15_000)).out);
  }
  let remoteBranchExists: boolean | undefined; // = st.baseExists
  if (o.fetch && remote) {
    st.fetched = true;
    if (base) {
      // nhánh xuất phát phải có thật trên remote (không tạo nhánh mới qua "fast-forward")
      const lsb = await g(repo, ['ls-remote', '--heads', base.remote, `refs/heads/${base.branch}`], 60_000);
      remoteBranchExists = lsb.ok ? lsb.out.trim().length > 0 : undefined;
      const f = await g(repo, ['fetch', '--quiet', '--no-tags', base.remote, `refs/heads/${base.branch}:refs/remotes/${base.remote}/${base.branch}`], 120_000);
      if (!lsb.ok || !f.ok) st.fetched = false;
    }
    // nhánh nhiệm vụ trên remote (không tạo ref cục bộ mới nếu chưa có)
    const ls = await g(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], 60_000);
    if (ls.ok) st.pushed = ls.out.trim().split(/\s+/)[0] === head;
    else st.fetched = false;
  } else if (remote) {
    const tr = await g(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`], 15_000);
    st.pushed = tr.ok ? tr.out.trim() === head : false;
  }
  if (base) st.baseBranch = base.branch;
  const baseCommit = base ? (await g(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${base.remote}/${base.branch}`], 15_000)).out.trim() : '';
  // phần sẽ đẩy: so với nhánh xuất phát trên remote; không có → so với điểm tách chung với commit gốc của nhiệm vụ
  const from = baseCommit || task.baseRef || '';
  if (from) {
    const c = await g(repo, ['rev-list', '--left-right', '--count', `${from}...${head}`], 30_000);
    if (c.ok) {
      const [behind, ahead] = c.out.trim().split(/\s+/).map(Number);
      st.ahead = ahead;
      st.behind = behind;
      st.ff = baseCommit ? behind === 0 && ahead > 0 : undefined;
    }
    if (baseCommit && st.behind) {
      const mt = await g(repo, ['merge-tree', '--write-tree', '--name-only', '--no-messages', baseCommit, head], 60_000);
      // mã 1 = có xung đột: dòng 1 là tree, các dòng sau là tệp xung đột
      if (!mt.ok && mt.out.trim()) st.conflicts = mt.out.trim().split('\n').slice(1).filter(Boolean).slice(0, 50);
      else if (mt.ok) st.conflicts = [];
    }
    // quét bí mật trên TOÀN BỘ phần sẽ đẩy (gồm commit kế thừa từ nhiệm vụ trước), không chỉ phần của nhiệm vụ này
    const mb = await g(repo, ['merge-base', from, head], 30_000);
    st.secrets = await secretLines(repo, mb.ok ? mb.out.trim() : from, head);
  }
  // việc nối: commit của nhiệm vụ trước nằm trong phần sẽ đẩy
  // không có ngữ cảnh (gọi trực tiếp) mà nhiệm vụ tách từ nhánh trước → vẫn đếm, coi như review của nhiệm vụ đó chưa rõ
  const inh = ctx.inheritedFrom ?? (task.startFrom && task.followUpOf ? { taskId: task.followUpOf, head: task.baseRef, reviewOk: false } : undefined);
  if (inh?.head && from) {
    const n = await g(repo, ['rev-list', '--count', `${from}..${inh.head}`], 30_000);
    const commits = n.ok ? Number(n.out.trim()) || 0 : 0;
    if (commits) st.inherited = { taskId: inh.taskId, commits, reviewOk: inh.reviewOk };
  }
  // phần chưa commit trong worktree (agent đang làm / CCoding chưa commit) — không nằm trong nhánh khi đẩy
  if (task.workspace && fs.existsSync(task.workspace)) {
    const s = await g(task.workspace, ['status', '--porcelain', '-z', '--untracked-files=all'], 30_000);
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
  if (task.status === 'paused' && task.pause?.reason === 'plan') st.blockers.push('Kế hoạch chưa duyệt — chưa có gì để đẩy');
  if (st.uncommitted) st.blockers.push(`${st.uncommitted} tệp chưa commit trong worktree (không nằm trong nhánh)`);
  if (!remote) st.blockers.push('Repo không có remote');
  if (task.status !== 'done' && !st.blockers.length) st.warnings.push(`Nhiệm vụ chưa xong (trạng thái: ${task.status})`);
  if (st.review === 'pending') st.warnings.push('Review chưa duyệt / nhiệm vụ "cần xem"');
  else if (st.review === 'none' && reviews.length) st.warnings.push('Không có review cho phần đã làm');
  if (st.regressions.length) st.warnings.push(`Lệnh kiểm tra hồi quy: ${st.regressions.join(' · ')}`);
  if (st.failing.length) st.warnings.push(`Lệnh kiểm tra hỏng: ${st.failing.join(' · ')}`);
  if (st.inherited) st.warnings.push(`Gồm ${st.inherited.commits} commit của nhiệm vụ trước ${st.inherited.taskId}${st.inherited.reviewOk ? '' : ' (review của nhiệm vụ đó chưa duyệt)'}`);
  if (st.conflicts?.length) st.warnings.push(`Xung đột với ${baseRef} ở ${st.conflicts.length} tệp — gộp/rebase trước khi đẩy vào nhánh xuất phát`);
  if (o.fetch && st.fetched === false) st.warnings.push('Không hỏi được remote (mạng/đăng nhập) — trạng thái theo ref cục bộ, có thể cũ');
  if (remoteBranchExists === false) st.warnings.push(`Không có nhánh ${base!.branch} trên ${base!.remote}`);
  if (st.remoteUrl) st.compareUrl = compareUrl(st.remoteUrl, remoteBranchExists === false ? undefined : st.baseBranch, branch);
  st.baseExists = remoteBranchExists;
  return st;
}

/**
 * Đẩy nhánh nhiệm vụ / fast-forward vào nhánh xuất phát. Không bao giờ --force; đẩy đúng sha đã kiểm (git vẫn từ chối nếu
 * remote đổi giữa lúc kiểm và lúc đẩy mà không còn là fast-forward).
 * - override: đã xác nhận "vẫn đẩy" dù còn cảnh báo (review chưa duyệt, lệnh kiểm tra hỏng, commit kế thừa, nhiệm vụ chưa xong…);
 * - allowSecrets: đã xác nhận các dòng giống khóa/mật khẩu là dữ liệu thử (vd. test của bộ che bí mật).
 */
export async function shipPush(
  task: Task,
  repo: string,
  baseRef: string | undefined,
  action: 'push' | 'ff',
  o: { override?: boolean; allowSecrets?: boolean } = {},
  ctx: ShipContext = {},
): Promise<{ st: ShipStatus; ref: string; head: string; out: string }> {
  const st = await shipStatus(task, repo, baseRef, { fetch: true }, ctx);
  if (st.blockers.length) throw new ShipError(409, st.blockers.join(' · '));
  if (!st.remote || !st.head) throw new ShipError(409, 'Repo không có remote');
  if (st.secrets.length && !o.allowSecrets) throw new ShipError(409, `Có dòng trông như khóa/mật khẩu ở ${st.secrets.slice(0, 8).join(', ')} — xác nhận đó là dữ liệu thử nếu chắc chắn`);
  if (action === 'ff') {
    if (!st.baseBranch) throw new ShipError(409, 'Nhánh xuất phát của dự án không phải nhánh remote (dạng origin/<nhánh>) — chỉ đẩy nhánh nhiệm vụ được');
    if (!st.fetched) throw new ShipError(409, `Không hỏi được ${st.remote} — không đẩy vào ${st.baseRef} khi chưa biết trạng thái mới nhất`);
    if (st.baseExists !== true) throw new ShipError(409, `Không có nhánh ${st.baseBranch} trên ${st.remote}`);
    if (!st.ahead) throw new ShipError(409, `Nhánh không có commit mới so với ${baseRef}`);
    if (!st.ff) throw new ShipError(409, `${baseRef} đã có ${st.behind ?? '?'} commit mới mà nhánh nhiệm vụ chưa có — không fast-forward được (gộp/rebase trước)`);
    if (st.warnings.length && !o.override) throw new ShipError(409, `${st.warnings.join(' · ')} — xác nhận "vẫn đẩy" nếu chắc chắn`);
  }
  const ref = action === 'ff' ? st.baseBranch! : st.branch;
  // đẩy đúng commit đã kiểm (sha), không đẩy tên nhánh — tránh lẫn commit phát sinh giữa lúc kiểm và lúc đẩy
  const r = await g(repo, ['push', '--porcelain', st.remote, `${st.head}:refs/heads/${ref}`], 180_000);
  const out = cleanUrl(`${r.out}\n${r.err}`.trim()).slice(0, 1500);
  if (!r.ok) throw new ShipError(502, `git push lỗi: ${out.slice(0, 600) || 'không rõ'}`);
  // cập nhật ref theo dõi cục bộ để lần kiểm sau thấy ngay (không chạm nhánh đang checkout)
  await g(repo, ['update-ref', `refs/remotes/${st.remote}/${ref}`, st.head], 15_000);
  return { st, ref, head: st.head, out };
}
