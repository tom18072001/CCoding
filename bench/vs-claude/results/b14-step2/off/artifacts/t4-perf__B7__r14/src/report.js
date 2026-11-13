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

  // Bảng tra sản phẩm: find() trả phần tử ĐẦU TIÊN khớp sku
  const prodBySku = new Map();
  for (const x of products) if (!prodBySku.has(x.sku)) prodBySku.set(x.sku, x);

  // Giữ hành vi JSON.parse(JSON.stringify(row)): số không hữu hạn -> null, -0 -> 0
  const norm = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);
  const num = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : 0) : v);

  const monthCache = new Map(); // chỉ trong phạm vi một lần gọi
  const monthSet = new Set();
  const catMap = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthMap = new Map(); // month -> { revenue, refunds, ids: Set, customers: Set }
  const custMap = new Map(); // customerId -> { revenue, ids: Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month;
    if (typeof o.date === 'string') {
      month = monthCache.get(o.date);
      if (month === undefined) monthCache.set(o.date, (month = new Date(o.date).toISOString().slice(0, 7)));
    } else month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku !== o.sku ? undefined : prodBySku.get(o.sku); // NaN !== NaN: find() không khớp
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = num(refunded ? -raw : raw);
    const qtySigned = num(refunded ? -o.qty : o.qty);
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const sku = norm(o.sku);
    const customerId = norm(o.customerId);
    const id = norm(o.id);
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let m = monthMap.get(month);
    if (!m) monthMap.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.customers.add(customerId);
    }

    let u = custMap.get(customerId);
    if (!u) custMap.set(customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const months = [...monthSet];
  months.sort();

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
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
  const monthly = months.map((mo) => {
    const m = monthMap.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.customers.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custMap) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
