// B-08 — giải đường dẫn cho hook claude-guard: dùng `cwd` của sự kiện (G3) và cho đọc tool-results của chính phiên (G4).
// B-14 — kiểu đường dẫn (win32/posix) chọn theo root, không theo process.platform: Windows và Linux cho cùng kết quả.
// So sánh dùng realpathSync.native (khi kiểu khớp nền tảng) + relative: `../`, symlink, junction trỏ ra ngoài worktree đều bị chặn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PathImpl = typeof path.posix;

const WIN_DRIVE = /^[A-Za-z]:[\\/]/;
/** Đường dẫn tuyệt đối kiểu Windows: `C:\`, `C:/` hoặc UNC `\\server` (định nghĩa duy nhất của repo; shell-policy import lại). */
export const isWinAbs = (p: string): boolean => WIN_DRIVE.test(p) || /^\\\\[^\\]/.test(p);

/** Kiểu đường dẫn của root: Windows (ổ đĩa hoặc UNC `\\`/`//`) → path.win32, ngược lại path.posix. Không phụ thuộc process.platform. */
export function pathImplFor(root: string): PathImpl {
  return WIN_DRIVE.test(root) || /^[\\/]{2}[^\\/]/.test(root) ? path.win32 : path.posix;
}

const nativeImpl = (): PathImpl => (process.platform === 'win32' ? path.win32 : path.posix);

/** realpath của đường dẫn có thể chưa tồn tại (Write tệp mới). Chỉ gọi realpath khi kiểu đường dẫn khớp nền tảng đang chạy; ngược lại so từ vựng sau normalize. */
export function realpathLoose(p: string, P: PathImpl = pathImplFor(p)): string {
  const first = P.resolve(p);
  if (P !== nativeImpl()) return first;
  let cur = first;
  const tail: string[] = [];
  for (;;) {
    try {
      return P.join(fs.realpathSync.native(cur), ...tail.reverse());
    } catch {
      const parent = P.dirname(cur);
      if (parent === cur) return first;
      tail.push(P.basename(cur));
      cur = parent;
    }
  }
}

/** `child` nằm trong (hoặc bằng) `parent`? Dùng relative theo kiểu của parent (win32: không phân biệt hoa thường): bắt đầu bằng '..' hoặc tuyệt đối → ngoài. */
export function isWithin(parent: string, child: string, P: PathImpl = pathImplFor(parent)): boolean {
  const lc = (s: string) => (P === path.win32 ? s.toLowerCase() : s);
  const rel = P.relative(lc(parent), lc(child));
  return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel));
}

/**
 * Đường dẫn p (tương đối hoặc tuyệt đối) → tuyệt đối, tương đối so với `cwd` của sự kiện nếu có (mặc định: root).
 * Kiểu theo root. Root POSIX: `\` → `/`; `C:/…` giữ nguyên (khác kiểu ⇒ pathInside/realInsideRoot coi là ngoài).
 * Root Windows: `/c/…` (MSYS) đổi thành `C:/…`; `/…` hoặc `//…` khác kiểu ⇒ trả UNC giả luôn nằm ngoài root.
 */
export function resolveFrom(root: string, p: string, eventCwd?: string, P: PathImpl = pathImplFor(root)): string {
  if (P === path.win32) {
    const msys = /^\/([A-Za-z])(\/.*)?$/.exec(p.replace(/\\/g, '/'));
    let q = p;
    if (msys) q = `${msys[1].toUpperCase()}:${msys[2] ?? '/'}`;
    else if (/^[\\/]/.test(q) && !/^\\\\[^\\]/.test(q)) return `\\\\khac-kieu\\${q.replace(/^[\\/]+/, '')}`;
    const base = eventCwd && isWinAbs(eventCwd) ? eventCwd : root;
    return P.resolve(base, q);
  }
  const q = p.replace(/\\/g, '/');
  if (WIN_DRIVE.test(q)) return q;
  const base = eventCwd && eventCwd.startsWith('/') ? eventCwd : root;
  return P.resolve(base, q);
}

/** Sau khi giải symlink/junction, đường dẫn vẫn nằm trong worktree? Khác kiểu với root ⇒ ngoài. */
export function realInsideRoot(root: string, abs: string, P: PathImpl = pathImplFor(root)): boolean {
  if (isWinAbs(abs) !== (P === path.win32)) return false;
  return isWithin(realpathLoose(root, P), realpathLoose(abs, P), P);
}

/** Thư mục cấu hình Claude Code (CLAUDE_CONFIG_DIR hoặc ~/.claude). */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

/**
 * G4: tệp tool-results của CHÍNH phiên: <cấu hình>/projects/<slug>/<session_id>/tool-results/<tệp>.
 * Không mở thư mục nào khác trong .claude/; session_id phải hợp lệ và khớp; đường dẫn chứa `..` bị chuẩn hóa rồi so lại;
 * symlink/junction trong cây này trỏ ra ngoài thì bị loại bằng realpath. Đường dẫn khác kiểu với nền tảng đang chạy ⇒ không phải của phiên.
 */
export function isOwnToolResult(abs: string, sessionId: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return false;
  const projects = path.join(claudeConfigDir(env), 'projects');
  if (isWinAbs(abs) !== (process.platform === 'win32')) return false;
  const rel = path.relative(projects, path.resolve(abs));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const seg = rel.split(/[\\/]+/);
  // [slug, session_id, 'tool-results', ...tệp]
  if (seg.length < 4 || seg[1] !== sessionId || seg[2] !== 'tool-results' || seg.some((s) => s === '..' || s === '')) return false;
  const allowedDir = path.join(projects, seg[0], sessionId, 'tool-results');
  return isWithin(realpathLoose(allowedDir), realpathLoose(abs)) && isWithin(realpathLoose(projects), realpathLoose(abs));
}
