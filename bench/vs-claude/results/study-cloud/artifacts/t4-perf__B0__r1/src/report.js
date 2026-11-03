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

  // sku -> sản phẩm xuất hiện đầu tiên (khớp products.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Tương đương JSON round-trip: NaN/Infinity -> null, cộng dồn coi như 0
  const fin = (v) => (typeof v === 'number' && !Number.isFinite(v) ? 0 : v);

  const monthCache = new Map();
  const catMap = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthMap = new Map(); // month -> { revenue, refunds, ids: Set, custs: Set }
  const custMap = new Map(); // customerId -> { revenue, ids: Set }
  let grandTotal = 0;

  for (const o of orders) {
    const d = o.date;
    let month;
    if (typeof d === 'string') {
      month = monthCache.get(d);
      if (month === undefined) {
        month = new Date(d).toISOString().slice(0, 7);
        monthCache.set(d, month);
      }
    } else {
      month = new Date(d).toISOString().slice(0, 7);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    const status = o.status;
    if (status === 'cancelled') continue;

    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = fin(refunded ? -raw : raw);
    const qtySigned = fin(refunded ? -o.qty : o.qty);
    const paid = status === 'paid';

    grandTotal += amount;

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let m = monthMap.get(month);
    if (!m) monthMap.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;

    let cu = custMap.get(o.customerId);
    if (!cu) custMap.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;

    if (paid) {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
      cu.ids.add(o.id);
    }
  }

  const months = [...monthMap.keys()].sort();

  const categories = [];
  for (const [category, c] of catMap) {
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
    const x = monthMap.get(m);
    running += x.revenue;
    return { month: m, revenue: x.revenue, refunds: x.refunds, orders: x.ids.size, customers: x.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custMap) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
