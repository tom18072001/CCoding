/**
 * K2 (D13): dọn data/logs/ theo chính sách giữ log và niêm phong tệp log đã xoay vòng bằng sổ băm.
 *
 * Phạm vi: chỉ tệp dưới data/logs/ đã xoay vòng (tên có hậu tố xoay vòng, xem isRotatedLog). Tệp đang ghi
 * (system.jsonl, agents/*.jsonl, departments/*.jsonl) không bao giờ bị đụng. Sổ seal-ledger.jsonl không bao giờ bị dọn.
 *
 * Sàn thời hạn (hằng số, cấu hình chỉ nâng được, không hạ được — AGENTS.md "Data Protection Gate"):
 *   183 ngày — nhật ký xử lý dữ liệu (tên chứa "processing")
 *   365 ngày — events, calls, audit, sandbox.deny, selfimprove.*, incident.* và mọi loại không xác định được
 *
 * Sổ niêm phong data/logs/seal-ledger.jsonl (chỉ ghi thêm, mỗi dòng một JSON):
 *   {file, sha256, size, sealedAt, prevHash, hash[, action:'purged']}
 *   hash = sha256(prevHash + JSON.stringify({file, sha256, size, sealedAt, prevHash[, action]})); dòng đầu có prevHash 'genesis'.
 *   Dòng action:'purged' ghi nhận tệp đã bị dọn hợp lệ (sổ vẫn giữ băm làm dấu vết); tệp mất mà không có dòng này ⇒ verify-seal báo lỗi.
 *
 * Kiểm: `ccoding logs verify-seal` (exit 0 = nguyên vẹn, 2 = tệp bị sửa / mất / chuỗi sổ đứt). Niêm phong tay: `ccoding logs seal`.
 *
 * KÝ SỐ (chưa bật, module này KHÔNG tạo khóa): khi có khóa, dùng ed25519 qua node:crypto —
 *   crypto.generateKeyPairSync('ed25519') một lần, ngoài repo; khóa riêng lưu NGOÀI data/ (kho khóa hoặc thư mục chỉ chủ sở hữu đọc được);
 *   crypto.sign(null, Buffer.from(hash), privateKey) cho `hash` của từng dòng sổ, hoặc ký một lần mỗi ngày trên hash dòng cuối của sổ;
 *   lưu chữ ký (base64) vào tệp riêng data/logs/seal-signatures.jsonl; xác minh bằng crypto.verify với khóa công khai.
 *   Muốn bằng chứng về thời điểm, gửi hash dòng cuối cho dịch vụ đóng dấu thời gian (TSA, RFC 3161) và lưu phản hồi cùng chữ ký.
 *   Cho tới khi có khóa, mức bất biến là "băm + sổ chỉ ghi thêm" (mức Nâng cao chưa đạt: chưa WORM thật, chưa ký số).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LogStore } from './logger.js';

export const DAY_MS = 86_400_000;
export const FLOOR_PROCESSING_DAYS = 183;
export const FLOOR_ACCESS_DAYS = 365;
export const SEAL_LEDGER = 'seal-ledger.jsonl';

export interface RetentionCfg { enabled: boolean; days: number; intervalHours: number }
export interface LedgerEntry { file: string; sha256: string; size: number; sealedAt: string; prevHash: string; hash: string; action?: 'purged' }
export interface SealVerify { ok: boolean; entries: number; problems: string[] }

const logsDir = (dataDir: string): string => path.join(dataDir, 'logs');
export const ledgerPath = (dataDir: string): string => path.join(logsDir(dataDir), SEAL_LEDGER);

/** Tệp đã xoay vòng: system.jsonl.1, x.jsonl.gz, x.2026-10-01.jsonl, x.20261001T0000.jsonl. Tệp đang ghi (x.jsonl) và sổ thì không. */
export function isRotatedLog(rel: string): boolean {
  const base = path.posix.basename(rel);
  if (base === SEAL_LEDGER) return false;
  return /\.jsonl\.[^./]+(\.[^./]+)*$/.test(base) || /\.\d{4}-?\d{2}-?\d{2}[^/]*\.jsonl$/.test(base);
}

