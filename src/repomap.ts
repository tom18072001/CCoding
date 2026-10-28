import fs from 'node:fs';
import path from 'node:path';

/**
 * Bản đồ repo cho agent: thư mục, tệp nguồn + số dòng, route HTTP, model/enum Prisma, hàm/lớp cấp cao kèm số dòng.
 * Mục đích: agent định vị trước rồi đọc đúng đoạn bằng read_file + offset, thay vì đọc cả tệp lớn nhiều lần
 * (ND57 27/10: S2 mất ~20 lượt chỉ để tìm chỗ gắn code trong server.js 1.700 dòng). Chỉ đọc tệp, không chạy gì.
 */

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.ccoding', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'out', '.turbo', '.cache', 'uploads', '.idea', '.vscode', 'bin', 'obj']);
const SOURCE = /\.(m?[jt]sx?|cjs|vue|svelte|py|go|java|kt|cs|rb|php|rs|prisma|sql|sh|ps1)$/i;
const TEXT = /\.(json|ya?ml|toml|md|html?|css|scss|env\.example)$/i;
const SKIP_FILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|.*\.min\.(js|css))$/i;

export interface RepoMap {
  text: string;
  files: number;
  large: Array<{ path: string; lines: number }>;
}

interface FileInfo {
  rel: string;
  lines: number;
  symbols: { routes: string[]; models: string[]; defs: string[] };
}

function symbolsOf(rel: string, body: string): FileInfo['symbols'] {
  const routes: string[] = [];
  const models: string[] = [];
  const defs: string[] = [];
  const lines = body.split(/\r?\n/);
  const isPrisma = rel.endsWith('.prisma');
  const isPy = rel.endsWith('.py');
  const isSql = rel.endsWith('.sql');
  lines.forEach((l, i) => {
    const n = i + 1;
    let m: RegExpExecArray | null;
    if (isPrisma) {
      if ((m = /^(model|enum|view)\s+(\w+)/.exec(l))) models.push(`${m[1]} ${m[2]} :${n}`);
      return;
    }
    if (isSql) {
      if ((m = /^\s*(CREATE|ALTER)\s+(TABLE|INDEX|UNIQUE INDEX|TYPE)\s+(IF NOT EXISTS\s+)?("?[\w.]+"?)/i.exec(l))) models.push(`${m[1].toUpperCase()} ${m[2].toUpperCase()} ${m[4]} :${n}`);
      return;
    }
    if ((m = /\b(?:app|router|api|server|r)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/.exec(l))) routes.push(`${m[1].toUpperCase()} ${m[2]} :${n}`);
    else if (isPy && (m = /^@\w+\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]/.exec(l))) routes.push(`${m[1].toUpperCase()} ${m[2]} :${n}`);
    if (isPy) {
      if ((m = /^(def|class|async def)\s+(\w+)/.exec(l))) defs.push(`${m[2]} :${n}`);
      return;
    }
    // hàm khai báo ở cấp cao hoặc trong một lớp bọc (IIFE của giao diện JS thuần): thụt lề tối đa 4 dấu cách
    if ((m = /^ {0,4}(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)/.exec(l))) defs.push(`${m[1]} :${n}`);
    else if ((m = /^ {0,2}(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/.exec(l))) defs.push(`${m[1]} :${n}`);
    else if ((m = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(l))) defs.push(`class ${m[1]} :${n}`);
    else if ((m = /^module\.exports\s*=\s*\{([^}]*)\}?/.exec(l))) defs.push(`exports {${m[1].replace(/\s+/g, ' ').trim().slice(0, 160)}} :${n}`);
    else if ((m = /^(?:export\s+)?(?:interface|type)\s+(\w+)/.exec(l))) defs.push(`type ${m[1]} :${n}`);
  });
  return { routes, models, defs };
}

function walk(root: string, dir: string, out: string[], limit: number): void {
  if (out.length >= limit) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(root, abs, out, limit);
    } else if (e.isFile()) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if ((SOURCE.test(e.name) || TEXT.test(e.name)) && !SKIP_FILES.test(rel)) out.push(rel);
    }
  }
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

