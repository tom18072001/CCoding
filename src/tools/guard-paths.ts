// B-08 — giải đường dẫn cho hook claude-guard: dùng `cwd` của sự kiện (G3) và cho đọc tool-results của chính phiên (G4).
// Mọi so sánh dùng realpathSync.native + path.relative: `../`, symlink, junction trỏ ra ngoài worktree đều bị chặn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** realpath của đường dẫn có thể chưa tồn tại (Write tệp mới): realpath của tổ tiên gần nhất còn tồn tại + phần đuôi chưa có. */
export function realpathLoose(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...tail.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** `child` nằm trong (hoặc bằng) `parent`? Dùng path.relative: bắt đầu bằng '..' hoặc tuyệt đối → ngoài. */
export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Đường dẫn p (tương đối hoặc tuyệt đối) → tuyệt đối, tương đối so với `cwd` của sự kiện nếu có (mặc định: root). */
export function resolveFrom(root: string, p: string, eventCwd?: string): string {
  const base = eventCwd && path.isAbsolute(eventCwd) ? eventCwd : root;
  return path.resolve(base, p);
}

/** Sau khi giải symlink/junction, đường dẫn vẫn nằm trong worktree? */
export function realInsideRoot(root: string, abs: string): boolean {
  return isWithin(realpathLoose(root), realpathLoose(abs));
}

/** Thư mục cấu hình Claude Code (CLAUDE_CONFIG_DIR hoặc ~/.claude). */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

/**
 * G4: tệp tool-results của CHÍNH phiên: <cấu hình>/projects/<slug>/<session_id>/tool-results/<tệp>.
 * Không mở thư mục nào khác trong .claude/; session_id phải hợp lệ và khớp; đường dẫn chứa `..` bị chuẩn hóa rồi so lại;
 * symlink/junction trong cây này trỏ ra ngoài thì bị loại bằng realpath.
 */
export function isOwnToolResult(abs: string, sessionId: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return false;
  const projects = path.join(claudeConfigDir(env), 'projects');
  const rel = path.relative(projects, path.resolve(abs));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const seg = rel.split(/[\\/]+/);
  // [slug, session_id, 'tool-results', ...tệp]
  if (seg.length < 4 || seg[1] !== sessionId || seg[2] !== 'tool-results' || seg.some((s) => s === '..' || s === '')) return false;
  const allowedDir = path.join(projects, seg[0], sessionId, 'tool-results');
  return isWithin(realpathLoose(allowedDir), realpathLoose(abs)) && isWithin(realpathLoose(projects), realpathLoose(abs));
}
