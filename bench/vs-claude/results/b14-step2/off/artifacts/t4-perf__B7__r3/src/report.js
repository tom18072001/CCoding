'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Hiện thực một lượt duyệt O(n) bằng Map/Set; kết quả (kể cả thứ tự phần tử) giống bản gốc
 * (xem test/fixtures/report.legacy.js).
 */

// Mô phỏng JSON.parse(JSON.stringify(...)) của bản gốc cho số: NaN/±Infinity -> null, -0 -> 0.
function norm(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (giống products.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthStats = new Map(); // month -> { revenue, refunds, orderIds, customers }
  const catStats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const custStats = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;
  const monthOf = new Map(); // date -> month (chỉ trong phạm vi một lần gọi)

  for (const o of orders) {
    let month = typeof o.date === 'string' ? monthOf.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOf.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    // find dùng === nên sku NaN không bao giờ khớp (Map thì khớp)
    const p = o.sku !== o.sku ? undefined : prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const isPaid = o.status === 'paid';

    grandTotal += amount;

    let m = monthStats.get(month);
    if (!m) monthStats.set(month, (m = { revenue: 0, refunds: 0, orderIds: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (isPaid) {
      m.orderIds.add(id);
      m.customers.add(customerId);
    }

    let c = catStats.get(category);
    if (!c) catStats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custStats.get(customerId);
    if (!cu) custStats.set(customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (isPaid) cu.ids.add(id);
  }

  const months = [...monthStats.keys()].sort();

  const categories = [];
  for (const [category, c] of catStats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push({ sku: s.sku, name: s.name, revenue: s.revenue, qty: s.qty });
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
    const st = monthStats.get(m);
    running += st.revenue;
    return { month: m, revenue: st.revenue, refunds: st.refunds, orders: st.orderIds.size, customers: st.customers.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custStats) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
