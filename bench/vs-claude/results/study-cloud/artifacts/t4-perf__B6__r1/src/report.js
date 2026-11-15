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

  // Tương đương JSON.parse(JSON.stringify(row)) cho các field được dùng:
  // số không hữu hạn -> null, -0 -> 0; undefined giữ nguyên (field bị bỏ -> đọc ra undefined).
  const norm = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? (v === 0 ? 0 : v) : null) : v);

  const skuMap = new Map();
  for (const p of products) if (p.sku === p.sku && !skuMap.has(p.sku)) skuMap.set(p.sku, p);

  const monthMap = new Map(); // month -> { revenue, refunds, ids, custs }
  const catMap = new Map(); // category -> { total, byMonth, skus }
  const custMap = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? skuMap.get(o.sku) : undefined;
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = norm(p ? p.category : 'unknown');
    const name = norm(p ? p.name : '(không rõ)');
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthMap.get(month);
    if (!m) monthMap.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custMap.get(customerId);
    if (!cu) custMap.set(customerId, (cu = { customerId, revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthMap.keys()];
  months.sort();

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const mm of months) byMonth[mm] = c.byMonth.get(mm) ?? 0;
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
    const m = monthMap.get(mm);
    running += m.revenue;
    return { month: mm, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const cu of custMap.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
