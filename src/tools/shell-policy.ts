// Chính sách lệnh shell dùng chung cho vòng công cụ của CCoding (run_command, git_read) và hook claude-guard của runtime claude-cli:
// - giữ lệnh trong thư mục làm việc của nhiệm vụ (không đọc/ghi đường dẫn tuyệt đối hay "../" ra ngoài — vd. thư mục dữ liệu thật trên máy);
// - "git chỉ đọc" cho vai trò không có quyền chạy lệnh (xem lịch sử commit, diff, blame) — không chạy test/build/lệnh khác.
import os from 'node:os';
import path from 'node:path';

import { isWinAbs } from './guard-paths.js';

/** p nằm trong root (chính nó hoặc thư mục con). Một bên là đường dẫn Windows, bên kia không (trên máy không phải Windows) ⇒ ngoài. */
export function pathInside(root: string, p: string): boolean {
  const rw = isWinAbs(root);
  const pw = isWinAbs(p);
  const win = process.platform === 'win32' || (rw && pw);
  if (!win && (rw || pw)) return false;
  const P = win ? path.win32 : path.posix;
  const norm = (s: string) => (win ? s.toLowerCase() : s);
  const r = P.resolve(root);
  const f = P.resolve(r, p);
  const rel = P.relative(norm(r), norm(f));
  return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel));
}

