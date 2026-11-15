'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Hiện thực một lượt + Map/Set (O(n)); hành vi giữ nguyên bản cũ, gồm cả việc
 * "đi qua JSON" làm số không hữu hạn thành null (null cộng vào tổng như 0) và -0 thành 0.
 */
const num = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // 1. chuẩn hóa từng dòng
  const rows = [];
  const monthOf = new Map(); // chỉ trong một lần gọi
  for (const o of orders) {
    let month = typeof o.date === 'string' ? monthOf.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOf.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    // Array.find dùng === nên NaN không bao giờ khớp; Map thì khớp -> chặn riêng
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    rows.push({
      id: num(o.id),
      customerId: num(o.customerId),
      sku: num(o.sku),
      status: o.status,
      month,
      category: p ? num(p.category) : 'unknown',
      name: p ? num(p.name) : '(không rõ)',
      amount: num(refunded ? -amount : amount),
      qtySigned: num(refunded ? -o.qty : o.qty),
    });
  }

  // 2. các tháng có dữ liệu
  const months = [...new Set(rows.map((r) => r.month))].sort();

  // 3-5. gom nhóm một lượt (theo thứ tự xuất hiện của dòng)
  let grandTotal = 0;
  const catMap = new Map();
  const monthMap = new Map();
  const custMap = new Map();
  for (const r of rows) {
    const amt = r.amount;
    grandTotal += amt;

    let c = catMap.get(r.category);
    if (!c) catMap.set(r.category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amt;
    c.byMonth.set(r.month, (c.byMonth.get(r.month) ?? 0) + amt);
    let s = c.skus.get(r.sku);
    if (!s) c.skus.set(r.sku, (s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 }));
    s.revenue += amt;
    s.qty += r.qtySigned;

    let m = monthMap.get(r.month);
    if (!m) monthMap.set(r.month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amt;
    if (amt < 0) m.refunds -= amt;

    let u = custMap.get(r.customerId);
    if (!u) custMap.set(r.customerId, (u = { customerId: r.customerId, revenue: 0, ids: new Set() }));
    u.revenue += amt;

    if (r.status === 'paid') {
      m.ids.add(r.id);
      m.custs.add(r.customerId);
      u.ids.add(r.id);
    }
  }

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) ?? 0;
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

  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthMap.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const u of custMap.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
