import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { killTree } from '../runtimes/spawn.js';
import { fetchUrl, searchPapers, WebError, webSearch } from './web.js';
import type { Phase, ToolAccess, ToolName, ToolPolicy } from '../types.js';

/**
 * Công cụ workspace cho agent (đọc/liệt kê/tìm file, ghi/sửa file, chạy lệnh) — giới hạn trong thư mục gốc.
 * Đây là "sandbox theo quy ước": chặn thoát thư mục, chặn đọc file bí mật, chặn lệnh nguy hiểm theo danh sách,
 * bỏ biến môi trường chứa khóa. Không phải cô lập ở mức hệ điều hành — xem docs/TOOLS.md.
 */

const isWin = process.platform === 'win32';

const READ_TOOLS: ToolName[] = ['list_files', 'read_file', 'search'];
export const WEB_TOOLS: ToolName[] = ['search_papers', 'web_search', 'fetch_url'];
/** Pha được tra cứu web (họp/định tuyến/chốt/tổng hợp thì không — tránh tốn token). */
const WEB_PHASES = new Set<Phase>(['plan', 'execute', 'revise', 'review']);
const WRITE_TOOLS: ToolName[] = ['write_file', 'edit_file'];

/** Tên công cụ trong agent.md (kiểu Claude Code) → công cụ workspace. */
const AGENT_TOOL_MAP: Record<string, ToolName[]> = {
  read: ['read_file'],
  glob: ['list_files'],
  ls: ['list_files'],
  grep: ['search'],
  write: ['write_file'],
  edit: ['edit_file'],
  multiedit: ['edit_file'],
  bash: ['run_command'],
  websearch: ['search_papers', 'web_search'],
  webfetch: ['fetch_url'],
};

const LEVEL: Record<ToolAccess, ToolName[]> = {
  none: [],
  read: READ_TOOLS,
  write: [...READ_TOOLS, ...WRITE_TOOLS],
  exec: [...READ_TOOLS, ...WRITE_TOOLS, 'run_command'],
};

/** Công cụ một agent được dùng ở một pha, theo hồ sơ (tools:) và quyền của dự án. */
export function toolsFor(agentTools: string[], access: ToolAccess, phase: Phase, web = false): ToolName[] {
  if (phase === 'route' || phase === 'discuss') return [];
  const fromAgent = new Set(agentTools.flatMap((t) => AGENT_TOOL_MAP[t.toLowerCase()] ?? []));
  const webAllowed = web && WEB_PHASES.has(phase) ? WEB_TOOLS.filter((t) => fromAgent.has(t)) : [];
  // agent được đọc/sửa file thì luôn được liệt kê/tìm kiếm để định hướng
  if (fromAgent.size) for (const t of READ_TOOLS) if (fromAgent.has('read_file') || fromAgent.has('write_file')) fromAgent.add(t);
  let allowed = LEVEL[access].filter((t) => fromAgent.has(t));
  // review: được chạy test/typecheck để xác nhận (không ghi file); lập kế hoạch/tổng hợp: chỉ đọc
  if (phase === 'review') allowed = allowed.filter((t) => READ_TOOLS.includes(t) || t === 'run_command');
  else if (phase !== 'execute' && phase !== 'revise') allowed = allowed.filter((t) => READ_TOOLS.includes(t));
  return [...allowed, ...webAllowed];
}

// ── Định nghĩa công cụ (OpenAI function calling) ────────────────────────────

