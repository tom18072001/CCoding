'use strict';

// Trừ kho theo đơn; ném lỗi nếu thiếu hàng.
function reserve(stock, items) {
  const next = { ...stock };
  for (const it of items) {
    if ((next[it.sku] ?? 0) < it.qty) throw new Error('Thiếu hàng: ' + it.sku);
    next[it.sku] -= it.qty;
  }
  return next;
}

module.exports = { reserve };
