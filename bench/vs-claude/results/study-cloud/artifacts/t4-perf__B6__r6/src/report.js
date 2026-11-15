'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Mô phỏng JSON.parse(JSON.stringify(x)) cho giá trị nguyên thủy: NaN/±Infinity -> null, -0 -> 0.
function jn(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên (giữ ngữ nghĩa "khớp đầu tiên" của find)
  const prodBySku = new Map();
  for (const x of products) if (!prodBySku.has(x.sku)) prodBySku.set(x.sku, x);

  let grandTotal = 0;
  const monthMap = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catMap = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custMap = new Map(); // customerId -> { revenue, ids:Set }

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const sk = o.sku;
    const p = sk !== sk ? undefined : prodBySku.get(sk);
    const rawAmount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = jn(refunded ? -rawAmount : rawAmount);
    const qtySigned = jn(refunded ? -o.qty : o.qty);
    const category = p ? jn(p.category) : 'unknown';
    const name = p ? jn(p.name) : '(không rõ)';
    const sku = jn(sk);
    const id = jn(o.id);
    const customerId = jn(o.customerId);
    const paid = o.status === 'paid';

    grandTotal = grandTotal + amount;

    let m = monthMap.get(month);
    if (!m) monthMap.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue = m.revenue + amount;
    if (amount < 0) m.refunds = m.refunds - amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total = c.total + amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let ps = c.skus.get(sku);
    if (!ps) c.skus.set(sku, (ps = { sku, name, revenue: 0, qty: 0 }));
    ps.revenue = ps.revenue + amount;
    ps.qty = ps.qty + qtySigned;

    let cu = custMap.get(customerId);
    if (!cu) custMap.set(customerId, (cu = { customerId, revenue: 0, ids: new Set() }));
    cu.revenue = cu.revenue + amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthMap.keys()];
  months.sort();

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.has(m) ? c.byMonth.get(m) : 0;
    const prods = [];
    for (const ps of c.skus.values()) if (ps.revenue > 0) prods.push(ps);
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