/** Sàn thời hạn theo loại log (theo tên tệp). Không xác định được ⇒ 365. */
export function floorDays(rel: string): number {
  return /processing/i.test(path.posix.basename(rel)) ? FLOOR_PROCESSING_DAYS : FLOOR_ACCESS_DAYS;
}

export function effectiveDays(rel: string, cfgDays: number): number {
  const want = Number.isFinite(cfgDays) ? cfgDays : 0;
  return Math.max(floorDays(rel), want);
}

function sha256File(file: string): string {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 16);
    for (let n = fs.readSync(fd, buf, 0, buf.length, null); n > 0; n = fs.readSync(fd, buf, 0, buf.length, null)) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function entryBody(e: Omit<LedgerEntry, 'hash'>): Record<string, unknown> {
  return { file: e.file, sha256: e.sha256, size: e.size, sealedAt: e.sealedAt, prevHash: e.prevHash, ...(e.action ? { action: e.action } : {}) };
}

function entryHash(e: Omit<LedgerEntry, 'hash'>): string {
  return crypto.createHash('sha256').update(e.prevHash).update(JSON.stringify(entryBody(e))).digest('hex');
}

function readLedger(dataDir: string): { entries: LedgerEntry[]; problems: string[] } {
  const p = ledgerPath(dataDir);
  const entries: LedgerEntry[] = [];
  const problems: string[] = [];
  if (!fs.existsSync(p)) return { entries, problems };
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
  let prev = 'genesis';
  lines.forEach((l, i) => {
    let e: LedgerEntry;
    try {
      e = JSON.parse(l) as LedgerEntry;
    } catch {
      problems.push(`Sổ niêm phong: dòng ${i + 1} không phải JSON`);
      prev = '';
      return;
    }
    if (e.prevHash !== prev) problems.push(`Sổ niêm phong: chuỗi đứt ở dòng ${i + 1} (prevHash không khớp)`);
    else if (entryHash(e) !== e.hash) problems.push(`Sổ niêm phong: dòng ${i + 1} bị sửa (hash sai)`);
    prev = e.hash;
    entries.push(e);
  });
  return { entries, problems };
}

function appendLedger(dataDir: string, e: Omit<LedgerEntry, 'prevHash' | 'hash'>): LedgerEntry {
  const { entries } = readLedger(dataDir);
  const prevHash = entries.length ? entries[entries.length - 1]!.hash : 'genesis';
  const base = { ...e, prevHash };
  const full: LedgerEntry = { ...base, hash: entryHash(base) };
  fs.mkdirSync(logsDir(dataDir), { recursive: true });
  fs.appendFileSync(ledgerPath(dataDir), `${JSON.stringify({ ...entryBody(full), hash: full.hash })}\n`, 'utf8');
  return full;
}

/** Các tệp log đã xoay vòng (đường dẫn tương đối so với data/logs/, dấu '/'). Không theo liên kết. */
export function listRotated(dataDir: string): string[] {
  const root = logsDir(dataDir);
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(f);
      else if (e.isFile()) {
        const rel = path.relative(root, f).split(path.sep).join('/');
        if (isRotatedLog(rel)) out.push(rel);
      }
    }
  };
  visit(root);
  return out.sort();
}

/** Niêm phong các tệp đã xoay vòng chưa có trong sổ. Chạy lại không nhân bản. Trả danh sách tệp vừa niêm phong. */
export function sealRotated(dataDir: string, now = Date.now()): string[] {
  const { entries } = readLedger(dataDir);
  const sealed = new Set(entries.filter((e) => !e.action).map((e) => e.file));
  const done: string[] = [];
  for (const rel of listRotated(dataDir)) {
    if (sealed.has(rel)) continue;
    const f = path.join(logsDir(dataDir), ...rel.split('/'));
    appendLedger(dataDir, { file: rel, sha256: sha256File(f), size: fs.statSync(f).size, sealedAt: new Date(now).toISOString() });
    done.push(rel);
  }
  return done;
}

