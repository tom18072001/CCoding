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

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);
  // Mô phỏng JSON.parse(JSON.stringify(...)) của bản cũ: số không hữu hạn -> null (cộng như 0), -0 -> 0.
  const num = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : 0) : x);

  const monthCache = new Map();
  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catAgg = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custAgg = new Map(); // customerId -> { revenue, ids:Set }
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
    const raw = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = num(refunded ? -raw : raw);
    const qtySigned = num(refunded ? -o.qty : o.qty);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let ca = catAgg.get(category);
    if (!ca) catAgg.set(category, (ca = { total: 0, byMonth: new Map(), skus: new Map() }));
    ca.total += amount;
    ca.byMonth.set(month, (ca.byMonth.get(month) || 0) + amount);
    let sa = ca.skus.get(o.sku);
    if (!sa) ca.skus.set(o.sku, (sa = { sku: o.sku, name, revenue: 0, qty: 0 }));
    sa.revenue += amount;
    sa.qty += qtySigned;

    let ma = monthAgg.get(month);
    if (!ma) monthAgg.set(month, (ma = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    ma.revenue += amount;
    if (amount < 0) ma.refunds -= amount;
    if (paid) {
      ma.ids.add(o.id);
      ma.custs.add(o.customerId);
    }

    let cu = custAgg.get(o.customerId);
    if (!cu) custAgg.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [c, ca] of catAgg) {
    const byMonth = {};
    for (const m of months) byMonth[m] = ca.byMonth.get(m) || 0;
    const prods = [...ca.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: c,
      total: ca.total,
      share: grandTotal === 0 ? 0 : Math.round((ca.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((m) => {
    const ma = monthAgg.get(m);
    running += ma.revenue;
    return { month: m, revenue: ma.revenue, refunds: ma.refunds, orders: ma.ids.size, customers: ma.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [c, cu] of custAgg) top.push({ customerId: c, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
