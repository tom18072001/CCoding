'use strict';
const { toCents } = require('./money');

const DAY_MS = 86400000;

/**
 * Mã giảm giá:
 *  { code, type: 'percent', percent }                 — giảm % trên toàn giỏ
 *  { code, type: 'fixed', amount }                    — giảm số tiền cố định trên toàn giỏ (không làm giỏ âm)
 *  { code, type: 'category', category, percent }      — giảm % cho các dòng thuộc danh mục
 *  { code, type: 'bxgy', sku, buy, free }             — mua `buy` tặng `free` cùng sản phẩm (món tặng giá 0)
 * Tùy chọn chung: startsAt / endsAt ('YYYY-MM-DD', theo UTC, hiệu lực từ đầu ngày startsAt tới HẾT ngày endsAt),
 * minSubtotal (đơn vị tiền, so với tạm tính trước giảm giá).
 */
class PromotionError extends Error {
  constructor(code, reason) {
    super(`Mã ${code} không áp dụng được: ${reason}`);
    this.name = 'PromotionError';
    this.code = code;
    this.reason = reason;
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Mốc (ms) bắt đầu hết hiệu lực: 'YYYY-MM-DD' => 00:00Z ngày kế tiếp; có giờ => đúng thời điểm đó. */
function endExclusiveMs(endsAt) {
  const t = new Date(endsAt).getTime();
  return typeof endsAt === 'string' && DATE_ONLY.test(endsAt) ? t + DAY_MS : t;
}

function checkValidity(promo, now, subtotalCents) {
  if (promo.startsAt && now < new Date(promo.startsAt)) throw new PromotionError(promo.code, 'chưa tới ngày áp dụng');
  if (promo.endsAt && !(now.getTime() < endExclusiveMs(promo.endsAt))) throw new PromotionError(promo.code, 'đã hết hạn');
  if (promo.minSubtotal != null && subtotalCents < toCents(promo.minSubtotal)) throw new PromotionError(promo.code, 'chưa đạt giá trị tối thiểu');
}

/** Số món được tặng khi mua `qty` món với khuyến mãi mua `buy` tặng `free`. */
function freeUnits(qty, buy, free) {
  return Math.floor(qty / (buy + free)) * free;
}

module.exports = { PromotionError, checkValidity, freeUnits, DAY_MS };
