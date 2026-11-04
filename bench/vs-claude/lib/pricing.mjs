// SR-02: bảng giá có phiên bản để tính costUsd cho arm CCoding từ calls.jsonl (USD / 1 triệu token).
// Nguồn Sonnet/Opus: giá niêm yết đã kiểm trong đề bài D11 (3/11/2026). Đổi giá ⇒ đổi PRICING_VERSION.
//
// D12/K2 — Haiku 5.5. Nguồn chính thức, truy cập 4/11/2026:
//   https://www.anthropic.com/claude-haiku-5-5
//   https://platform.claude.com/docs/en/models/haiku-5-5/overview  (mục "Pricing", trích nguyên văn):
//     Input        $0.10 / MTok for prompts up to 100,000 tokens   $0.50 / MTok for prompts over 100,000 tokens
//     Output       $0.50 / MTok for prompts up to 100,000 tokens   $2.50 / MTok for prompts over 100,000 tokens
//     5m cache write $0.125 / MTok for prompts up to 100,000 tokens $0.625 / MTok for prompts over 100,000 tokens
//     1h cache write $0.20 / MTok for prompts up to 100,000 tokens  $1 / MTok for prompts over 100,000 tokens
//     Cache read   $0.01 / MTok for prompts up to 100,000 tokens   $0.05 / MTok for prompts over 100,000 tokens
//   Trang anthropic.com: "Haiku 5.5 is especially good value when used for tasks with prompts up to 100,000 tokens";
//   chú thích 2: "priced 90% lower than Claude Haiku 4.5 for requests up to 100,000 tokens, and 50% lower for requests over 100,000 tokens".
//   Ngưỡng 100K tính trên prompt của từng request (cả hai trang dùng "prompts"/"requests"); trang không nói rõ
//   cách tính phần cache trong "prompt".
//   Đối chiếu bảng bên thứ ba trong đề bài D12: khớp từng ô (kể cả 1h cache write $0,20/$1). Trang anthropic.com chỉ
//   liệt kê một cột ghi cache ($0.125/$0.625 = 5 phút); cột 1 giờ lấy từ trang platform. Không có ô nào khác.
//   Lưu ý: đọc cache của Haiku = 0,1× giá input ($0.01/$0.10), KHÁC 0,05× của Sonnet/Opus ⇒ có cacheReadMult riêng.
//   calls.jsonl chỉ có token cộng dồn của cả phiên, không biết bậc của từng request ⇒ costUsd = bậc cao (cận trên),
//   costUsdLow = bậc thấp (cận dưới); mọi cách áp ngưỡng đều nằm trong [costUsdLow, costUsd].
export const PRICING_VERSION = '2026-11-04';

export const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  // Haiku 5.5: giá hàng chính = bậc cao (> 100K); `low` = bậc thấp (≤ 100K).
  'claude-haiku-5-5': { input: 0.5, output: 2.5, cacheReadMult: 0.1, low: { input: 0.1, output: 0.5 } },
};
export const CACHE_READ_MULT = 0.05;
export const CACHE_WRITE_MULT = { '1h': 2, '5m': 1.25 };
export const HAIKU_TIER_SUFFIX = '/haiku-tier-upper';

const normId = (model) => (typeof model === 'string' && model ? model.toLowerCase().replace(/\[.*\]$/, '').replace(/-\d{8}$/, '') : null);

/** Chuẩn hóa tên model (bỏ hậu tố ngày/[1m]); trả về giá (bậc cao nếu có bậc) hoặc null nếu không có trong bảng. */
export function priceOf(model) {
  const id = normId(model);
  return id ? PRICES[id] ?? null : null;
}

/** Model có hai bậc giá theo độ dài prompt? */
export const isTiered = (model) => !!priceOf(model)?.low;

export const costBasisOf = (cacheTtl = '1h') => `pricing@${PRICING_VERSION}/${cacheTtl}`;

/** USD của một lượt gọi; model không có trong bảng ⇒ null (không đoán). tier: 'upper' (mặc định, cận trên) | 'low'. */
export function costOf(tokens, model, { cacheTtl = '1h', tier = 'upper' } = {}) {
  const p = priceOf(model);
  const wMult = CACHE_WRITE_MULT[cacheTtl];
  if (!p || wMult === undefined) return null;
  const q = tier === 'low' && p.low ? p.low : p;
  const rMult = p.cacheReadMult ?? CACHE_READ_MULT;
  const t = tokens ?? {};
  return ((t.input ?? 0) * q.input + (t.output ?? 0) * q.output
    + (t.cacheRead ?? 0) * q.input * rMult + (t.cacheWrite ?? 0) * q.input * wMult) / 1e6;
}

/**
 * Cộng costUsd theo `model` của TỪNG dòng calls.jsonl (D4). Thiếu hoặc lạ model ở bất kỳ dòng nào
 * ⇒ cả lượt { costUsd: null, costBasis: 'unknown-model' }. Không có dòng nào ⇒ cũng không biết.
 * Có dòng Haiku 5.5 (hai bậc) ⇒ costUsd = cận trên, thêm costUsdLow (cận dưới), costBasis có hậu tố `/haiku-tier-upper`.
 * Không có dòng nào cần bậc ⇒ kết quả như cũ (không thêm trường).
 */
export function costOfCalls(callsText, { cacheTtl = '1h' } = {}) {
  let sum = 0, low = 0, n = 0, tiered = false;
  for (const l of String(callsText ?? '').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let c; try { c = JSON.parse(l); } catch { continue; }
    const tok = { input: c.input, output: c.output, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite };
    const usd = costOf(tok, c.model, { cacheTtl });
    if (usd === null) return { costUsd: null, costBasis: 'unknown-model' };
    sum += usd; low += costOf(tok, c.model, { cacheTtl, tier: 'low' }); n++;
    if (isTiered(c.model)) tiered = true;
  }
  if (!n) return { costUsd: null, costBasis: 'unknown-model' };
  return tiered
    ? { costUsd: sum, costUsdLow: low, costBasis: costBasisOf(cacheTtl) + HAIKU_TIER_SUFFIX }
    : { costUsd: sum, costBasis: costBasisOf(cacheTtl) };
}

/**
 * costUsd/costBasis của một dòng runs.jsonl (D1/D4). r.callsCost = kết quả costOfCalls cho arm CCoding.
 * Arm claude: tính lại từ token + model thực của phiên, giữ số CLI tự báo ở costUsdReported; thiếu model ⇒ null/'unknown-model'.
 */
export function priceRun(spec, r, { cacheTtl = '1h' } = {}) {
  if (spec?.kind === 'null' || spec?.kind === 'oracle' || spec?.kind === 'nearmiss') return { costUsd: 0, costBasis: costBasisOf(cacheTtl) };
  if (spec?.kind === 'ccoding') return r?.callsCost ?? { costUsd: null, costBasis: 'unknown-model' };
  const usd = r?.model && r?.tokens ? costOf(r.tokens, r.model, { cacheTtl }) : null;
  if (usd !== null && isTiered(r.model)) {
    return { costUsd: usd, costUsdLow: costOf(r.tokens, r.model, { cacheTtl, tier: 'low' }), costBasis: costBasisOf(cacheTtl) + HAIKU_TIER_SUFFIX, costUsdReported: r?.costUsd ?? null };
  }
  return { costUsd: usd, costBasis: usd === null ? 'unknown-model' : costBasisOf(cacheTtl), costUsdReported: r?.costUsd ?? null };
}
