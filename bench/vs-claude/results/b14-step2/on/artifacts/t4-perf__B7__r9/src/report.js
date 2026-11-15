'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên (giống products.find)
  const prodBySku = new Map();
  for (const x of products) if (!prodBySku.has(x.sku)) prodBySku.set(x.sku, x);

  // Một lượt duyệt, gom nhóm theo thứ tự xuất hiện (giữ nguyên thứ tự cộng dồn của bản cũ)
  const monthG = new Map();
  const catG = new Map();
  const custG = new Map();
  let grandTotal = 0;

  // Cache cục bộ theo chuỗi ngày (chỉ trong một lần gọi); lỗi ngày không hợp lệ vẫn ném như cũ vì không được cache.
  const monthOfDate = new Map();

  for (const o of orders) {
    const d = o.date;
    let month;
    if (typeof d === 'string') {
      month = monthOfDate.get(d);
      if (month === undefined) {
        month = new Date(d).toISOString().slice(0, 7);
        monthOfDate.set(d, month);
      }
    } else {
      month = new Date(d).toISOString().slice(0, 7);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const base = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = refunded ? -base : base;
    const qtySigned = refunded ? -o.qty : o.qty;
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthG.get(month);
    if (!m) monthG.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
    }

    let c = catG.get(category);
    if (!c) catG.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let u = custG.get(o.customerId);
    if (!u) custG.set(o.customerId, (u = { customerId: o.customerId, revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(o.id);
  }

  const months = [...monthG.keys()].sort();

  const categories = [];
  for (const [category, c] of catG) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push(s);
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
    const m = monthG.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custG.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
