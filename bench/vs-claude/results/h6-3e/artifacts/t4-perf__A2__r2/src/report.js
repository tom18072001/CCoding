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

  // first product per sku (như products.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // JSON round-trip của bản cũ: số không hữu hạn -> null (cộng như 0, không < 0)
  const fin = (x) => (typeof x === 'number' && !Number.isFinite(x) ? 0 : x);

  const monthStats = new Map(); // month -> {revenue, refunds, ids:Set, custs:Set}
  const cats = new Map(); // category -> {total, byMonth:Map, skus:Map}
  const custs = new Map(); // customerId -> {revenue, ids:Set}
  let grandTotal = 0;
  const monthOf = new Map(); // cache trong một lần gọi

  for (const o of orders) {
    let month = monthOf.get(o.date);
    if (month === undefined) monthOf.set(o.date, (month = new Date(o.date).toISOString().slice(0, 7)));
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = fin(refunded ? -raw : raw);
    const qtySigned = fin(refunded ? -o.qty : o.qty);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let ms = monthStats.get(month);
    if (!ms) monthStats.set(month, (ms = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    ms.revenue += amount;
    if (amount < 0) ms.refunds -= amount;
    if (paid) {
      ms.ids.add(o.id);
      ms.custs.add(o.customerId);
    }

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custs.get(o.customerId);
    if (!cu) custs.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthStats.keys()].sort();

  const categories = [];
  for (const [category, c] of cats) {
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
    const ms = monthStats.get(m);
    running += ms.revenue;
    return { month: m, revenue: ms.revenue, refunds: ms.refunds, orders: ms.ids.size, customers: ms.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custs) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