const DEFS: Record<ToolName, { description: string; parameters: Record<string, unknown> }> = {
  list_files: {
    description: 'Liệt kê file/thư mục trong workspace (bỏ qua node_modules, .git, dist…). Dùng để nắm cấu trúc dự án trước khi đọc.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Thư mục tương đối so với gốc workspace, mặc định "."' },
        depth: { type: 'integer', description: 'Độ sâu (1–6), mặc định 2' },
      },
    },
  },
  read_file: {
    description: 'Đọc nội dung file văn bản (có số dòng). Đọc nhiều file một lần bằng "paths". File lớn: dùng offset/limit.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tương đối' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Nhiều file cùng lúc (tối đa 8)' },
        offset: { type: 'integer', description: 'Dòng bắt đầu (từ 1)' },
        limit: { type: 'integer', description: 'Số dòng tối đa (mặc định 400)' },
      },
    },
  },
  search: {
    description: 'Tìm chuỗi/regex trong các file (trả về path:dòng: nội dung) — dùng thay cho rg/grep/Select-String qua run_command.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex (JavaScript) hoặc chuỗi thường' },
        path: { type: 'string', description: 'Thư mục con, mặc định "."' },
        glob: { type: 'string', description: 'Lọc tên file, vd. "*.ts" hoặc "src/**/*.tsx"' },
        ignore_case: { type: 'boolean' },
      },
      required: ['pattern'],
    },
  },
  write_file: {
    description: 'Tạo mới hoặc ghi đè toàn bộ một file (tự tạo thư mục).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  edit_file: {
    description: 'Sửa file bằng cách thay một đoạn văn bản chính xác (old_string phải duy nhất trừ khi replace_all).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  search_papers: {
    description: 'Tìm bài báo học thuật trên OpenAlex (chỉ mục mở): trả về tiêu đề, năm, venue, loại, số trích dẫn, tác giả, DOI và tóm tắt. Dùng để tổng quan tài liệu, đếm bài theo venue, kiểm chứng trích dẫn.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khóa tiếng Anh, vd. "permission-aware retrieval augmented generation"' },
        year_from: { type: 'integer' },
        year_to: { type: 'integer' },
        venue: { type: 'string', description: 'Lọc venue chứa chuỗi này, vd. "ACL", "EMNLP", "USENIX"' },
        sort: { type: 'string', enum: ['relevance', 'cited'] },
        limit: { type: 'integer', description: 'Số kết quả (≤ 25, mặc định 10)' },
      },
      required: ['query'],
    },
  },
  web_search: {
    description: 'Tìm kiếm web chung (tiêu đề, URL, đoạn trích) — văn bản pháp luật, tiêu chuẩn, tài liệu kỹ thuật, trang dự án.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
  },
  fetch_url: {
    description: 'Đọc nội dung một trang web hoặc PDF công khai thành chữ (đọc tiếp bằng offset). Không truy cập được địa chỉ nội bộ.',
    parameters: { type: 'object', properties: { url: { type: 'string' }, offset: { type: 'integer', description: 'Vị trí ký tự bắt đầu' } }, required: ['url'] },
  },
  run_command: {
    description:
      `Chạy lệnh shell trong thư mục gốc workspace (${isWin ? 'PowerShell' : 'bash'}) — dùng cho cài dependency, typecheck, test, build, migration trên DB dev, git. ` +
      'Đọc/tìm trong code thì dùng read_file/search/list_files (đa nền tảng, UTF-8), không dùng cat/Get-Content/rg qua lệnh. ' +
      (isWin
        ? 'PowerShell: không có brace expansion {a,b}; dấu * trong đường dẫn không tự mở rộng cho chương trình ngoài; nối lệnh bằng ";" (lệnh sau vẫn chạy khi lệnh trước lỗi); Get-Content cần -Encoding utf8. '
        : '') +
      'Không push, không lệnh phá hủy, không in khóa/bí mật. Trả về mã thoát + stdout/stderr (đã cắt bớt).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_sec: { type: 'integer', description: 'Mặc định 300, tối đa theo cấu hình' },
      },
      required: ['command'],
    },
  },
};

export function toolDefinitions(allow: ToolName[]): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return allow.map((name) => ({ type: 'function' as const, function: { name, ...DEFS[name] } }));
}

