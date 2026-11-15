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

  // Tra cứu sản phẩm: dòng khớp đầu tiên thắng (như Array.find với ===).
  const prodBySku = new Map();
  for (const p of products) if (p.sku === p.sku && !prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Mô phỏng JSON.parse(JSON.stringify(..)): số không hữu hạn -> null, -0 -> 0.
  const num = (x) => (Number.isFinite(x) ? (x === 0 ? 0 : x) : null);

  const monthCache = new Map();
  const monthAcc = new Map(); // month -> accumulator
  const catAcc = new Map();
  const custAcc = new Map();
  const monthKeys = [];
  let grandTotal = 0;

  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    const status = o.status;
    if (status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const raw = o.qty * o.unitPrice;
    const refunded = status === 'refunded';
    const amount = num(refunded ? -raw : raw);
    const qtySigned = num(refunded ? -o.qty : o.qty);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const sku = o.sku;
    const id = o.id;
    const customerId = o.customerId;
    const paid = status === 'paid';

    grandTotal += amount;

    let m = monthAcc.get(month);
    if (!m) {
      m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() };
      monthAcc.set(month, m);
      monthKeys.push(month);
    }
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catAcc.get(category);
    if (!c) {
      c = { total: 0, byMonth: new Map(), skus: new Map() };
      catAcc.set(category, c);
    }
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) {
      s = { sku, name, revenue: 0, qty: 0 };
      c.skus.set(sku, s);
    }
    s.revenue += amount;
    s.qty += qtySigned;

    let u = custAcc.get(customerId);
    if (!u) {
      u = { customerId, revenue: 0, ids: new Set() };
      custAcc.set(customerId, u);
    }
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const months = monthKeys.sort();

  const categories = [];
  for (const [category, c] of catAcc) {
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
      topProducts: prods.slice(0, topN).map((p) => ({ sku: p.sku, name: p.name, revenue: p.revenue, qty: p.qty })),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthAcc.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custAcc.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
