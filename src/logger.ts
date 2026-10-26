import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDir, readJsonl, safeName, tailLines } from './util/fsx.js';
import { redactDeep } from './util/redact.js';
import type { EventBus } from './events.js';
import type { LogEntry } from './types.js';

/**
 * Ghi log JSONL append-only, có chuỗi băm (hash chain) để phát hiện chỉnh sửa (DET-05).
 *
 * Mỗi sự kiện được ghi vào:
 *   data/logs/system.jsonl                  — toàn hệ thống
 *   data/logs/agents/<agentId>.jsonl        — log riêng từng vị trí (agent)
 *   data/logs/departments/<dept>.jsonl      — log từng phòng ban
 *   data/runs/<taskId>/events.jsonl         — log từng nhiệm vụ
 */
export class LogStore {
  private lastHash = new Map<string, { seq: number; hash: string }>();

  constructor(
    private dataDir: string,
    private opts: { redactSecrets: boolean; redactPii: boolean; hashChain: boolean },
    private bus?: EventBus,
  ) {
    ensureDir(path.join(dataDir, 'logs', 'agents'));
    ensureDir(path.join(dataDir, 'logs', 'departments'));
  }

  fileFor(scope: 'system' | 'agent' | 'department' | 'task', id?: string): string {
    switch (scope) {
      case 'agent':
        return path.join(this.dataDir, 'logs', 'agents', `${safeName(id!)}.jsonl`);
      case 'department':
        return path.join(this.dataDir, 'logs', 'departments', `${safeName(id!)}.jsonl`);
      case 'task':
        return path.join(this.dataDir, 'runs', safeName(id!), 'events.jsonl');
      default:
        return path.join(this.dataDir, 'logs', 'system.jsonl');
    }
  }

  write(entry: Omit<LogEntry, 'ts'> & { ts?: string }): LogEntry {
    const full = redactDeep(
      { ts: entry.ts ?? new Date().toISOString(), ...entry } as LogEntry,
      { secrets: this.opts.redactSecrets, pii: this.opts.redactPii },
    );
    const targets = [this.fileFor('system')];
    if (full.agentId) targets.push(this.fileFor('agent', full.agentId));
    if (full.department) targets.push(this.fileFor('department', full.department));
    if (full.taskId) targets.push(this.fileFor('task', full.taskId));
    for (const f of targets) this.append(f, full);
    this.bus?.publish({ type: 'log', entry: full });
    return full;
  }

  /** Ghi bản ghi đã che bí mật/PII (dùng cho bản ghi lượt gọi đầy đủ: data/runs/<task>/calls.jsonl). */
  record(file: string, record: object): void {
    this.append(file, redactDeep(record as Record<string, unknown>, { secrets: this.opts.redactSecrets, pii: this.opts.redactPii }));
  }

  /** Ghi một bản ghi vào file JSONL bất kỳ, giữ chuỗi băm riêng của file đó. */
  append(file: string, record: object): void {
    let line: string;
    if (this.opts.hashChain) {
      const prev = this.chainHead(file);
      const seq = prev.seq + 1;
      const body = JSON.stringify({ ...record, seq, prev: prev.hash });
      const hash = crypto.createHash('sha256').update(prev.hash).update(body).digest('hex').slice(0, 32);
      line = `${body.slice(0, -1)},"hash":"${hash}"}`;
      this.lastHash.set(file, { seq, hash });
    } else {
      line = JSON.stringify(record);
    }
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, `${line}\n`, 'utf8');
  }

  private chainHead(file: string): { seq: number; hash: string } {
    const cached = this.lastHash.get(file);
    if (cached) return cached;
    const last = tailLines(file, 1)[0];
    let head = { seq: 0, hash: 'genesis' };
    if (last) {
      try {
        const o = JSON.parse(last) as { seq?: number; hash?: string };
        if (o.hash && typeof o.seq === 'number') head = { seq: o.seq, hash: o.hash };
      } catch {
        /* dòng cuối hỏng: bắt đầu chuỗi mới */
      }
    }
    this.lastHash.set(file, head);
    return head;
  }

  query(filter: { agent?: string; department?: string; task?: string; limit?: number; level?: string }): LogEntry[] {
    const file = filter.task
      ? this.fileFor('task', filter.task)
      : filter.agent
        ? this.fileFor('agent', filter.agent)
        : filter.department
          ? this.fileFor('department', filter.department)
          : this.fileFor('system');
    const limit = filter.limit ?? 200;
    let rows = readJsonl<LogEntry>(file, filter.agent || filter.department || filter.task ? limit * 3 : limit * 2);
    if (filter.agent) rows = rows.filter((r) => r.agentId === filter.agent);
    if (filter.department) rows = rows.filter((r) => r.department === filter.department);
    if (filter.level) rows = rows.filter((r) => r.level === filter.level);
    return rows.slice(-limit);
  }
}

/** Kiểm tra chuỗi băm của một file log. Trả về số dòng hợp lệ và vị trí lỗi đầu tiên (nếu có). */
export function verifyChain(file: string): { ok: boolean; lines: number; brokenAt?: number; reason?: string } {
  if (!fs.existsSync(file)) return { ok: true, lines: 0 };
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  let prev = 'genesis';
  let expectedSeq: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      return { ok: false, lines: lines.length, brokenAt: i + 1, reason: 'JSON hỏng' };
    }
    const { hash, ...rest } = o;
    if (typeof hash !== 'string') return { ok: false, lines: lines.length, brokenAt: i + 1, reason: 'thiếu hash' };
    if (rest.prev !== prev) return { ok: false, lines: lines.length, brokenAt: i + 1, reason: 'prev không khớp dòng trước' };
    if (expectedSeq !== undefined && rest.seq !== expectedSeq)
      return { ok: false, lines: lines.length, brokenAt: i + 1, reason: 'seq không liên tục' };
    const body = JSON.stringify(rest);
    const h = crypto.createHash('sha256').update(prev).update(body).digest('hex').slice(0, 32);
    if (h !== hash) return { ok: false, lines: lines.length, brokenAt: i + 1, reason: 'hash sai — nội dung đã bị sửa' };
    prev = hash;
    expectedSeq = (rest.seq as number) + 1;
  }
  return { ok: true, lines: lines.length };
}