/** `/c/Users/x` (Git Bash/MSYS) → `C:/Users/x`. */
export function msysToWin(p: string): string {
  const m = /^\/([A-Za-z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] ?? '/'}` : p;
}

/** Thư mục ngoài workspace mà lệnh được phép nhắc tới: thư mục tạm, cài đặt hệ thống/Node (đọc chương trình, không phải dữ liệu). */
function systemDirs(): string[] {
  const env = process.env;
  return [os.tmpdir(), env.TEMP, env.TMP, env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, path.dirname(process.execPath)].filter(
    (x): x is string => !!x,
  );
}

const STMT_SPLIT = /&&|\|\||;|\r?\n/;
const BOUND = `(?:^|[\\s"'=(<>|&,])`;
const STOP = `[^\\s"'|;&<>)\`,]*`;
/** Token đường dẫn tuyệt đối: ổ đĩa Windows, MSYS (/c/…), UNC, thư mục nhà. */
const ABS_TOKEN = new RegExp(`${BOUND}((?:[A-Za-z]:[\\\\/]|\\/[A-Za-z]\\/|\\\\\\\\[\\w.-]+\\\\|~[\\\\/]|\\$HOME\\b|\\$env:USERPROFILE\\b|%USERPROFILE%)${STOP})`, 'g');
/** Token đi lên thư mục cha: ../x, ..\x */
const UP_TOKEN = new RegExp(`${BOUND}((?:\\.\\.[\\\\/])+${STOP}|\\.\\.(?=$|[\\s"';&|)]))`, 'g');

function unquote(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '');
}

/**
 * Lệnh nhắc tới đường dẫn NGOÀI thư mục làm việc (đọc/ghi/cd ra ngoài) → lý do chặn; không thì undefined.
 * Theo dõi `cd <dir>` giữa các câu lệnh để "../" tính từ thư mục hiện tại. Không phải phân tích shell đầy đủ —
 * chặn các dạng phổ biến (C:\…, /c/…, ~/…, $HOME, ../ vượt gốc); thư mục tạm và thư mục cài đặt hệ thống được phép.
 */
export function outsidePathReason(command: string, root: string, extraAllowed: string[] = []): string | undefined {
  const allowed = [...systemDirs(), ...extraAllowed];
  let cwd = root;
  const outside = (p: string): boolean => {
    if (/^(~|\$HOME|\$env:USERPROFILE|%USERPROFILE%)/i.test(p)) return true;
    const abs = msysToWin(p.replace(/[\\/]+$/, '') || p);
    if (pathInside(root, abs)) return false;
    return !allowed.some((a) => pathInside(a, abs));
  };
  for (const raw of command.split(STMT_SPLIT)) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const cd = /^(?:cd|Set-Location|sl|pushd)\s+(.+)$/i.exec(stmt);
    if (cd) {
      const target = unquote(cd[1]);
      if (/^-/.test(target)) continue;
      const abs = isWinAbs(target) || /^\/[A-Za-z](\/|$)/.test(target) ? msysToWin(target) : path.resolve(cwd, target);
      if (/^(~|\$HOME|\$env:USERPROFILE|%USERPROFILE%)/i.test(target) || outside(abs)) return `đường dẫn ngoài thư mục làm việc của nhiệm vụ (\`cd ${target}\`) — chỉ làm việc trong ${root}`;
      cwd = abs;
      continue;
    }
    for (const m of stmt.matchAll(ABS_TOKEN)) {
      const tok = unquote(m[1]);
      if (outside(tok)) return `đường dẫn ngoài thư mục làm việc của nhiệm vụ (\`${tok.slice(0, 80)}\`) — chỉ làm việc trong ${root}`;
    }
    for (const m of stmt.matchAll(UP_TOKEN)) {
      const tok = unquote(m[1]);
      const base = isWinAbs(cwd) && process.platform !== 'win32' ? null : path.resolve(cwd, tok);
      if (base && !pathInside(root, base)) return `đường dẫn ngoài thư mục làm việc của nhiệm vụ (\`${tok.slice(0, 80)}\`) — chỉ làm việc trong ${root}`;
    }
  }
  return undefined;
}

// ── git chỉ đọc ─────────────────────────────────────────────────────────────

/** Lệnh con git chỉ đọc (không đổi working tree, index, nhánh, cấu hình). */
export const GIT_READ_SUBCOMMANDS = new Set([
  'log', 'show', 'diff', 'blame', 'annotate', 'status', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'shortlog', 'describe',
  'cat-file', 'for-each-ref', 'show-ref', 'merge-base', 'name-rev', 'reflog', 'branch', 'tag', 'whatchanged', 'range-diff', 'cherry', 'count-objects',
]);

/** Tùy chọn khiến lệnh "đọc" ghi tệp, đọc tệp ngoài repo hoặc chạy chương trình ngoài. */
const GIT_FORBIDDEN_OPT = /^(--output(=|$)|--no-index$|--ext-diff$|--textconv$|--contents(=|$)|--orderfile(=|$)|-O.|--exec(=|$)|--upload-pack|--receive-pack|--config-env|--git-dir|--work-tree|--namespace|--open-files-in-pager|-O$|--paginate$|--edit-description$|--set-upstream|--unset-upstream|--delete$|--move$|--copy$|--force$)/;
const SECRET_ARG = /(^|[\\/:])\.env(\.(?!example$|sample$|template$|dist$)[^\\/\s]+)?$/i;

/** Tách chuỗi tham số kiểu shell (nháy đơn/kép). Nháy không đóng ⇒ undefined. */
export function splitArgs(s: string): string[] | undefined {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === "\\" && q === '"' && s[i + 1] === '"') cur += s[++i];
      else if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (q) return undefined;
  if (cur || has) out.push(cur);
  return out;
}

/** Tham số sau `git` (vd. ["log", "--oneline", "-20"]) có phải lệnh chỉ đọc hợp lệ không → lý do chặn hoặc undefined. */
export function gitReadArgsReason(argv: string[]): string | undefined {
  const a = argv[0] === '--no-pager' ? argv.slice(1) : argv;
  const sub = a[0] ?? '';
  if (!GIT_READ_SUBCOMMANDS.has(sub)) return `\`git ${sub || '…'}\` không phải lệnh git chỉ đọc (được: ${[...GIT_READ_SUBCOMMANDS].slice(0, 12).join(', ')}…)`;
  for (const x of a.slice(1)) {
    if (GIT_FORBIDDEN_OPT.test(x)) return `tùy chọn \`${x}\` không được dùng với git chỉ đọc`;
    if (SECRET_ARG.test(x)) return 'không đọc tệp .env (bí mật) qua git';
  }
  const rest = a.slice(1).filter((x) => !x.startsWith('-'));
  if (sub === 'branch' && rest.length && !a.some((x) => /^(--list|-l|--contains|--merged|--no-merged|--points-at|-a|--all|-r|--remotes)$/.test(x)))
    return '`git branch <tên>` tạo nhánh — chỉ được liệt kê (git branch, git branch -a, --list, --show-current)';
  if (sub === 'tag' && rest.length && !a.some((x) => /^(-l|--list|--contains|--points-at|--merged|--no-merged)$/.test(x))) return '`git tag <tên>` tạo tag — chỉ được liệt kê (git tag -l)';
  if (sub === 'reflog' && rest[0] && /^(expire|delete|exists)$/.test(rest[0])) return `\`git reflog ${rest[0]}\` sửa reflog`;
  return undefined;
}

