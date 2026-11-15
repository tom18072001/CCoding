'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Mô phỏng JSON.parse(JSON.stringify(...)) trên giá trị vô hướng: NaN/±Infinity -> null, -0 -> 0.
const norm = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map();
  const getMonth = (d) => {
    let m = monthCache.get(d);
    if (m === undefined) {
      m = new Date(d).toISOString().slice(0, 7);
      if (typeof d === 'string') monthCache.set(d, m);
    }
    return m;
  };

  // Một lượt duyệt: gom nhóm theo tháng / danh mục / khách (giữ thứ tự xuất hiện đầu tiên).
  const monthAgg = new Map(); // month -> {revenue, refunds, ids:Set, custs:Set}
  const catAgg = new Map(); // category -> {total, byMonth:Map, skus:Map}
  const custAgg = new Map(); // customerId -> {revenue, ids:Set}
  let grandTotal = 0;

  for (const o of orders) {
    const month = getMonth(o.date);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const sku = norm(o.sku);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catAgg.get(category);
    if (!c) catAgg.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custAgg.get(customerId);
    if (!cu) custAgg.set(customerId, (cu = { customerId, revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [category, c] of catAgg) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
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
  const monthly = months.map((m) => {
    const a = monthAgg.get(m);
    running += a.revenue;
    return { month: m, revenue: a.revenue, refunds: a.refunds, orders: a.ids.size, customers: a.custs.size, runningTotal: running };
  });

  const top = [];
  for (const cu of custAgg.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
