// Chính sách lệnh shell dùng chung cho vòng công cụ của CCoding (run_command, git_read) và hook claude-guard của runtime claude-cli:
// - giữ lệnh trong thư mục làm việc của nhiệm vụ (không đọc/ghi đường dẫn tuyệt đối hay "../" ra ngoài — vd. thư mục dữ liệu thật trên máy);
// - "git chỉ đọc" cho vai trò không có quyền chạy lệnh (xem lịch sử commit, diff, blame) — không chạy test/build/lệnh khác.
import os from 'node:os';
import path from 'node:path';

const WIN_ABS = /^[A-Za-z]:[\\/]/;
const isWinAbs = (p: string) => WIN_ABS.test(p) || /^\\\\[^\\]/.test(p);

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
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
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

/** Bộ lọc đầu ra được phép sau `|` trong lệnh git chỉ đọc qua shell. */
const PIPE_FILTER = /^(head|tail|grep|egrep|wc|sort|uniq|cut|nl|tr|od|Select-Object|select|Select-String|sls|Measure-Object)\b[^$`<>]*$/i;

/**
 * Lệnh chỉ ĐỌC tệp được phép kèm git chỉ đọc (vai trò không có quyền chạy lệnh vẫn có Read/Grep/Glob — các lệnh này không cho thêm quyền,
 * chỉ bớt lượt bị chặn khi agent quen tay `cat`/`ls`/`sed -n`). Loại tùy chọn chạy chương trình hay ghi tệp (find -exec/-delete/-fprint, rg --pre…).
 */
const READ_CMD = /^(cat|head|tail|ls|wc|grep|egrep|nl|tree|stat|file|od|sort|uniq|cut|diff|cmp|find|rg|Get-Content|gc|Select-String|sls|Get-ChildItem|gci)\b/i;
const READ_CMD_FORBIDDEN = /\s-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)\b|\s--pre(-glob)?\b|\s-Path\s+\S+\s+-Value\b/i;
const SED_PRINT = /^sed\s+-n\s+(['"]?)\d+(,(\d+|\$))?p\1(\s|$)/;

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

/** `fileReads`: chấp nhận thêm lệnh chỉ đọc tệp (cat/head/ls/grep/sed -n 'a,bp'…) — chế độ shell chỉ đọc của hook. */
function gitReadShapeReason(command: string, fileReads: boolean): string | undefined {
  const deny = 'bạn chỉ được chạy lệnh CHỈ ĐỌC: git (log/show/diff/blame/status/grep/ls-files…) và đọc tệp (cat/head/tail/ls/grep/sed -n …), nối bằng `&&`, lọc qua `| head`/`| grep` — không có quyền chạy test, build, cài đặt, ghi tệp qua shell hay lệnh khác; lệnh cần chạy thì ghi rõ trong bàn giao để người có quyền chạy';
  const cleaned = command.replace(/\s2>&1\b/g, ' ').replace(/\s2>\s*\/dev\/null\b/g, ' ').trim();
  if (/\$\(|`|[<>]|\r|\n|\|\|/.test(cleaned)) return deny;
  const stmts = cleaned.split(/&&|;/).map((s) => s.trim()).filter(Boolean);
  let gitSeen = false;
  // chạy thật 1/11: agent hay gộp `cd <worktree> && git branch --show-current && git log -2 && git ls-files` thành một lệnh —
  // cho mọi câu lệnh là `cd` (thư mục do outsidePathReason kiểm) hoặc git chỉ đọc
  for (const stmt of stmts) {
    if (/^(cd|Set-Location|sl)\s+/i.test(stmt)) continue;
    const [head, ...pipes] = stmt.split('|').map((s) => s.trim());
    if (pipes.some((p) => !PIPE_FILTER.test(p))) return deny;
    const argv = splitArgs(head);
    if (!argv) return deny;
    if (argv[0] === 'git') {
      const why = gitReadArgsReason(argv.slice(1));
      if (why) return `${why}. Lưu ý: ${deny}`;
    } else if (!fileReads || shellWrites(head) || !((READ_CMD.test(head) && !READ_CMD_FORBIDDEN.test(` ${head}`)) || SED_PRINT.test(head))) return deny;
    gitSeen = true;
  }
  if (!gitSeen) return deny;
  return undefined;
}

// ── Phân loại lệnh shell: đọc / ghi / khác (giới hạn khảo sát, KPI) ─────────

const SHELL_READ_HEAD = /^(cat|type|more|less|head|tail|grep|egrep|rg|ag|ack|awk|sed|nl|wc|ls|dir|find|tree|stat|file|Get-Content|gc|Select-String|sls|Get-ChildItem|gci|findstr)\b/i;

/** Lệnh shell ghi tệp: chuyển hướng ra tệp, sed -i, tee, heredoc, Set-Content/Out-File… */
export function shellWrites(cmd: string): boolean {
  const c = cmd.replace(/\d?>&\d/g, '').replace(/\d?>\s*\/dev\/null/g, '').replace(/2>\s*\$null/gi, '');
  return /(^|[^<>=!])>{1,2}\s*[^\s&|>]/.test(c) || /\bsed\s+(-[a-zA-Z]*i|--in-place)/.test(c) || /\btee\b/.test(c) || /<<-?\s*['"]?\w+/.test(c) || /\b(Set-Content|Add-Content|Out-File|New-Item)\b/i.test(c);
}

/** Lệnh chỉ để đọc/tìm/liệt kê (mọi câu lệnh, bỏ qua cd) — git đọc cũng tính là đọc. */
export function shellReadsOnly(cmd: string): boolean {
  if (shellWrites(cmd)) return false;
  let any = false;
  for (const raw of cmd.split(/&&|\|\||;|\r?\n/)) {
    const first = raw.split('|')[0].trim();
    if (!first || /^(cd|Set-Location|sl|pushd|popd)\b/i.test(first)) continue;
    any = true;
    const argv = splitArgs(first);
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