// ── Bộ tách lệnh shell có xét nháy (B-04) ───────────────────────────────────

/** Mã quy tắc vi phạm (hợp đồng với sự kiện `guard.block` của B-06). */
export type ShellRule = 'not-read-only' | 'redirect' | 'subst' | 'heredoc' | 'loop' | 'interpreter' | 'env-file' | 'outside-root';

export interface ShellViolation {
  /** Số thứ tự câu lệnh con (bắt đầu từ 1). */
  clause: number;
  rule: ShellRule;
  /** Chỉ tên lệnh hoặc toán tử — không chép lệnh thô. */
  cmd: string;
  /** Lý do chi tiết (vd. của gitReadArgsReason). */
  why?: string;
}

export interface ShellParse {
  /** Mỗi câu lệnh (cách nhau bởi `&&`, `||`, `;`, xuống dòng) là danh sách đoạn nối bằng `|`. */
  stmts: string[][];
  bad?: ShellViolation;
}

/**
 * Tách lệnh shell theo toán tử `&&`, `||`, `;`, xuống dòng, `|` — CHỈ khi nằm ngoài nháy đơn/kép. Gặp cấu trúc không thể chứng minh chỉ đọc
 * (thay thế lệnh `$(…)`/backtick — kể cả trong nháy kép, heredoc, `<`, `>` ra tệp, `&` nền, nháy không đóng) thì dừng và trả `bad`.
 * `>`/`<` trong nháy không phải chuyển hướng; `2>&1`, `>/dev/null`, `2>/dev/null` được bỏ qua.
 */
export function shellParse(command: string): ShellParse {
  const s = command;
  const stmts: string[][] = [];
  let segs: string[] = [];
  let cur = '';
  let q: '"' | "'" | null = null;
  const flushSeg = () => {
    segs.push(cur);
    cur = '';
  };
  const flushStmt = () => {
    flushSeg();
    if (segs.some((x) => x.trim())) stmts.push(segs);
    segs = [];
  };
  const bad = (rule: ShellRule, cmd: string): ShellParse => ({ stmts, bad: { clause: stmts.length + 1, rule, cmd } });
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") {
      cur += ch;
      if (ch === "'") q = null;
      continue;
    }
    if (ch === '\\') {
      cur += ch + (s[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '`') return bad('subst', '`');
    if (ch === '$' && s[i + 1] === '(') return bad('subst', '$(');
    if (q === '"') {
      cur += ch;
      if (ch === '"') q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === '<') return s[i + 1] === '<' ? bad('heredoc', '<<') : bad('redirect', '<');
    if (ch === '>' || (ch === '&' && s[i + 1] === '>')) {
      const m = /^&?>(?:&\d|>?\s*(?:\/dev\/null(?![\w./-])|\$null\b))/i.exec(s.slice(i));
      if (!m) return bad('redirect', '>');
      cur = cur.replace(/(^|\s)\d$/, '$1');
      i += m[0].length - 1;
      continue;
    }
    if (ch === '&') {
      if (s[i + 1] !== '&') return bad('not-read-only', '&');
      i++;
      flushStmt();
      continue;
    }
    if (ch === '|') {
      if (s[i + 1] === '|') {
        i++;
        flushStmt();
      } else flushSeg();
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r') {
      flushStmt();
      continue;
    }
    cur += ch;
  }
  if (q) return bad('not-read-only', 'nháy không đóng');
  flushStmt();
  return { stmts };
}

