import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJsonAtomic(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows có thể khóa file đích ngắn hạn: ghi đè trực tiếp
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
    fs.rmSync(tmp, { force: true });
  }
}

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as T;
  } catch {
    return fallback;
  }
}

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

/** Đọc N dòng cuối của file JSONL mà không nạp cả file lớn vào bộ nhớ. */
export function tailLines(file: string, limit: number, maxBytes = 4 * 1024 * 1024): string[] {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const size = stat.size;
  if (size === 0) return [];
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    return limit > 0 ? lines.slice(-limit) : lines;
  } finally {
    fs.closeSync(fd);
  }
}

export function readJsonl<T>(file: string, limit = 0): T[] {
  const out: T[] = [];
  for (const line of tailLines(file, limit, limit > 0 ? 4 * 1024 * 1024 : Number.MAX_SAFE_INTEGER)) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* bỏ qua dòng hỏng */
    }
  }
  return out;
}

export type JsonlCache<T> = Map<string, { size: number; ino: number; mtimeMs: number; rows: T[] }>;

/**
 * Đọc file JSONL chỉ-ghi-thêm theo từng khối 1 MB (không nạp cả file vào một chuỗi — calls.jsonl có thể rất lớn), chỉ giữ
 * phần `pick` trả về. Có `cache` thì lần sau chỉ đọc phần mới ghi thêm (file bị thay/thu nhỏ → đọc lại từ đầu); dòng cuối
 * chưa có xuống dòng (đang ghi dở) để lần sau.
 */
export function scanJsonl<T>(file: string, pick: (o: Record<string, unknown>) => T | undefined, cache?: JsonlCache<T>): T[] {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st) {
    cache?.delete(file);
    return [];
  }
  let c = cache?.get(file);
  if (!c || c.ino !== st.ino || st.size < c.size || (st.size === c.size && st.mtimeMs !== c.mtimeMs)) c = { size: 0, ino: st.ino, mtimeMs: 0, rows: [] };
  if (st.size > c.size) {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(1 << 20);
      let pos = c.size;
      let parts: Buffer[] = [];
      while (pos < st.size) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, st.size - pos), pos);
        if (n <= 0) break;
        let from = 0;
        for (let nl = buf.indexOf(10, 0); nl !== -1 && nl < n; nl = buf.indexOf(10, from)) {
          parts.push(Buffer.from(buf.subarray(from, nl)));
          const line = (parts.length === 1 ? parts[0] : Buffer.concat(parts)).toString('utf8').trim();
          parts = [];
          from = nl + 1;
          c.size = pos + from;
          if (!line) continue;
          try {
            const v = pick(JSON.parse(line) as Record<string, unknown>);
            if (v !== undefined) c.rows.push(v);
          } catch {
            /* bỏ qua dòng hỏng */
          }
        }
        if (from < n) parts.push(Buffer.from(buf.subarray(from, n)));
        pos += n;
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  c.mtimeMs = st.mtimeMs;
  if (cache) {
    cache.delete(file);
    cache.set(file, c);
    while (cache.size > 64) cache.delete(cache.keys().next().value as string);
  }
  return c.rows;
}

/** Tên file an toàn trên cả Windows lẫn Linux. */
export function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x';
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[đã cắt ${text.length - max} ký tự]`;
}
