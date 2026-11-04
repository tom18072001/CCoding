// SR-02: bảng giá có phiên bản để tính costUsd cho arm CCoding từ calls.jsonl (USD / 1 triệu token).
// Nguồn: giá niêm yết đã kiểm trong đề bài D11 (3/11/2026). Đổi giá ⇒ đổi PRICING_VERSION.
export const PRICING_VERSION = '2026-11-03';

export const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};
export const CACHE_READ_MULT = 0.05;
export const CACHE_WRITE_MULT = { '1h': 2, '5m': 1.25 };

/** Chuẩn hóa tên model (bỏ hậu tố ngày/[1m]); trả về giá hoặc null nếu không có trong bảng. */
export function priceOf(model) {
  if (typeof model !== 'string' || !model) return null;
  const id = model.toLowerCase().replace(/\[.*\]$/, '').replace(/-\d{8}$/, '');
  return PRICES[id] ?? null;
}

export const costBasisOf = (cacheTtl = '1h') => `pricing@${PRICING_VERSION}/${cacheTtl}`;

/** USD của một lượt gọi; model không có trong bảng ⇒ null (không đoán). */
export function costOf(tokens, model, { cacheTtl = '1h' } = {}) {
  const p = priceOf(model);
  const wMult = CACHE_WRITE_MULT[cacheTtl];
  if (!p || wMult === undefined) return null;
  const t = tokens ?? {};
  return ((t.input ?? 0) * p.input + (t.output ?? 0) * p.output
    + (t.cacheRead ?? 0) * p.input * CACHE_READ_MULT + (t.cacheWrite ?? 0) * p.input * wMult) / 1e6;
}

/**
 * Cộng costUsd theo `model` của TỪNG dòng calls.jsonl (D4). Thiếu hoặc lạ model ở bất kỳ dòng nào
 * ⇒ cả lượt { costUsd: null, costBasis: 'unknown-model' }. Không có dòng nào ⇒ cũng không biết.
 */
export function costOfCalls(callsText, { cacheTtl = '1h' } = {}) {
  let sum = 0, n = 0;
  for (const l of String(callsText ?? '').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let c; try { c = JSON.parse(l); } catch { continue; }
    const usd = costOf({ input: c.input, output: c.output, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite }, c.model, { cacheTtl });
    if (usd === null) return { costUsd: null, costBasis: 'unknown-model' };
    sum += usd; n++;
  }
  return n ? { costUsd: sum, costBasis: costBasisOf(cacheTtl) } : { costUsd: null, costBasis: 'unknown-model' };
}

/**
 * costUsd/costBasis của một dòng runs.jsonl (D1/D4). r.callsCost = kết quả costOfCalls cho arm CCoding.
 * Arm claude: tính lại từ token + model thực của phiên, giữ số CLI tự báo ở costUsdReported; thiếu model ⇒ null/'unknown-model'.
 */
export function priceRun(spec, r, { cacheTtl = '1h' } = {}) {
  if (spec?.kind === 'null' || spec?.kind === 'oracle' || spec?.kind === 'nearmiss') return { costUsd: 0, costBasis: costBasisOf(cacheTtl) };
  if (spec?.kind === 'ccoding') return r?.callsCost ?? { costUsd: null, costBasis: 'unknown-model' };
  const usd = r?.model && r?.tokens ? costOf(r.tokens, r.model, { cacheTtl }) : null;
  return { costUsd: usd, costBasis: usd === null ? 'unknown-model' : costBasisOf(cacheTtl), costUsdReported: r?.costUsd ?? null };
}
