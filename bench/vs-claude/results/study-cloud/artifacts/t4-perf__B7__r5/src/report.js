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

  // Tra cứu sản phẩm: phần tử đầu tiên khớp sku thắng (như Array.find)
  const prodBySku = new Map();
  // (sku NaN không bao giờ khớp vì bản cũ dùng ===; Map thì coi NaN === NaN)
  for (const p of products) if (p.sku === p.sku && !prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Giá trị số bản cũ đi qua JSON: -0 -> 0, NaN/Infinity -> null (cộng vào tổng như 0)
  // Mô phỏng JSON.parse(JSON.stringify()) cho giá trị nguyên thủy: số không hữu hạn -> null, -0 -> 0, undefined giữ nguyên (khóa bị bỏ)
  const norm = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

  const monthCache = new Map();
  const rows = [];
  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const refunded = o.status === 'refunded';
    const amount = o.qty * o.unitPrice;
    rows.push({
      month,
      id: norm(o.id),
      sku: norm(o.sku),
      customerId: norm(o.customerId),
      paid: o.status === 'paid',
      category: p ? norm(p.category) : 'unknown',
      name: p ? norm(p.name) : '(không rõ)',
      amount: norm(refunded ? -amount : amount),
      qty: norm(refunded ? -o.qty : o.qty),
    });
  }

  const months = [...new Set(rows.map((r) => r.month))].sort();

  const catMap = new Map(); // category -> { total, byMonth, skus: Map }
  const monthMap = new Map(); // month -> { revenue, refunds, ids, custs }
  const custMap = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;
  for (const r of rows) {
    grandTotal += r.amount;
    let c = catMap.get(r.category);
    if (!c) catMap.set(r.category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += r.amount;
    c.byMonth.set(r.month, (c.byMonth.get(r.month) || 0) + r.amount);
    let s = c.skus.get(r.sku);
    if (!s) c.skus.set(r.sku, (s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 }));
    s.revenue += r.amount;
    s.qty += r.qty;

    let m = monthMap.get(r.month);
    if (!m) monthMap.set(r.month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += r.amount;
    if (r.amount < 0) m.refunds -= r.amount;
    if (r.paid) {
      m.ids.add(r.id);
      m.custs.add(r.customerId);
    }

    let u = custMap.get(r.customerId);
    if (!u) custMap.set(r.customerId, (u = { customerId: r.customerId, revenue: 0, ids: new Set() }));
    u.revenue += r.amount;
    if (r.paid) u.ids.add(r.id);
  }

  const categories = [];
  for (const [category, c] of catMap) {
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
  const monthly = months.map((mo) => {
    const m = monthMap.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custMap.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
