'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Mô phỏng JSON.parse(JSON.stringify(v)) cho giá trị nguyên thủy của một trường:
// undefined/hàm/symbol bị bỏ (thành undefined), số không hữu hạn thành null, -0 thành 0.
function jn(v) {
  switch (typeof v) {
    case 'number':
      return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    default:
      return v;
  }
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sản phẩm khớp đầu tiên theo sku (=== : NaN không bao giờ khớp)
  const pmap = new Map();
  for (const p of products) {
    const k = p.sku;
    if (k !== k) continue;
    if (!pmap.has(k)) pmap.set(k, p);
  }

  const monthAgg = new Map(); // month -> { revenue, refunds, ids, custs }
  const catAgg = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const custAgg = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = pmap.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = jn(refunded ? -raw : raw);
    const qtySigned = jn(refunded ? -o.qty : o.qty);
    const category = p ? jn(p.category) : 'unknown';
    const name = p ? jn(p.name) : '(không rõ)';
    const sku = jn(o.sku);
    const id = jn(o.id);
    const customerId = jn(o.customerId);
    const paid = jn(o.status) === 'paid';

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

    let u = custAgg.get(customerId);
    if (!u) custAgg.set(customerId, (u = { customerId, revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [cat, c] of catAgg) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push(s);
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
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custAgg.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
