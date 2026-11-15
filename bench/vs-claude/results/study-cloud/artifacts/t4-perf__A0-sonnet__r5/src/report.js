'use strict';

/**
 * Báo cáo doanh số (bản tối ưu: một lượt duyệt, dùng Map/Set thay cho quét tuyến tính).
 * Giữ nguyên mọi hành vi của bản gốc (xem test/fixtures/report.old.js).
 * orders: [{ id, customerId, sku, qty, unitPrice (xu), date (ISO 8601), status }]
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' }
 */

// Bản gốc đi qua JSON.parse(JSON.stringify(row)): số không hữu hạn (NaN/Infinity) thành null.
const norm = (v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v);

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (như Array.find với ===; NaN không bao giờ khớp)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthStats = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catStats = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custStats = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthStats.get(month);
    if (!m) monthStats.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catStats.get(category);
    if (!c) catStats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let u = custStats.get(customerId);
    if (!u) custStats.set(customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const months = [...monthStats.keys()].sort();

  const categories = [];
  for (const [category, c] of catStats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) ?? 0;
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
  const monthly = months.map((m) => {
    const s = monthStats.get(m);
    running += s.revenue;
    return { month: m, revenue: s.revenue, refunds: s.refunds, orders: s.ids.size, customers: s.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custStats) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
