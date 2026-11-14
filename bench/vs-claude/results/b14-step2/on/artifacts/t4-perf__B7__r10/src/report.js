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

  // sku -> sản phẩm đầu tiên khớp (giống products.find với ===)
  const prodBySku = new Map();
  for (const x of products) if (x.sku === x.sku && !prodBySku.has(x.sku)) prodBySku.set(x.sku, x);

  const monthCache = new Map();
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const custs = new Map(); // customerId -> { revenue, ids: Set }
  const mon = new Map(); // month -> { revenue, refunds, ids: Set, customers: Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month;
    if (typeof o.date === 'string') {
      month = monthCache.get(o.date);
      if (month === undefined) {
        month = new Date(o.date).toISOString().slice(0, 7);
        monthCache.set(o.date, month);
      }
    } else {
      month = new Date(o.date).toISOString().slice(0, 7);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = refunded ? -raw : raw;
    const qtySigned = refunded ? -o.qty : o.qty;
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let m = mon.get(month);
    if (!m) mon.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.customers.add(o.customerId);
    }

    let cu = custs.get(o.customerId);
    if (!cu) custs.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const mm of months) byMonth[mm] = c.byMonth.get(mm) || 0;
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
  const monthly = months.map((mm) => {
    const m = mon.get(mm);
    running += m.revenue;
    return { month: mm, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.customers.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custs) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
