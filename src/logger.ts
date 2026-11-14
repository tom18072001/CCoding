import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
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
const KEY_ENV = 'CCODING_LOG_HMAC_KEY';
let warnedNoKey = false;

/** Chỉ dùng cho test: cho phép cảnh báo thiếu khóa phát lại. */
export function resetHmacWarning(): void {
  warnedNoKey = false;
}

/** Khóa ký log, chỉ đọc từ biến môi trường; không bao giờ ghi ra log/thông báo. */
function hmacKey(): string | undefined {
  const k = process.env[KEY_ENV];
  return k && k.length > 0 ? k : undefined;
}

/** kid: dấu vân tay ngắn suy từ HMAC(khóa, hằng) — không phải khóa, không suy ngược được khóa. */
function keyId(key: string): string {
  return crypto.createHmac('sha256', key).update('ccoding-log-kid-v1').digest('hex').slice(0, 8);
}

function signHash(key: string, hash: string): string {
  return crypto.createHmac('sha256', key).update(hash).digest('hex');
}

function warnNoKeyOnce(): void {
  if (warnedNoKey) return;
  warnedNoKey = true;
  process.stderr.write(
    `[cảnh báo] Chưa đặt ${KEY_ENV}: log vẫn có chuỗi băm nhưng KHÔNG ký HMAC, nên không chứng minh được toàn vẹn (xem docs/data-protection-assessment.md).
`,
  );
}

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
      const key = hmacKey();
      if (key) line = `${body.slice(0, -1)},"hash":"${hash}","kid":"${keyId(key)}","sig":"${signHash(key, hash)}"}`;
      else {
        warnNoKeyOnce();
        line = `${body.slice(0, -1)},"hash":"${hash}"}`;
      }
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

export interface ChainResult {
  ok: boolean;
  lines: number;
  brokenAt?: number;
  reason?: string;
}

/** Bộ kiểm chuỗi băm theo từng dòng (dùng chung cho bản đọc một lần và bản đọc luồng). */
function chainChecker() {
  let prev = 'genesis';
  let expectedSeq: number | undefined;
  let n = 0;
  let broken: { brokenAt: number; reason: string } | undefined;
  const key = hmacKey();
  const kid = key ? keyId(key) : undefined;
  let sawSigned = false; // đã gặp dòng có chữ ký: các dòng sau bắt buộc có ký
  return {
    line(l: string): void {
      if (!l.trim()) return;
      n++;
      if (broken) return; // vẫn đếm tổng số dòng
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(l);
      } catch {
        broken = { brokenAt: n, reason: 'JSON hỏng' };
        return;
      }
      const { hash, sig, kid: lineKid, ...rest } = o;
      if (typeof hash !== 'string') broken = { brokenAt: n, reason: 'thiếu hash' };
      else if (rest.prev !== prev) broken = { brokenAt: n, reason: 'prev không khớp dòng trước' };
      else if (expectedSeq !== undefined && rest.seq !== expectedSeq) broken = { brokenAt: n, reason: 'seq không liên tục' };
      else if (crypto.createHash('sha256').update(prev).update(JSON.stringify(rest)).digest('hex').slice(0, 32) !== hash) broken = { brokenAt: n, reason: 'hash sai — nội dung đã bị sửa' };
      else if (key && (sig !== undefined || sawSigned)) {
        if (typeof sig !== 'string' || lineKid !== kid) broken = { brokenAt: n, reason: 'khóa khác/không có khóa' };
        else if (signHash(key, hash) !== sig) broken = { brokenAt: n, reason: 'chữ ký sai' };
        else {
          sawSigned = true;
          prev = hash;
          expectedSeq = (rest.seq as number) + 1;
        }
      } else {
        if (sig !== undefined) sawSigned = true;
        prev = hash;
        expectedSeq = (rest.seq as number) + 1;
      }
    },
    result(): ChainResult {
      return broken ? { ok: false, lines: n, ...broken } : { ok: true, lines: n };
    },
  };
}

/** Kiểm tra chuỗi băm của một file log. Trả về số dòng hợp lệ và vị trí lỗi đầu tiên (nếu có). Đọc cả tệp một lần — dùng cho CLI. */
export function verifyChain(file: string): ChainResult {
  if (!fs.existsSync(file)) return { ok: true, lines: 0 };
  const c = chainChecker();
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) c.line(l);
  return c.result();
}

/** Như verifyChain nhưng đọc theo luồng từng dòng: không giữ cả tệp trong bộ nhớ, không chặn server với nhật ký lớn. */
export async function verifyChainStream(file: string): Promise<ChainResult> {
  if (!fs.existsSync(file)) return { ok: true, lines: 0 };
  const c = chainChecker();
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const l of rl) c.line(l);
  return c.result();
}