// ── Bảo vệ đường dẫn ────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '.turbo', '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'bin', 'obj', '.idea', '.vscode']);
const SECRET_FILE = /^(\.env(\..+)?|.*\.(pem|key|pfx|p12|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(\..+)?|secrets?\.(json|ya?ml|toml))$/i;
const SECRET_OK = /^\.env\.(example|sample|template|dist)$/i;

export class ToolError extends Error {}

function samePrefix(child: string, root: string): boolean {
  const c = isWin ? child.toLowerCase() : child;
  const r = isWin ? root.toLowerCase() : root;
  return c === r || c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/** Giải đường dẫn tương đối trong root; chặn "..", đường dẫn tuyệt đối ra ngoài và symlink thoát ra ngoài. */
export function resolveInside(root: string, rel: string | undefined): string {
  const realRoot = fs.realpathSync(root);
  const raw = String(rel ?? '.').trim() || '.';
  const abs = path.resolve(realRoot, raw);
  if (!samePrefix(abs, realRoot)) throw new ToolError(`Đường dẫn ra ngoài workspace: ${raw}`);
  // kiểm tra symlink: realpath của phần đã tồn tại gần nhất
  let probe = abs;
  while (!fs.existsSync(probe) && probe !== realRoot) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (!samePrefix(real, realRoot)) throw new ToolError(`Đường dẫn trỏ ra ngoài workspace (symlink): ${raw}`);
  return abs;
}

function relOf(root: string, abs: string): string {
  return path.relative(fs.realpathSync(root), abs).split(path.sep).join('/') || '.';
}

function insideGitDir(rel: string): boolean {
  return rel.split('/').includes('.git');
}

function assertReadable(root: string, abs: string): void {
  const rel = relOf(root, abs);
  const base = path.basename(abs);
  if (insideGitDir(rel)) throw new ToolError('Không đọc nội dung thư mục .git (có thể chứa thông tin xác thực) — dùng run_command với git log/diff');
  if (SECRET_FILE.test(base) && !SECRET_OK.test(base)) throw new ToolError(`File bí mật bị chặn đọc theo chính sách bảo vệ dữ liệu: ${rel}`);
}

function assertWritable(root: string, abs: string): void {
  const rel = relOf(root, abs);
  if (insideGitDir(rel)) throw new ToolError('Không ghi vào thư mục .git');
  if (rel.split('/').includes('node_modules')) throw new ToolError('Không ghi vào node_modules');
  const base = path.basename(abs);
  if (SECRET_FILE.test(base) && !SECRET_OK.test(base)) throw new ToolError(`Không ghi file bí mật: ${rel}`);
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.3);
  return `${text.slice(0, head)}\n… [đã lược ${text.length - max} ký tự] …\n${text.slice(-(max - head))}`;
}

// ── Danh sách lệnh bị chặn ───────────────────────────────────────────────────

export const DEFAULT_DENY: Array<[RegExp, string]> = [
  [/\bgit\s+push\b/i, 'git push (người dùng tự review và push)'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard'],
  [/\bgit\s+clean\b[^\n]*-[a-z]*f/i, 'git clean -f'],
  // nhánh của nhiệm vụ cố định: nhiều agent dùng chung một worktree — đổi/tạo nhánh làm các agent khác làm nhầm chỗ
  [/\bgit\s+switch\b|\bgit\s+checkout\s+(?!--\s)/i, 'tạo/chuyển nhánh (làm trên nhánh hiện tại của worktree; khôi phục file dùng `git checkout -- <file>` hoặc `git restore`)'],
  [/\bgit\s+branch\s+(?!(-a|-r|-v|-vv|--list|--show-current|--contains|--merged|--no-merged|--all|--remotes)\b)[^\s|;]/i, 'tạo/xóa/đổi tên nhánh'],
  [/\bgit\s+worktree\b/i, 'thao tác git worktree'],
  [/\bgit\s+(rebase|filter-branch|filter-repo|update-ref|branch\s+-D)\b/i, 'viết lại lịch sử git'],
  [/\bgit\s+config\b[^\n]*(credential|url\.|user\.)/i, 'đổi cấu hình git'],
  [/\brm\s+-[a-z]*r/i, 'xóa đệ quy (rm -r)'],
  [/\bRemove-Item\b[^\n]*-Recurse/i, 'xóa đệ quy (Remove-Item -Recurse)'],
  [/\b(rd|rmdir)\s+\/s\b/i, 'xóa thư mục đệ quy'],
  [/\bdel\s+\/[sq]\b/i, 'xóa hàng loạt'],
  [/\bformat(-volume)?\s+[a-z]:/i, 'format ổ đĩa'],
  [/\b(mkfs|fdisk|diskpart)\b/i, 'thao tác ổ đĩa'],
  [/\bdd\s+if=/i, 'dd'],
  [/\b(shutdown|reboot|halt|poweroff|Stop-Computer|Restart-Computer)\b/i, 'tắt/khởi động lại máy'],
  [/\b(npm|pnpm|yarn)\s+publish\b/i, 'publish gói'],
  [/\bdocker\s+(system\s+prune|volume\s+(rm|prune)|rm\s+-f)\b/i, 'xóa tài nguyên docker'],
  [/\bkubectl\s+(delete|drain)\b/i, 'kubectl delete'],
  [/\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(ba)?sh\b/i, 'tải và chạy script từ mạng'],
  [/\b(iex|Invoke-Expression)\b/i, 'Invoke-Expression'],
  [/\bDROP\s+(DATABASE|SCHEMA)\b/i, 'DROP DATABASE/SCHEMA'],
  [/\bprisma\s+migrate\s+reset\b|--force-reset|--accept-data-loss/i, 'reset/xóa dữ liệu DB'],
  [/\b(setx|reg\s+(add|delete|import))\b|Set-ExecutionPolicy|\bnet\s+user\b/i, 'đổi cấu hình hệ thống'],
  [/\b(ssh|scp|sftp|ftp|telnet)\s/i, 'kết nối máy khác'],
  // chỉ chặn liệt kê TOÀN BỘ biến môi trường hoặc đọc biến chứa khóa; xem một biến cụ thể (vd. $env:NODE_ENV) vẫn được
  [/(^|[;&|]\s*)(printenv|env|set)\s*($|[;&|])|\b(Get-ChildItem|gci|dir|ls)\s+env:\\?\s*($|[;&|])|\$env:[A-Z_]*(KEY|TOKEN|SECRET|PASS)/i, 'liệt kê toàn bộ biến môi trường / đọc biến chứa khóa'],
  [/(^|[\s;&|])(:\(\)\s*\{|fork\s*bomb)/i, 'fork bomb'],
];

export function deniedReason(command: string, extra: string[] = [], allowGitCommit = false): string | undefined {
  for (const [re, why] of DEFAULT_DENY) if (re.test(command)) return why;
  if (!allowGitCommit && /\bgit\s+commit\b/i.test(command)) return 'git commit khi không làm trên nhánh/worktree riêng';
  for (const src of extra) {
    try {
      if (new RegExp(src, 'i').test(command)) return `khớp quy tắc cấm "${src}"`;
    } catch {
      /* regex cấu hình lỗi: bỏ qua */
    }
  }
  return undefined;
}

/** Biến môi trường chứa khóa của CCoding/nhà cung cấp không được truyền vào lệnh của agent. */
export function scrubEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (/(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|^BIFROST_|^NINEROUTER|^CCODING_TOKEN|^ANTHROPIC_|^OPENAI_|^AWS_|^AZURE_|^GH_|^GITHUB_)/i.test(k)) continue;
    out[k] = v;
  }
  out.CI = out.CI ?? '1';
  out.CCODING_AGENT = '1';
  // workspace của agent là môi trường phát triển: không để NODE_ENV=production / omit=dev của máy làm thiếu devDependencies
  if (out.NODE_ENV === 'production') delete out.NODE_ENV;
  for (const k of Object.keys(out)) if (/^npm_config_(omit|production|only)$/i.test(k)) delete out[k];
  out.npm_config_include = 'dev';
  return out;
}

// ── Thực thi công cụ ─────────────────────────────────────────────────────────

export interface ToolOutcome {
  ok: boolean;
  output: string;
  ms: number;
  /** Mô tả ngắn để hiện trên giao diện / log (không chứa nội dung file). */
  summary: string;
}

function globToRe(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  return new RegExp(glob.includes('/') ? `^${re}$` : `(^|/)${re}$`, 'i');
}

function walk(root: string, dir: string, depth: number, out: string[], limit: number, filesOnly = false): void {
  if (out.length >= limit) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (!filesOnly) out.push(`${rel}/`);
      if (depth > 1) walk(root, abs, depth - 1, out, limit, filesOnly);
    } else if (e.isFile()) out.push(rel);
  }
}

