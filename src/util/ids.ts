import crypto from 'node:crypto';

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** T-20261026-203501-a1b — dễ đọc, sắp xếp được theo thời gian. */
export function newTaskId(d = new Date()): string {
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `T-${stamp}-${crypto.randomBytes(2).toString('hex').slice(0, 3)}`;
}

export function shortId(prefix = ''): string {
  return `${prefix}${crypto.randomBytes(4).toString('hex')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
