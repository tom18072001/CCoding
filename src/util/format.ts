// Định dạng đầu ra terminal: bảng, số, màu ANSI.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const code = (n: number) => (s: string) => (useColor ? `\x1b[${n}m${s}\x1b[0m` : s);
export const c = {
  bold: code(1),
  dim: code(2),
  red: code(31),
  green: code(32),
  yellow: code(33),
  blue: code(34),
  magenta: code(35),
  cyan: code(36),
  gray: code(90),
};

export function hexColor(hex: string, s: string): string {
  if (!useColor) return s;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return s;
  const n = parseInt(m[1], 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${s}\x1b[0m`;
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

export function fmtUsd(n: number): string {
  return n > 0 ? `$${n.toFixed(n < 1 ? 4 : 2)}` : '—';
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const visibleLen = (s: string) => [...s.replace(ANSI, '')].length;

export function table(headers: string[], rows: string[][], align: Array<'l' | 'r'> = []): string {
  const widths = headers.map((h, i) => Math.max(visibleLen(h), ...rows.map((r) => visibleLen(r[i] ?? ''))));
  const cell = (s: string, i: number) => {
    const pad = ' '.repeat(Math.max(0, widths[i] - visibleLen(s)));
    return align[i] === 'r' ? pad + s : s + pad;
  };
  const line = (r: string[]) => r.map(cell).join('  ');
  const sep = widths.map((w) => '─'.repeat(w)).join('  ');
  return [c.bold(line(headers)), c.gray(sep), ...rows.map(line)].join('\n');
}
