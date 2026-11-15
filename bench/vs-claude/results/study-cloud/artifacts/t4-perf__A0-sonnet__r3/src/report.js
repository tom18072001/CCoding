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

  // sku -> sản phẩm đầu tiên khớp (giống Array.prototype.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // 1. chuẩn hóa: mỗi dòng chỉ giữ các trường cần dùng
  const rows = [];
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    rows.push({
      id: o.id,
      customerId: o.customerId,
      sku: o.sku,
      status: o.status,
      month,
      category: p ? p.category : 'unknown',
      name: p ? p.name : '(không rõ)',
      // "0 -" tránh -0 (bản cũ đi qua JSON nên -0 thành 0)
      amount: refunded ? 0 - amount : amount,
      qtySigned: refunded ? 0 - o.qty : o.qty,
    });
  }

  // 2-5. gom nhóm một lượt, giữ thứ tự xuất hiện đầu tiên và thứ tự cộng
  const monthAgg = new Map();
  const catAgg = new Map();
  const custAgg = new Map();
  let grandTotal = 0;
  for (const r of rows) {
    grandTotal += r.amount;
    const paid = r.status === 'paid';

    let m = monthAgg.get(r.month);
    if (!m) monthAgg.set(r.month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += r.amount;
    if (r.amount < 0) m.refunds -= r.amount;
    if (paid) {
      m.ids.add(r.id);
      m.custs.add(r.customerId);
    }

    let c = catAgg.get(r.category);
    if (!c) catAgg.set(r.category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += r.amount;
    c.byMonth.set(r.month, (c.byMonth.get(r.month) || 0) + r.amount);
    let s = c.skus.get(r.sku);
    if (!s) c.skus.set(r.sku, (s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 }));
    s.revenue += r.amount;
    s.qty += r.qtySigned;

    let u = custAgg.get(r.customerId);
    if (!u) custAgg.set(r.customerId, (u = { customerId: r.customerId, revenue: 0, ids: new Set() }));
    u.revenue += r.amount;
    if (paid) u.ids.add(r.id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [category, c] of catAgg) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
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
  const monthly = months.map((m) => {
    const a = monthAgg.get(m);
    running += a.revenue;
    return { month: m, revenue: a.revenue, refunds: a.refunds, orders: a.ids.size, customers: a.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custAgg.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