/** Kiểm sổ và tệp: tệp bị sửa, tệp mất không có dòng purged, chuỗi sổ đứt. */
export function verifySeal(dataDir: string): SealVerify {
  const { entries, problems } = readLedger(dataDir);
  const purged = new Set(entries.filter((e) => e.action === 'purged').map((e) => e.file));
  for (const e of entries) {
    if (e.action) continue;
    const f = path.join(logsDir(dataDir), ...e.file.split('/'));
    if (!fs.existsSync(f)) {
      if (!purged.has(e.file)) problems.push(`Tệp đã niêm phong bị mất: ${e.file}`);
    } else if (fs.statSync(f).size !== e.size || sha256File(f) !== e.sha256) {
      problems.push(`Tệp đã niêm phong bị sửa: ${e.file}`);
    }
  }
  return { ok: problems.length === 0, entries: entries.length, problems };
}

/**
 * Xóa tệp xoay vòng quá hạn (theo mtime). Điều kiện bắt buộc: có trong sổ, băm khớp, chuỗi sổ nguyên vẹn.
 * Không đạt ⇒ không xóa, ghi cảnh báo qua LogStore (chỉ tên tương đối, không nội dung).
 */
export function purgeLogs(dataDir: string, cfgDays: number, logs: Pick<LogStore, 'write'>, now = Date.now()): string[] {
  const { entries, problems } = readLedger(dataDir);
  const removed: string[] = [];
  const warn = (msg: string, data?: Record<string, unknown>): void => {
    logs.write({ level: 'warn', kind: 'logs.retention.skipped', msg, data });
  };
  if (problems.length) {
    warn('Sổ niêm phong không nguyên vẹn — không dọn log', { problems: problems.length });
    return removed;
  }
  const byFile = new Map(entries.filter((e) => !e.action).map((e) => [e.file, e]));
  for (const rel of listRotated(dataDir)) {
    const f = path.join(logsDir(dataDir), ...rel.split('/'));
    if (now - fs.statSync(f).mtimeMs <= effectiveDays(rel, cfgDays) * DAY_MS) continue;
    const e = byFile.get(rel);
    if (!e) {
      warn(`Log quá hạn nhưng chưa niêm phong: ${rel}`, { file: rel });
      continue;
    }
    if (fs.statSync(f).size !== e.size || sha256File(f) !== e.sha256) {
      warn(`Log quá hạn nhưng băm không khớp sổ: ${rel}`, { file: rel });
      continue;
    }
    fs.rmSync(f);
    appendLedger(dataDir, { file: rel, sha256: e.sha256, size: e.size, sealedAt: new Date(now).toISOString(), action: 'purged' });
    removed.push(rel);
  }
  return removed;
}

/** Một lượt định kỳ: niêm phong rồi dọn. Công tắc tắt ⇒ trả null, không làm gì. */
export function runLogRetention(deps: { cfg: RetentionCfg; logs: Pick<LogStore, 'write'>; dataDir: string }, now = Date.now()): { sealed: number; purged: number } | null {
  if (!deps.cfg.enabled) return null;
  const want = Number(deps.cfg.days);
  if (want > 0 && want < FLOOR_ACCESS_DAYS) {
    deps.logs.write({ level: 'warn', kind: 'logs.retention.clamped', msg: `logs.retention.days dưới sàn; dùng tối thiểu ${FLOOR_PROCESSING_DAYS}/${FLOOR_ACCESS_DAYS} ngày theo loại log` });
  }
  const sealed = sealRotated(deps.dataDir, now).length;
  const purged = purgeLogs(deps.dataDir, want, deps.logs, now).length;
  deps.logs.write({ level: 'info', kind: 'logs.retention.run', msg: `Log: niêm phong ${sealed} tệp, dọn ${purged} tệp quá hạn`, data: { sealed, purged } });
  return { sealed, purged };
}
