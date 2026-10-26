// Che giấu bí mật & dữ liệu cá nhân trước khi ghi log hoặc gửi ra runtime bên ngoài
// (Data Protection Gate: PRE-04 che giấu, DET-04 log tập trung không chứa PII).

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:anthropic-key]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:api-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED:github-token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED:github-token]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED:google-key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED:jwt]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED]'],
  [/((?:password|passwd|pwd|secret|api[_-]?key|token|mật khẩu)\s*[:=]\s*)(["']?)[^\s"',;]{4,}\2/gi, '$1$2[REDACTED]$2'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1[REDACTED]@'],
];

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
  // Số CCCD 12 chữ số
  [/(?<![\d.])\d{12}(?![\d.])/g, '[CCCD]'],
  // Số điện thoại Việt Nam
  [/(?<![\d])(?:\+84|0)(?:3|5|7|8|9)\d{8}(?![\d])/g, '[PHONE]'],
];

// Thẻ thanh toán 16 chữ số (liền hoặc nhóm 4-4-4-4) và hợp lệ Luhn
const CARD = /(?<![\d-])(?:\d{4}[ -]?){3}\d{4}(?![\d-])/g;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export interface RedactOptions {
  secrets?: boolean;
  pii?: boolean;
}

export function redact(text: string, opts: RedactOptions = { secrets: true, pii: true }): string {
  if (!text) return text;
  let out = text;
  if (opts.secrets !== false) for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  if (opts.pii) {
    for (const [re, rep] of PII_PATTERNS) out = out.replace(re, rep);
    out = out.replace(CARD, (m) => (luhnOk(m.replace(/\D/g, '')) ? '[CARD]' : m));
  }
  return out;
}

export function redactDeep<T>(value: T, opts: RedactOptions): T {
  if (typeof value === 'string') return redact(value, opts) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, opts)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, opts);
    return out as T;
  }
  return value;
}