async function runShell(command: string, cwd: string, timeoutSec: number, maxChars: number, signal?: AbortSignal): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  const [file, args] = isWin
    ? [
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          // PowerShell gộp mã thoát của lệnh native thành 1 → trả lại đúng mã thoát cuối cùng
          `$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $global:LASTEXITCODE=0; ${command}\n$__ok=$?; if ($LASTEXITCODE) { exit $LASTEXITCODE } elseif (-not $__ok) { exit 1 } else { exit 0 }`,
        ],
      ]
    : [fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh', ['-c', command]];
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, env: scrubEnv(process.env), windowsHide: true, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let dropped = 0;
    const add = (b: Buffer) => {
      const s = b.toString('utf8');
      if (out.length < maxChars * 4) out += s;
      else dropped += s.length;
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutSec * 1000);
    const onAbort = () => killTree(child.pid);
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = (code: number | null) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, out: dropped ? `${out}\n… [bỏ ${dropped} ký tự đầu ra]` : out, timedOut });
    };
    child.on('error', (e) => {
      out += `\n${e.message}`;
      done(-1);
    });
    child.on('close', (code) => done(code));
  });
}

/** Khóa liên tiến trình theo workspace: .ccoding/cmd.lock (tự bỏ khóa cũ quá hạn). */
async function lockWorkspace(root: string, timeoutSec: number, signal?: AbortSignal): Promise<() => void> {
  const dir = path.join(root, '.ccoding');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'cmd.lock');
  const deadline = Date.now() + (timeoutSec + 120) * 1000;
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), ttl: timeoutSec }));
      fs.closeSync(fd);
      return () => fs.rmSync(file, { force: true });
    } catch {
      try {
        const cur = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: number; ttl: number };
        if (Date.now() - cur.at > (cur.ttl + 60) * 1000) fs.rmSync(file, { force: true });
      } catch {
        fs.rmSync(file, { force: true });
      }
      if (signal?.aborted || Date.now() > deadline) return () => undefined;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/** Chạy một công cụ. Không bao giờ ném lỗi ra ngoài — lỗi trả về dạng văn bản để model tự sửa. */
