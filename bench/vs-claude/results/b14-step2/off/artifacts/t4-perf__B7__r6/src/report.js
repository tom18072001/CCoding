'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Bản tối ưu: một lượt duyệt, dùng Map/Set; giữ nguyên hành vi bản cũ
 * (thứ tự xuất hiện đầu tiên, thứ tự cộng dồn theo dòng, product trùng sku lấy cái đầu).
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthAgg = new Map(); // month -> {revenue, refunds, orderIds:Set, customers:Set}
  const catAgg = new Map(); // category -> {total, byMonth:Map, skus:Map}
  const custAgg = new Map(); // customerId -> {revenue, ids:Set}
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    // bản cũ đi qua JSON.stringify/parse: NaN/Infinity -> null, -0 -> 0
    let amount = refunded ? -raw : raw;
    amount = Number.isFinite(amount) ? amount + 0 : null;
    const sq = refunded ? -o.qty : o.qty;
    const qtySigned = typeof sq === 'number' ? (Number.isFinite(sq) ? sq + 0 : null) : sq;
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';

    grandTotal += amount;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, orderIds: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (o.status === 'paid') {
      m.orderIds.add(o.id);
      m.customers.add(o.customerId);
    }

    let c = catAgg.get(category);
    if (!c) catAgg.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custAgg.get(o.customerId);
    if (!cu) custAgg.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (o.status === 'paid') cu.ids.add(o.id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [category, c] of catAgg) {
    const total = c.total;
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push(s);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category,
      total,
      share: grandTotal === 0 ? 0 : Math.round((total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.orderIds.size, customers: m.customers.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custAgg) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