const CTRL_WORD = /^(for|while|until|if|case|select|function|do|done|then|fi|esac)$/;
const INTERP = /^(python[\d.]*|py|node|nodejs|deno|bun|ruby|perl|php|bash|sh|zsh|pwsh|powershell|cmd|npx?|pnpm|yarn|tsx|ts-node|java|make|eval|exec|source|\.)$/;
const NEUTRAL_CMD = new Set(['echo', 'printf', 'pwd', 'true']);
const READ_NAMES = new Set(['cat', 'head', 'tail', 'ls', 'wc', 'grep', 'egrep', 'nl', 'tree', 'stat', 'file', 'od', 'sort', 'uniq', 'cut', 'diff', 'cmp', 'find', 'rg', 'get-content', 'gc', 'select-string', 'sls', 'get-childitem', 'gci']);
/** Bộ lọc đầu ra được phép sau `|` trong lệnh git chỉ đọc qua shell (sed -n và awk an toàn xét riêng). */
const PIPE_NAMES = new Set(['head', 'tail', 'grep', 'egrep', 'wc', 'sort', 'uniq', 'cut', 'nl', 'tr', 'od', 'cat', 'select-object', 'select', 'select-string', 'sls', 'measure-object']);
const READ_CMD_FORBIDDEN = /\s-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)\b|\s--pre(-glob)?\b|\s-Path\s+\S+\s+-Value\b/i;
const SED_ADDR = /^(\d+(,(\d+|\$))?|\$)p$/;
const AWK_FORBIDDEN = /\b(system|getline|close|ENVIRON|fflush|nextfile)\b|[>|]|@(include|load|namespace)/;
const OUT_OPT = /^(-o|--output)/;

/** `sed -n 'Np;N,Mp;N,$p' [tệp…]` — chỉ in dòng. */
function sedReadOnly(argv: string[]): boolean {
  if (argv[1] !== '-n' || argv[2] === undefined) return false;
  if (argv.slice(3).some((x) => x.startsWith('-'))) return false;
  const parts = argv[2].split(';').map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((x) => SED_ADDR.test(x));
}

/** awk khi chương trình không chạy lệnh/ghi tệp/đọc môi trường và không nạp chương trình từ tệp. */
function awkReadOnly(argv: string[]): boolean {
  const rest = argv.slice(1);
  if (rest.some((x) => /^-[fiElW]/.test(x) || /^--(file|include|load|exec|source|command|extension)/.test(x))) return false;
  return !AWK_FORBIDDEN.test(rest.join(' '));
}

interface StmtResult {
  v?: ShellViolation;
  /** Câu chỉ là `cd` (không tính là lệnh đọc). */
  cd?: boolean;
}

function stmtCheck(segs: string[], clause: number, fileReads: boolean): StmtResult {
  const v = (rule: ShellRule, cmd: string, why?: string): StmtResult => ({ v: { clause, rule, cmd, why } });
  let first = true;
  for (const seg of segs) {
    const argv = splitArgs(seg);
    if (!argv) return v('not-read-only', 'nháy không đóng');
    if (!argv.length) return v('not-read-only', '|');
    const name = argv[0].replace(/\.exe$/i, '').replace(/^.*[\\/]/, '').toLowerCase();
    if (CTRL_WORD.test(name)) return v('loop', name);
    if (INTERP.test(name)) return v('interpreter', name);
    if (argv.some((x) => SECRET_ARG.test(x))) return v('env-file', name);
    if (first && segs.length === 1 && /^(cd|set-location|sl)$/.test(name)) return { cd: true };
    const text = ` ${argv.join(' ')}`;
    let ok: boolean;
    if (first && name === 'git') {
      const why = gitReadArgsReason(argv.slice(1));
      if (why) return v('not-read-only', 'git', why);
      ok = true;
    } else if (name === 'sed') ok = (!first || fileReads) && sedReadOnly(argv);
    else if (name === 'awk') ok = (!first || fileReads) && awkReadOnly(argv);
    else if (first) ok = fileReads && (NEUTRAL_CMD.has(name) || (READ_NAMES.has(name) && !READ_CMD_FORBIDDEN.test(text) && !(/^(sort|tree)$/.test(name) && argv.some((x) => OUT_OPT.test(x)))));
    else ok = PIPE_NAMES.has(name) && !(name === 'sort' && argv.some((x) => OUT_OPT.test(x)));
    if (!ok) return v('not-read-only', name);
    first = false;
  }
  return {};
}

