'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Một lượt duyệt dữ liệu, gom nhóm bằng Map; thứ tự cộng dồn và thứ tự xuất hiện
 * của khóa giữ nguyên như bản gốc (xem test/report.legacy.js) để kết quả giống hệt.
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // products.find => bản ghi ĐẦU TIÊN theo sku
  const bySku = new Map();
  for (const p of products) if (!bySku.has(p.sku)) bySku.set(p.sku, p);

  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catAgg = new Map(); // category -> { total, byMonth:Map, prods:Map }
  const custAgg = new Map(); // customerId -> { revenue, ids:Set }
  const monthOf = new Map();
  let grandTotal = 0;

  for (const o of orders) {
    // cache cục bộ theo chuỗi ngày trong MỘT lần gọi (không giữ giữa các lần gọi)
    let month = typeof o.date === 'string' ? monthOf.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOf.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = bySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = o.status === 'refunded';
    let amount = o.qty * o.unitPrice;
    if (refunded) amount = -amount;
    let qs = refunded ? -o.qty : o.qty;
    // bản gốc đi qua JSON: NaN/Infinity -> null (khi cộng coi như 0), -0 -> 0
    if (!Number.isFinite(amount)) amount = 0;
    else if (amount === 0) amount = 0;
    if (!Number.isFinite(qs)) qs = 0;
    else if (qs === 0) qs = 0;
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
    }

    let c = catAgg.get(category);
    if (!c) catAgg.set(category, (c = { total: 0, byMonth: new Map(), prods: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let pr = c.prods.get(o.sku);
    if (!pr) c.prods.set(o.sku, (pr = { sku: o.sku, name, revenue: 0, qty: 0 }));
    pr.revenue += amount;
    pr.qty += qs;

    let u = custAgg.get(o.customerId);
    if (!u) custAgg.set(o.customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(o.id);
  }

  const months = [...monthAgg.keys()].sort();

  const categories = [];
  for (const [category, c] of catAgg) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [];
    for (const pr of c.prods.values()) if (pr.revenue > 0) prods.push(pr);
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
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custAgg) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
