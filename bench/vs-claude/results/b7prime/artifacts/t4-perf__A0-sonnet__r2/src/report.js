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

  // bản gốc đi qua JSON.parse(JSON.stringify()): số không hữu hạn -> null (cộng như 0), -0 -> 0
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v + 0 : 0);
  const jv = (v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v);

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthSet = new Map(); // month -> mdata
  const cats = new Map();
  const custs = new Map();
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const rawAmount = o.qty * o.unitPrice;
    const amount = num(refunded ? -rawAmount : rawAmount);
    const neg = typeof rawAmount === 'number' && Number.isFinite(rawAmount) && (refunded ? -rawAmount : rawAmount) < 0;
    const qs = num(refunded ? -o.qty : o.qty);
    const category = p ? jv(p.category) : 'unknown';
    const name = p ? jv(p.name) : '(không rõ)';
    const sku = jv(o.sku);
    const id = jv(o.id);
    const cid = jv(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let md = monthSet.get(month);
    if (!md) monthSet.set(month, (md = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    md.revenue += amount;
    if (neg) md.refunds -= amount;
    if (paid) {
      md.ids.add(id);
      md.custs.add(cid);
    }

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let ps = c.skus.get(sku);
    if (!ps) c.skus.set(sku, (ps = { sku, name, revenue: 0, qty: 0 }));
    ps.revenue += amount;
    ps.qty += qs;

    let cu = custs.get(cid);
    if (!cu) custs.set(cid, (cu = { customerId: cid, revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthSet.keys()].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [];
    for (const p of c.skus.values()) if (p.revenue > 0) prods.push(p);
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
    const md = monthSet.get(m);
    running += md.revenue;
    return { month: m, revenue: md.revenue, refunds: md.refunds, orders: md.ids.size, customers: md.custs.size, runningTotal: running };
  });

  const top = [];
  for (const cu of custs.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
