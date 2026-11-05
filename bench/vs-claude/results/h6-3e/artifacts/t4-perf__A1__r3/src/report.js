'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Cài đặt một lượt, O(n) (các phép gom nhóm dùng Map/Set; thứ tự = thứ tự xuất hiện đầu tiên).
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (giống Array.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map(); // chỉ trong một lần gọi
  const monthAgg = new Map(); // month -> { revenue, refunds, ids, custs }
  const catAgg = new Map(); // category -> { total, byMonth, skus }
  const custAgg = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    // JSON.stringify biến số không hữu hạn thành null (cộng như 0); -0 thành 0
    let amount = refunded ? -raw : raw;
    amount = Number.isFinite(amount) ? amount + 0 : 0;
    let qs = refunded ? -o.qty : o.qty;
    qs = Number.isFinite(qs) ? qs + 0 : 0;
    const sku = o.sku;
    const customerId = o.customerId;
    const id = o.id;
    const isPaid = o.status === 'paid';

    grandTotal += amount;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (isPaid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catAgg.get(category);
    if (!c) catAgg.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qs;

    let u = custAgg.get(customerId);
    if (!u) custAgg.set(customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (isPaid) u.ids.add(id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [category, c] of catAgg) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) ?? 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category,
      total: c.total,
      share: grandTotal === 0 ? 0 : Math.round((c.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custAgg) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