const GIT_READ_DENY =
  'bạn chỉ được chạy lệnh CHỈ ĐỌC: git (log/show/diff/blame/status/grep/ls-files…) và đọc tệp (cat/head/tail/ls/grep/sed -n …), nối bằng `&&`, lọc qua `| head`/`| grep` — không có quyền chạy test, build, cài đặt, ghi tệp qua shell hay lệnh khác; lệnh cần chạy thì ghi rõ trong bàn giao để người có quyền chạy';

/**
 * Câu lệnh con đầu tiên vi phạm "chỉ đọc" (hoặc undefined). `fileReads`: chấp nhận thêm lệnh chỉ đọc tệp (cat/head/ls/grep/echo/pwd/sed -n/awk…).
 * Cho phép `cd <thư mục>` (thư mục do outsidePathReason kiểm) và git chỉ đọc nối bằng `&&`, `;`, `||`, lọc qua `| head`…
 */
export function gitReadViolation(command: string, fileReads = true): ShellViolation | undefined {
  const p = shellParse(command);
  if (p.bad) return p.bad;
  let seen = false;
  for (let i = 0; i < p.stmts.length; i++) {
    const r = stmtCheck(p.stmts[i], i + 1, fileReads);
    if (r.v) return r.v;
    if (!r.cd) seen = true;
  }
  return seen ? undefined : { clause: 1, rule: 'not-read-only', cmd: '' };
}

/**
 * Lệnh shell (Bash/PowerShell của Claude Code) cho vai trò chỉ có "git chỉ đọc": cho phép `[cd <thư mục trong workspace> &&] git <lệnh đọc> [| head …]`.
 * Trả lý do chặn hoặc undefined.
 */
export function gitReadCommandReason(command: string, root: string): string | undefined {
  return gitReadShapeReason(command, true) ?? outsidePathReason(command, root);
}

/** Lệnh shell có đúng dạng "git chỉ đọc" (bỏ qua kiểm tra thư mục) — dùng để ghi log/KPI lượt Bash của Claude Code là `git_read`. */
export function isGitReadCommand(command: string): boolean {
  return !gitReadShapeReason(command, false);
}

function gitReadShapeReason(command: string, fileReads: boolean): string | undefined {
  const x = gitReadViolation(command, fileReads);
  if (!x) return undefined;
  return x.why ? `${x.why}. Lưu ý: ${GIT_READ_DENY}` : GIT_READ_DENY;
}

// ── Phân loại lệnh shell: đọc / ghi / khác (giới hạn khảo sát, KPI) ─────────

const SHELL_READ_HEAD = /^(cat|type|more|less|head|tail|grep|egrep|rg|ag|ack|awk|sed|nl|wc|ls|dir|find|tree|stat|file|Get-Content|gc|Select-String|sls|Get-ChildItem|gci|findstr)\b/i;

