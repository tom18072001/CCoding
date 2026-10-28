import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWin = process.platform === 'win32';

export interface Resolved {
  file: string;
  viaShell: boolean;
}

/** Tìm file thực thi trong PATH (tự xử lý PATHEXT/.cmd trên Windows). */
export function resolveCommand(cmd: string): Resolved | null {
  const exts = isWin ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase()) : [''];
  const check = (p: string): Resolved | null => {
    for (const ext of isWin ? ['', ...exts] : ['']) {
      const f = p + ext;
      try {
        if (fs.statSync(f).isFile()) {
          if (isWin && ext === '' && !exts.includes(path.extname(f).toLowerCase())) continue;
          return { file: f, viaShell: isWin && /\.(cmd|bat)$/i.test(f) };
        }
      } catch {
        /* không có */
      }
    }
    return null;
  };
  if (cmd.includes('/') || cmd.includes('\\')) return check(path.resolve(cmd));
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
  if (isWin) {
    const home = process.env.USERPROFILE ?? '';
    dirs.push(path.join(home, '.local', 'bin'), path.join(process.env.APPDATA ?? '', 'npm'));
  } else {
    dirs.push(path.join(process.env.HOME ?? '', '.local', 'bin'));
  }
  for (const d of dirs) {
    const r = check(path.join(d, cmd));
    if (r) return r;
  }
  return null;
}

function quoteWin(a: string): string {
  if (a === '') return '""';
  if (!/[\s"&|<>^%]/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export interface ProcOptions {
  cmd: string;
  args: string[];
  cwd: string;
  stdin?: string;
  env?: NodeJS.ProcessEnv;
  /** true: dùng đúng `env` (không trộn process.env) — để bỏ được biến khóa/token. */
  replaceEnv?: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

export function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (isWin) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* đã thoát */
    }
  }
}

/** Chạy tiến trình con, đọc stdout theo dòng (cho các CLI stream-json). */
export function runProcess(o: ProcOptions): Promise<ProcResult> {
  const resolved = resolveCommand(o.cmd);
  if (!resolved) return Promise.reject(new Error(`Không tìm thấy lệnh "${o.cmd}" trong PATH`));
  const file = resolved.viaShell ? process.env.ComSpec ?? 'cmd.exe' : resolved.file;
  const args = resolved.viaShell
    ? ['/d', '/s', '/c', `"${[quoteWin(resolved.file), ...o.args.map(quoteWin)].join(' ')}"`]
    : o.args;

  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: o.cwd,
      env: o.replaceEnv ? { ...o.env } : { ...process.env, ...o.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: resolved.viaShell,
      detached: !isWin,
    });
    let stdout = '';
    let stderr = '';
    let buf = '';
    let timedOut = false;
    let aborted = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, o.timeoutMs);
    const onAbort = () => {
      aborted = true;
      killTree(child.pid);
    };
    o.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim()) o.onLine?.(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => {
      stderr += d;
      o.onStderr?.(d);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      if (buf.trim()) o.onLine?.(buf.trim());
      resolve({ code, stdout, stderr, timedOut, aborted });
    });
    if (o.stdin !== undefined) child.stdin.end(o.stdin, 'utf8');
    else child.stdin.end();
  });
}

/** Chạy lệnh ngắn và lấy stdout (dùng cho kiểm tra phiên bản). */
export async function quickRun(cmd: string, args: string[], timeoutMs = 15000): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await runProcess({ cmd, args, cwd: process.cwd(), timeoutMs });
    return { ok: r.code === 0, out: (r.stdout || r.stderr).trim() };
  } catch (e) {
    return { ok: false, out: (e as Error).message };
  }
}