export async function executeTool(name: string, rawArgs: unknown, policy: ToolPolicy, signal?: AbortSignal): Promise<ToolOutcome> {
  const t0 = Date.now();
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const max = policy.maxOutputChars;
  const done = (ok: boolean, output: string, summary: string): ToolOutcome => ({ ok, output: clip(output, max), ms: Date.now() - t0, summary });
  try {
    if (!policy.allow.includes(name as ToolName)) throw new ToolError(`Công cụ "${name}" không được cấp ở bước này. Công cụ có thể dùng: ${policy.allow.join(', ') || '(không có)'}`);
    const root = policy.root;
    switch (name as ToolName) {
      case 'list_files': {
        const dir = resolveInside(root, str(args.path) || '.');
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new ToolError(`Không phải thư mục: ${str(args.path)}`);
        const depth = Math.min(6, Math.max(1, Number(args.depth) || 2));
        const out: string[] = [];
        walk(fs.realpathSync(root), dir, depth, out, 500);
        return done(true, out.length ? out.join('\n') + (out.length >= 500 ? '\n… (cắt ở 500 mục — thu hẹp path)' : '') : '(trống)', `list ${str(args.path) || '.'}`);
      }
      case 'read_file': {
        const list = (Array.isArray(args.paths) ? args.paths.map(str) : []).concat(args.path ? [str(args.path)] : []).filter(Boolean).slice(0, 8);
        if (!list.length) throw new ToolError('Thiếu path');
        const offset = Math.max(1, Number(args.offset) || 1);
        const limit = Math.min(2000, Math.max(1, Number(args.limit) || 400));
        const parts: string[] = [];
        // ngân sách ký tự dùng chung cho các file trong lần đọc: dừng ở ranh giới dòng và chỉ offset đọc tiếp
        // (không để clip() cắt mất phần giữa file — agent sẽ đọc lại mãi cùng một đoạn)
        const readMax = Math.max(max, policy.maxReadChars ?? max);
        let room = Math.max(4000, readMax - 400);
        const skipped: string[] = [];
        for (const rel of list) {
          if (room < 1500) {
            skipped.push(rel);
            continue;
          }
          try {
            const abs = resolveInside(root, rel);
            assertReadable(root, abs);
            if (!fs.existsSync(abs)) throw new ToolError(`Không có file: ${rel}`);
            const st = fs.statSync(abs);
            if (st.isDirectory()) throw new ToolError(`${rel} là thư mục — dùng list_files`);
            if (st.size > 5 * 1024 * 1024) throw new ToolError(`${rel} quá lớn (${st.size} byte)`);
            const buf = fs.readFileSync(abs);
            if (isBinary(buf)) throw new ToolError(`${rel} là file nhị phân`);
            const lines = buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/);
            const head = `=== ${relOf(root, abs)} (${lines.length} dòng) ===`;
            const out: string[] = [];
            let used = head.length + 120;
            let next = offset;
            for (; next <= Math.min(lines.length, offset - 1 + limit); next++) {
              const ln = `${String(next).padStart(5)}| ${lines[next - 1]}`;
              if (used + ln.length + 1 > room && out.length) break;
              out.push(ln.length > room ? `${ln.slice(0, room - 200)} … [dòng quá dài, đã cắt]` : ln);
              used += ln.length + 1;
            }
            const more = next <= lines.length ? `\n… còn ${lines.length - next + 1} dòng — đọc tiếp: read_file path="${relOf(root, abs)}" offset=${next}` : '';
            room -= used;
            parts.push(`${head}\n${out.join('\n')}${more}`);
          } catch (e) {
            parts.push(`=== ${rel} ===\nLỖI: ${(e as Error).message}`);
          }
        }
        if (skipped.length) parts.push(`(chưa đọc vì đã hết hạn mức ký tự của lần đọc này: ${skipped.join(', ')} — đọc ở lượt sau)`);
        return { ok: !parts.every((p) => p.includes('\nLỖI: ')), output: clip(parts.join('\n\n'), readMax), ms: Date.now() - t0, summary: `read ${list.join(', ')}`.slice(0, 160) };
      }
      case 'search': {
        const pattern = str(args.pattern);
        if (!pattern) throw new ToolError('Thiếu pattern');
        let re: RegExp;
        try {
          re = new RegExp(pattern, args.ignore_case ? 'i' : '');
        } catch {
          re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), args.ignore_case ? 'i' : '');
        }
        const base = resolveInside(root, str(args.path) || '.');
        const realRoot = fs.realpathSync(root);
        const files: string[] = [];
        if (fs.statSync(base).isFile()) files.push(path.relative(realRoot, base).split(path.sep).join('/'));
        else walk(realRoot, base, 12, files, 8000, true);
        const g = args.glob ? globToRe(str(args.glob)) : undefined;
        const hits: string[] = [];
        for (const rel of files) {
          if (g && !g.test(rel)) continue;
          const abs = path.join(realRoot, rel);
          const b = path.basename(rel);
          if ((SECRET_FILE.test(b) && !SECRET_OK.test(b)) || insideGitDir(rel)) continue;
          let buf: Buffer;
          try {
            if (fs.statSync(abs).size > 2 * 1024 * 1024) continue;
            buf = fs.readFileSync(abs);
          } catch {
            continue;
          }
          if (isBinary(buf)) continue;
          const lines = buf.toString('utf8').split(/\r?\n/);
          for (let i = 0; i < lines.length && hits.length < 200; i++) if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 240)}`);
          if (hits.length >= 200) break;
        }
        return done(true, hits.length ? hits.join('\n') + (hits.length >= 200 ? '\n… (cắt ở 200 kết quả)' : '') : '(không có kết quả)', `search /${pattern.slice(0, 60)}/`);
      }
      case 'write_file': {
        const rel = str(args.path);
        const abs = resolveInside(root, rel);
        assertWritable(root, abs);
        const content = str(args.content);
        if (content.length > 2_000_000) throw new ToolError('Nội dung quá lớn (> 2 MB)');
        const existed = fs.existsSync(abs);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
        return done(true, `${existed ? 'Đã ghi đè' : 'Đã tạo'} ${relOf(root, abs)} (${Buffer.byteLength(content)} byte, ${content.split('\n').length} dòng)`, `write ${relOf(root, abs)}`);
      }
      case 'edit_file': {
        const rel = str(args.path);
        const abs = resolveInside(root, rel);
        assertWritable(root, abs);
        assertReadable(root, abs);
        if (!fs.existsSync(abs)) throw new ToolError(`Không có file: ${rel} — dùng write_file để tạo mới`);
        const oldS = str(args.old_string);
        const newS = str(args.new_string);
        if (!oldS) throw new ToolError('old_string rỗng');
        const raw = fs.readFileSync(abs, 'utf8');
        // chấp nhận cả khi model gửi \n còn file dùng \r\n
        const crlf = raw.includes('\r\n') && !oldS.includes('\r\n');
        const text = crlf ? raw.replace(/\r\n/g, '\n') : raw;
        const count = text.split(oldS).length - 1;
        if (count === 0) throw new ToolError('Không tìm thấy old_string trong file (kiểm tra khoảng trắng/xuống dòng; đọc lại file trước khi sửa)');
        if (count > 1 && !args.replace_all) throw new ToolError(`old_string xuất hiện ${count} lần — thêm ngữ cảnh cho duy nhất hoặc đặt replace_all=true`);
        let next = args.replace_all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS);
        if (crlf) next = next.replace(/\n/g, '\r\n');
        fs.writeFileSync(abs, next, 'utf8');
        return done(true, `Đã sửa ${relOf(root, abs)} (${args.replace_all ? count : 1} chỗ)`, `edit ${relOf(root, abs)}`);
      }
      case 'search_papers':
        return done(true, await searchPapers(args, signal), `papers "${str(args.query).slice(0, 80)}"`);
      case 'web_search':
        return done(true, await webSearch(args, signal), `web "${str(args.query).slice(0, 80)}"`);
      case 'fetch_url':
        return done(true, await fetchUrl(args, max, signal), `fetch ${str(args.url).slice(0, 100)}`);
      case 'run_command': {
        const command = str(args.command).trim();
        if (!command) throw new ToolError('Thiếu command');
        const why = deniedReason(command, policy.denyCommands, policy.allowGitCommit);
        if (why) throw new ToolError(`Lệnh bị chặn theo chính sách an toàn: ${why}. Hãy dùng cách khác hoặc ghi vào báo cáo để người dùng tự chạy.`);
        const timeout = Math.min(policy.commandTimeoutSec, Math.max(5, Number(args.timeout_sec) || 300));
        // một lệnh tại một thời điểm trong cùng workspace (agent song song có thể ở các tiến trình/pane khác nhau)
        const unlock = await lockWorkspace(fs.realpathSync(root), timeout, signal);
        let r: Awaited<ReturnType<typeof runShell>>;
        try {
          r = await runShell(command, fs.realpathSync(root), timeout, max, signal);
        } finally {
          unlock();
        }
        const head = r.timedOut ? `⏱ Hết thời gian ${timeout}s — đã dừng tiến trình` : `exit code: ${r.code}`;
        return done(!r.timedOut && r.code === 0, `${head}\n${r.out.trim() || '(không có đầu ra)'}`, `$ ${command.slice(0, 120)} → ${r.timedOut ? 'timeout' : r.code}`);
      }
      default:
        throw new ToolError(`Không có công cụ "${name}"`);
    }
  } catch (e) {
    const msg = e instanceof ToolError || e instanceof WebError ? e.message : `Lỗi khi chạy ${name}: ${(e as Error).message}`;
    return { ok: false, output: `LỖI: ${msg}`, ms: Date.now() - t0, summary: `${name} ✗ ${msg.slice(0, 100)}` };
  }
}

/** Tóm tắt tham số để ghi log (không ghi nội dung file). */
export function argsSummary(name: string, rawArgs: unknown): string {
  const a = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  switch (name) {
    case 'write_file':
      return `${str(a.path)} (${str(a.content).length} ký tự)`;
    case 'edit_file':
      return `${str(a.path)} (−${str(a.old_string).length} +${str(a.new_string).length})`;
    case 'run_command':
      return str(a.command).slice(0, 300);
    case 'read_file':
      return (Array.isArray(a.paths) ? a.paths.map(str) : [str(a.path)]).filter(Boolean).join(', ').slice(0, 300);
    default:
      return JSON.stringify(a).slice(0, 300);
  }
}

/** Lệnh kiểm chứng thật (test, typecheck, lint, build, migration…) — khác lệnh khảo sát như git status, rg, ls. */
export function isCheckCommand(cmd: string): boolean {
  return /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|typecheck|type-check|lint|build|check|e2e|verify|ci)\b|\bnpx\s+(tsc|vitest|jest|playwright|eslint|prisma\s+(validate|migrate))|\bnode\s+--test\b|\btsc\b|\bpytest\b|python3?\s+-m\s+(pytest|unittest)|\bgo\s+(test|vet|build)\b|\bcargo\s+(test|build|check|clippy)\b|\bmvn\b|\bgradlew?\b|\bdotnet\s+(test|build)\b|\bprisma\s+(validate|migrate)|\bmake\s+(test|check)\b|docker\s+compose\s+config/i.test(cmd);
}

/** Lệnh tìm kiếm trả mã 1 vì không có kết quả (rg/grep/findstr/Select-String) — không phải lỗi thật. */
export function isNoMatch(tc: { name: string; args: string; ok: boolean; error?: string }): boolean {
  return !tc.ok && tc.name === 'run_command' && /^\s*(rg|grep|findstr|git\s+grep)\b|Select-String/i.test(tc.args) && /exit code:\s*1\b/.test(tc.error ?? '');
}