export function buildRepoMap(root: string, o: { maxFiles?: number; maxChars?: number; largeLines?: number; now?: Date } = {}): RepoMap {
  const maxChars = o.maxChars ?? 28_000;
  const largeAt = o.largeLines ?? 800;
  const rels: string[] = [];
  walk(root, root, rels, o.maxFiles ?? 5000);
  const files: FileInfo[] = [];
  for (const rel of rels) {
    const abs = path.join(root, rel);
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.size > 2 * 1024 * 1024) continue;
    const body = fs.readFileSync(abs, 'utf8');
    const lines = body ? body.split(/\r?\n/).length : 0;
    files.push({ rel, lines, symbols: SOURCE.test(rel) ? symbolsOf(rel, body) : { routes: [], models: [], defs: [] } });
  }
  const dirs = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    const d = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '.';
    const cur = dirs.get(d) ?? { files: 0, lines: 0 };
    cur.files++;
    cur.lines += f.lines;
    dirs.set(d, cur);
  }
  const large = files.filter((f) => SOURCE.test(f.rel) && f.lines >= largeAt).sort((a, b) => b.lines - a.lines).map((f) => ({ path: f.rel, lines: f.lines }));
  const head = [
    `# Bản đồ repo (CCoding tạo lúc ${(o.now ?? new Date()).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${fmt(files.length)} tệp)`,
    'Dùng để ĐỊNH VỊ trước khi đọc: đọc đúng đoạn bằng `read_file` (path + offset theo số dòng `:N` dưới đây), không đọc cả tệp lớn. Số dòng có thể lệch sau khi sửa — tìm lại bằng `search`.',
    '',
    '## Thư mục (tệp · dòng)',
    ...[...dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 80)
      .map(([d, v]) => `- ${d} — ${fmt(v.files)} tệp · ${fmt(v.lines)} dòng`),
    ...(dirs.size > 80 ? [`- … (+${fmt(dirs.size - 80)} thư mục)`] : []),
    '',
    `## Tệp nguồn lớn (≥ ${fmt(largeAt)} dòng)`,
    ...(large.length ? large.map((f) => `- ${f.path} — ${fmt(f.lines)} dòng`) : ['- (không có)']),
    '',
    '## Tệp nguồn và ký hiệu',
  ];
  const body: string[] = [];
  let used = head.join('\n').length;
  // route + model trước (định vị API/schema), rồi hàm; tệp có ký hiệu trước tệp không có
  const src = files.filter((f) => SOURCE.test(f.rel));
  for (const pass of ['full', 'short'] as const) {
    body.length = 0;
    used = head.join('\n').length;
    let cut = 0;
    for (const f of src) {
      const s = f.symbols;
      const parts = [`### ${f.rel} (${fmt(f.lines)} dòng)`];
      if (s.models.length) parts.push(`- schema: ${s.models.join(' · ')}`);
      if (s.routes.length) parts.push(`- route: ${s.routes.join(' · ')}`);
      if (s.defs.length && (pass === 'full' || f.lines >= largeAt)) parts.push(`- định nghĩa: ${s.defs.slice(0, pass === 'full' ? 40 : 25).join(' · ')}${s.defs.length > 40 ? ` · … (+${s.defs.length - 40})` : ''}`);
      const block = parts.length > 1 ? parts.join('\n') : `- ${f.rel} (${fmt(f.lines)} dòng)`;
      if (used + block.length + 1 > maxChars) {
        cut++;
        continue;
      }
      body.push(block);
      used += block.length + 1;
    }
    if (!cut || pass === 'short') {
      if (cut) body.push(`\n… (${fmt(cut)} tệp không đủ chỗ — dùng list_files/search)`);
      break;
    }
  }
  return { text: `${head.join('\n')}\n${body.join('\n')}\n`, files: files.length, large };
}
