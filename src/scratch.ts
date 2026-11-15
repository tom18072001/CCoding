import fs from 'node:fs';
import path from 'node:path';

/**
 * Mẫu tệp nháp của repo (`.ccoding/scratch.json`: `{ "patterns": ["…"] }`). Hàm thuần, không phụ thuộc ngoài —
 * `commitAll` và luật lint `stray-files` dùng chung để không chép logic so mẫu.
 * Mẫu bắt đầu bằng `!` là loại trừ và thắng mọi mẫu dương.
 */

export const SCRATCH_CONFIG = '.ccoding/scratch.json';

/** Đọc mẫu nháp của repo. Không có tệp, JSON hỏng hoặc sai dạng → undefined (hành vi như cũ). */
export function loadScratchPatterns(repoDir: string): string[] | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(repoDir, SCRATCH_CONFIG), 'utf8')) as unknown;
    const p = (raw as { patterns?: unknown } | null)?.patterns;
    if (!Array.isArray(p)) return undefined;
    const list = p.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
    return list.length ? list : undefined;
  } catch {
    return undefined;
  }
}

/** Dịch glob (`*` trong một đoạn, `**` qua nhiều đoạn, `?` một ký tự) thành RegExp; đường dẫn dùng `/`. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?'; // `**/` = không hoặc nhiều thư mục
        } else re += '.*';
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** `relPath` (tương đối, dùng `/`) khớp ít nhất một mẫu dương và không khớp mẫu loại trừ `!…`. */
export function matchScratch(relPath: string, patterns: readonly string[]): boolean {
  const rel = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!rel || rel.startsWith('/')) return false;
  let hit = false;
  for (const raw of patterns) {
    const neg = raw.startsWith('!');
    const g = (neg ? raw.slice(1) : raw).replace(/\\/g, '/');
    if (!g) continue;
    if (!globToRegExp(g).test(rel)) continue;
    if (neg) return false;
    hit = true;
  }
  return hit;
}
