'use strict';

/**
 * Báo cáo doanh số (bản tối ưu: một lượt duyệt, dùng Map/Set thay cho quét tuyến tính).
 * Giữ nguyên hành vi bản cũ (xem test/legacy-report.js).
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */

// Bản cũ đi qua JSON.parse(JSON.stringify(...)): số không hữu hạn -> null, -0 -> 0.
// Khi cộng dồn, null hoạt động như 0.
function norm(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // product đầu tiên theo sku (giống Array.prototype.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map(); // date -> month (hàm thuần, chỉ sống trong một lần gọi)
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custAgg = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const a = amount === null ? 0 : amount;
    const q = qtySigned === null ? 0 : qtySigned;
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';

    monthSet.add(month);
    grandTotal += a;

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += a;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + a);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += a;
    s.qty += q;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += a;
    if (amount !== null && amount < 0) m.refunds -= amount;

    let cu = custAgg.get(o.customerId);
    if (!cu) custAgg.set(o.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += a;

    if (o.status === 'paid') {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
      cu.ids.add(o.id);
    }
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
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
  const monthly = months.map((m) => {
    const g = monthAgg.get(m);
    running += g.revenue;
    return { month: m, revenue: g.revenue, refunds: g.refunds, orders: g.ids.size, customers: g.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custAgg) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
