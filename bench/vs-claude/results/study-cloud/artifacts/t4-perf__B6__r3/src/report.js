'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Mô phỏng JSON.parse(JSON.stringify(v)) cho một giá trị trường của dòng:
// số không hữu hạn -> null, -0 -> 0, undefined/function/symbol -> bị bỏ (undefined).
function norm(v) {
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  if (t === 'string' || t === 'boolean' || v === null || v === undefined) return v;
  return JSON.parse(JSON.stringify({ v })).v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> product đầu tiên (như products.find với ===; NaN không bao giờ khớp)
  const prodBySku = new Map();
  for (const x of products) {
    if (x.sku !== x.sku) continue;
    if (!prodBySku.has(x.sku)) prodBySku.set(x.sku, x);
  }

  const monthSet = new Set();
  let grandTotal = 0;
  const catMap = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monMap = new Map(); // month -> { revenue, refunds, ids: Set, custs: Set }
  const custMap = new Map(); // customerId -> { revenue, ids: Set }

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const amount0 = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = norm(refunded ? -amount0 : amount0);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = norm(p ? p.category : 'unknown');
    const name = norm(p ? p.name : '(không rõ)');
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal = grandTotal + amount;

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total = c.total + amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let g = c.skus.get(sku);
    if (!g) c.skus.set(sku, (g = { sku, name, revenue: 0, qty: 0 }));
    g.revenue = g.revenue + amount;
    g.qty = g.qty + qtySigned;

    let m = monMap.get(month);
    if (!m) monMap.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue = m.revenue + amount;
    if (amount < 0) m.refunds = m.refunds - amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let u = custMap.get(customerId);
    if (!u) custMap.set(customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue = u.revenue + amount;
    if (paid) u.ids.add(id);
  }

  const months = [...monthSet];
  months.sort();

  const categories = [];
  for (const [cat, c] of catMap) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) ?? 0;
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
    const m = monMap.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custMap) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
