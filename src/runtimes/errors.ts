import type { ErrorKind } from '../types.js';

/** Lỗi từ runtime kèm phân loại — bộ điều phối dựa vào đây để chuyển tài nguyên. */
export class RuntimeError extends Error {
  constructor(
    message: string,
    public kind: ErrorKind,
    public status?: number,
    /** Thời điểm (ms epoch) tài nguyên mở lại, nếu nhà cung cấp cho biết. */
    public retryAt?: number,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

const QUOTA_RE =
  /(usage limit|limit reached|quota|insufficient[_ ]?(quota|credit|balance|funds)|credit balance|out of credits|exceeded your|billing|exhausted|hết hạn mức|vượt hạn mức|weekly limit|monthly limit|daily limit|5-hour limit|plan limit)/i;
const RATE_RE = /(rate.?limit|too many requests|overloaded|slow down|try again later|capacity)/i;
const CONTEXT_RE = /(context (length|window)|maximum context|too many tokens|prompt is too long|input is too long|max_tokens.*exceed)/i;
const MODEL_RE = /(model[^\n]{0,40}(not found|does not exist|not supported|unavailable|invalid)|unknown model|no such model|no provider)/i;
const NET_RE = /(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|socket hang up|fetch failed|network|terminated|other side closed|connection (was )?(closed|reset|aborted)|UND_ERR|premature close|bad gateway|service unavailable|gateway timeout)/i;

/** Phân loại lỗi từ mã HTTP + nội dung thông báo. */
export function classifyError(status: number | undefined, text: string): ErrorKind {
  const t = text ?? '';
  if (status === 402) return 'quota';
  if (status === 401 || status === 403) return QUOTA_RE.test(t) ? 'quota' : 'auth';
  if (status === 429) return QUOTA_RE.test(t) && !/per minute|rpm|tpm/i.test(t) ? 'quota' : 'rate';
  if (status === 408) return 'timeout';
  if (status && status >= 500) {
    if (QUOTA_RE.test(t)) return 'quota';
    if (MODEL_RE.test(t)) return 'model';
    if (RATE_RE.test(t) && status === 529) return 'rate';
    return 'transient';
  }
  if (status === 400 || status === 404 || status === 422 || status === 413) {
    if (CONTEXT_RE.test(t) || status === 413) return 'context';
    if (MODEL_RE.test(t) || status === 404) return 'model';
    if (QUOTA_RE.test(t)) return 'quota';
    return 'fatal';
  }
  if (/TimeoutError|timed? ?out|hết thời gian/i.test(t)) return 'timeout';
  if (QUOTA_RE.test(t)) return 'quota';
  if (RATE_RE.test(t)) return 'rate';
  if (NET_RE.test(t)) return 'transient';
  if (CONTEXT_RE.test(t)) return 'context';
  return 'fatal';
}

/** Những loại lỗi nên thử sang runtime/model khác thay vì báo lỗi ngay (kể cả phản hồi rỗng từ nhà cung cấp). */
export function shouldFailover(kind: ErrorKind): boolean {
  return kind !== 'fatal';
}

/** Đọc thời điểm mở lại từ header Retry-After hoặc nội dung thông báo (vd. "usage limit reached|1730000000"). */
export function parseRetryAt(headers: Headers | undefined, text: string, now = Date.now()): number | undefined {
  const ra = headers?.get('retry-after');
  if (ra) {
    const sec = Number(ra);
    if (Number.isFinite(sec)) return now + sec * 1000;
    const d = Date.parse(ra);
    if (Number.isFinite(d)) return d;
  }
  const reset = headers?.get('x-ratelimit-reset-requests') ?? headers?.get('x-ratelimit-reset-tokens') ?? headers?.get('anthropic-ratelimit-unified-reset');
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n) && n > 1e9) return n < 1e12 ? n * 1000 : n;
    const m = /^(\d+(?:\.\d+)?)s$/.exec(reset);
    if (m) return now + Number(m[1]) * 1000;
  }
  const epoch = /\|(\d{10})\b/.exec(text) ?? /reset[^0-9]{0,20}(\d{10})\b/i.exec(text);
  if (epoch) return Number(epoch[1]) * 1000;
  const iso = /(?:reset|resets|available)[^0-9]{0,20}(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/i.exec(text);
  if (iso && Number.isFinite(Date.parse(iso[1]))) return Date.parse(iso[1]);
  const mins = /(?:in|after|sau)\s+(\d+)\s*(?:minutes?|mins?|phút)/i.exec(text);
  if (mins) return now + Number(mins[1]) * 60_000;
  const hours = /(?:in|after|sau)\s+(\d+)\s*(?:hours?|giờ)/i.exec(text);
  if (hours) return now + Number(hours[1]) * 3_600_000;
  return undefined;
}

/** Đầu ra ngắn chỉ chứa thông báo hết hạn mức (một số proxy trả 200 kèm câu này). */
export function looksLikeLimitMessage(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 400 && QUOTA_RE.test(t) && !/##\s/.test(t);
}

/** Chuẩn hóa mọi lỗi ném ra từ runtime thành RuntimeError. */
export function toRuntimeError(e: unknown): RuntimeError {
  if (e instanceof RuntimeError) return e;
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const msg = `${err?.name === 'TimeoutError' ? 'TimeoutError: ' : ''}${err?.message ?? String(e)}${err?.cause?.code ? ` (${err.cause.code})` : err?.cause?.message ? ` (${err.cause.message})` : ''}`;
  const m = /\b([1-5]\d{2})\b:/.exec(msg);
  const status = m ? Number(m[1]) : undefined;
  return new RuntimeError(msg, classifyError(status, msg), status, parseRetryAt(undefined, msg));
}
