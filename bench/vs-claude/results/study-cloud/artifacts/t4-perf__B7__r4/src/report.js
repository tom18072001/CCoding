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
  // Bản cũ đi qua JSON.parse(JSON.stringify(...)): số không hữu hạn -> null, -0 -> 0.
  const norm = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : null) : x);

  // 1. chuẩn hóa từng dòng
  const rows = [];
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined; // find dùng ===: NaN không khớp
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    rows.push({
      id: norm(o.id),
      customerId: norm(o.customerId),
      sku: norm(o.sku),
      status: o.status,
      month,
      category: p ? norm(p.category) : 'unknown',
      name: p ? norm(p.name) : '(không rõ)',
      amount: norm(refunded ? -amount : amount),
      qtySigned: norm(refunded ? -o.qty : o.qty),
    });
  }

  // 2. các tháng có dữ liệu
  const monthSet = new Set();
  for (const r of rows) monthSet.add(r.month);
  const months = [...monthSet].sort();

  // một lượt: gom theo danh mục / tháng / khách (giữ thứ tự cộng như bản cũ)
  let grandTotal = 0;
  const catMap = new Map();
  const monMap = new Map();
  const custMap = new Map();
  for (const m of months) monMap.set(m, { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() });
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

    const mo = monMap.get(r.month);
    mo.revenue += r.amount;
    if (r.amount < 0) mo.refunds -= r.amount;
    if (r.status === 'paid') {
      mo.ids.add(r.id);
      mo.custs.add(r.customerId);
    }

    let u = custMap.get(r.customerId);
    if (!u) custMap.set(r.customerId, (u = { customerId: r.customerId, revenue: 0, ids: new Set() }));
    u.revenue += r.amount;
    if (r.status === 'paid') u.ids.add(r.id);
  }

  // 3. theo danh mục
  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
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

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((m) => {
    const mo = monMap.get(m);
    running += mo.revenue;
    return { month: m, revenue: mo.revenue, refunds: mo.refunds, orders: mo.ids.size, customers: mo.custs.size, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const top = [...custMap.values()].map((u) => ({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size }));
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