/** Quy tắc cũ (không xét nháy) — chỉ dùng khi bộ tách dừng sớm nên không xem hết lệnh. */
function legacyShellWrites(cmd: string): boolean {
  const c = cmd.replace(/\d?>&\d/g, '').replace(/\d?>\s*\/dev\/null/g, '').replace(/2>\s*\$null/gi, '');
  return /(^|[^<>=!])>{1,2}\s*[^\s&|>]/.test(c) || /\bsed\s+(-[a-zA-Z]*i|--in-place)/.test(c) || /\btee\b/.test(c) || /<<-?\s*['"]?\w+/.test(c) || /\b(Set-Content|Add-Content|Out-File|New-Item)\b/i.test(c);
}

/** Lệnh shell ghi tệp: chuyển hướng ra tệp (ngoài nháy), sed -i, tee, heredoc, Set-Content/Out-File… */
export function shellWrites(cmd: string): boolean {
  const p = shellParse(cmd);
  if (p.bad) return p.bad.cmd === '>' || p.bad.cmd === '<<' ? true : legacyShellWrites(cmd);
  for (const segs of p.stmts)
    for (const seg of segs) {
      const argv = splitArgs(seg);
      if (!argv?.length) continue;
      const name = argv[0].toLowerCase();
      if (name === 'tee' || /^(set-content|add-content|out-file|new-item)$/.test(name)) return true;
      if (name === 'sed' && argv.some((x) => /^-[a-zA-Z]*i/.test(x) || x === '--in-place' || x.startsWith('--in-place='))) return true;
    }
  return false;
}

/** Lệnh chỉ để đọc/tìm/liệt kê (mọi câu lệnh, bỏ qua cd, echo/printf/pwd/true) — git đọc cũng tính là đọc. */
export function shellReadsOnly(cmd: string): boolean {
  if (shellWrites(cmd)) return false;
  const p = shellParse(cmd);
  if (p.bad) return false;
  let any = false;
  for (const segs of p.stmts) {
    const first = segs[0].trim();
    const argv = splitArgs(first);
    const name = argv?.[0]?.toLowerCase() ?? '';
    if (!first || /^(cd|Set-Location|sl|pushd|popd)\b/i.test(first) || NEUTRAL_CMD.has(name)) continue;
    any = true;
    if (argv?.[0] === 'git' && !gitReadArgsReason(argv.slice(1))) continue;
    if (!SHELL_READ_HEAD.test(first)) return false;
  }
  return any;
}

/** Loại thao tác của một lượt gọi công cụ (tên kiểu Claude Code hoặc CCoding). */
export function toolKind(name: string, input: Record<string, unknown> = {}): 'read' | 'write' | 'other' {
  if (/^(Read|Grep|Glob|LS|read_file|search|list_files|git_read)$/.test(name)) return 'read';
  if (/^(Write|Edit|MultiEdit|NotebookEdit|write_file|edit_file)$/.test(name)) return 'write';
  if (/^(Bash|PowerShell|run_command)$/.test(name)) {
    const cmd = String(input.command ?? '');
    if (shellWrites(cmd)) return 'write';
    return shellReadsOnly(cmd) ? 'read' : 'other';
  }
  return 'other';
}

// ── Chẩn đoán chặn (B-06) ─────────────────────────────────────────────────────

const RULE_TEXT: Record<string, string> = {
  'not-read-only': 'không phải lệnh chỉ đọc — đọc/tìm bằng Read/Grep/Glob; lệnh test/build thì ghi vào bàn giao',
  redirect: 'chuyển hướng ghi tệp — ghi bằng Write/Edit',
  subst: 'thay thế lệnh $(…)/backtick — viết lệnh tường minh, từng bước',
  heredoc: 'heredoc — ghi tệp bằng Write/Edit',
  loop: 'vòng lặp/cấu trúc điều khiển — dùng Grep/Glob thay cho for/while',
  interpreter: 'không phải lệnh chỉ đọc (chạy mã) — đọc/tìm bằng Read/Grep/Glob; vai trò này không chạy python/node…',
  'env-file': 'tệp .env là bí mật — không đọc/ghi',
  'outside-root': 'ngoài thư mục làm việc — chỉ thao tác trong workspace của nhiệm vụ',
  'deny-list': 'khớp danh sách lệnh cấm của dự án',
  'git-branch': 'không được tạo/chuyển nhánh, rebase, reset --hard hay push',
};

/** Chỉ giữ tên lệnh hoặc toán tử (không chép tham số/bí mật): tên an toàn tối đa 24 ký tự, không giống khóa/token; ngoài ra thay bằng `?`. */
export function safeCmdName(cmd: string): string {
  const c = cmd.trim();
  if (!c) return '';
  if (/^(&&|\|\||;|\||>|>>|<|<<|&|\$\(|`)$/.test(c)) return c;
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,23}$/.test(c)) return '?';
  return /^(sk|gh[pousr]|github_pat|AKIA|AIza|xox[abprs])[-_A-Za-z0-9]{12,}/.test(c) ? '?' : c;
}

/** Thông báo chặn theo câu lệnh con: "CCoding chặn câu N: `cmd` <quy tắc> — <gợi ý>", tối đa 300 ký tự, không chứa nội dung lệnh ngoài tên lệnh/toán tử. */
export function blockMessage(v: { clause: number; rule: string; cmd: string }): string {
  const cmd = safeCmdName(v.cmd);
  const msg = `CCoding chặn câu ${v.clause}:${cmd ? ` \`${cmd}\`` : ''} ${RULE_TEXT[v.rule] ?? v.rule}`;
  return msg.length <= 300 ? msg : `${msg.slice(0, 299)}…`;
}
