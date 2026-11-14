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

  // Bản gốc đi qua JSON.parse(JSON.stringify(row)): số không hữu hạn -> null, -0 -> 0.
  const jn = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

  // products.find: khớp đầu tiên theo ===
  const prodBySku = new Map();
  for (const p of products) if (p.sku === p.sku && !prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const rows = [];
  const monthSet = new Set();
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    rows.push({
      id: jn(o.id),
      customerId: jn(o.customerId),
      sku: jn(o.sku),
      status: o.status,
      month,
      category: p ? jn(p.category) : 'unknown',
      name: p ? p.name : '(không rõ)',
      amount: jn(refunded ? -amount : amount),
      qtySigned: jn(refunded ? -o.qty : o.qty),
    });
    monthSet.add(month);
  }

  const months = [...monthSet].sort();

  let grandTotal = 0;
  const catMap = new Map();
  const monthMap = new Map();
  const custMap = new Map();
  for (const r of rows) {
    grandTotal += r.amount;

    let c = catMap.get(r.category);
    if (!c) catMap.set(r.category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += r.amount;
    c.byMonth.set(r.month, (c.byMonth.get(r.month) || 0) + r.amount);
    let s = c.skus.get(r.sku);
    if (!s) c.skus.set(r.sku, (s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 }));
    s.revenue += r.amount;
    s.qty += r.qtySigned;

    let m = monthMap.get(r.month);
    if (!m) monthMap.set(r.month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += r.amount;
    if (r.amount < 0) m.refunds -= r.amount;

    let cu = custMap.get(r.customerId);
    if (!cu) custMap.set(r.customerId, (cu = { customerId: r.customerId, revenue: 0, ids: new Set() }));
    cu.revenue += r.amount;

    if (r.status === 'paid') {
      m.ids.add(r.id);
      m.custs.add(r.customerId);
      cu.ids.add(r.id);
    }
  }

  const categories = [];
  for (const [cat, c] of catMap) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: cat,
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
  for (const cu of custMap.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
