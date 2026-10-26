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

/** Tên file an toàn trên cả Windows lẫn Linux. */
export function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x';
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[đã cắt ${text.length - max} ký tự]`;
}
