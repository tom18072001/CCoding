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

  // Bản gốc đi qua JSON.parse(JSON.stringify(row)): số không hữu hạn -> null (tính như 0), -0 -> 0.
  const num = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x || 0 : 0) : x);

  const dateMonth = new Map();
  const monthStats = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catStats = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custStats = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month = dateMonth.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      dateMonth.set(o.date, month);
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

    let ms = monthStats.get(month);
    if (!ms) monthStats.set(month, (ms = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    ms.revenue += amount;
    if (amount < 0) ms.refunds -= amount;
    if (paid) {
      ms.ids.add(o.id);
      ms.custs.add(o.customerId);
    }

    let cs = catStats.get(category);
    if (!cs) catStats.set(category, (cs = { total: 0, byMonth: new Map(), skus: new Map() }));
    cs.total += amount;
    cs.byMonth.set(month, (cs.byMonth.get(month) || 0) + amount);
    let ps = cs.skus.get(o.sku);
    if (!ps) cs.skus.set(o.sku, (ps = { sku: o.sku, name, revenue: 0, qty: 0 }));
    ps.revenue += amount;
    ps.qty += qtySigned;

    let cu = custStats.get(o.customerId);
    if (!cu) custStats.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthStats.keys()].sort();

  const categories = [];
  for (const [c, cs] of catStats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = cs.byMonth.get(m) || 0;
    const prods = [...cs.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: c,
      total: cs.total,
      share: grandTotal === 0 ? 0 : Math.round((cs.total / grandTotal) * 10000) / 10000,
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
  for (const [c, cu] of custStats) top.push({ customerId: c, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
