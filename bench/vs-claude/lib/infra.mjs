// Nhận diện lỗi hạ tầng (hạn mức tài khoản) để runner dừng hàng đợi thay vì ghi "failed" cho cả loạt lượt.
// Chỉ coi là hạn mức khi có tín hiệu mạnh; chữ "rate limit" đứng một mình (mã/log do agent viết) không đủ.

const STRONG = [
  /usage_limit_reached/i,
  /"status"\s*:\s*429\b/,
  /\bapi error:?\s*429\b/i,
  /\bhttp(?:\/\d(?:\.\d)?)?\s*429\b/i,
  /\bstatus(?: code)?[:=\s]+429\b/i,
  /\bhit your\b[^\n]{0,40}\blimit\b/i,
];
const RESETS = /\bresets?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*[ap]m(?:\s*\([^)\n]{1,40}\))?)/i;

function flatten(x, out = [], depth = 0) {
  if (x == null || depth > 6) return out;
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) flatten(v, out, depth + 1);
  else if (typeof x === 'object') for (const v of Object.values(x)) flatten(v, out, depth + 1);
  else out.push(String(x));
  return out;
}

/** detectRateLimit(textOrObj) → { rateLimited, resetsAt? }. resetsAt là chuỗi thô (vd. '4:50pm'), không parse. */
export function detectRateLimit(textOrObj) {
  const text = typeof textOrObj === 'string' ? textOrObj : flatten(textOrObj).join('\n');
  if (!STRONG.some((re) => re.test(text))) return { rateLimited: false };
  const m = RESETS.exec(text);
  return m ? { rateLimited: true, resetsAt: m[1].trim() } : { rateLimited: true };
}
