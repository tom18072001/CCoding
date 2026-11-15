'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Cài đặt một lượt duyệt, dùng Map/Set; giữ nguyên thứ tự xuất hiện đầu tiên và thứ tự cộng dồn
 * của bản gốc (test/helpers/report.legacy.js là đặc tả).
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // Chỉ mục sản phẩm: bản ghi ĐẦU TIÊN theo sku (giống products.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Giữ ngữ nghĩa JSON.parse(JSON.stringify(row)) của bản gốc: NaN/Infinity -> null, -0 -> 0
  const norm = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

  const monthCache = new Map();
  const monthSet = new Set();
  const catMap = new Map();
  const monthMap = new Map();
  const custMap = new Map();
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
    const p = o.sku !== o.sku ? undefined : prodBySku.get(o.sku); // NaN !== NaN như bản gốc
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const sku = norm(o.sku);
    const customerId = norm(o.customerId);
    const id = norm(o.id);
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = catMap.get(category);
    if (!c) {
      c = { category, total: 0, byMonth: new Map(), skus: new Map() };
      catMap.set(category, c);
    }
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let ps = c.skus.get(sku);
    if (!ps) {
      ps = { sku, name, revenue: 0, qty: 0 };
      c.skus.set(sku, ps);
    }
    ps.revenue += amount;
    ps.qty += qtySigned;

    let m = monthMap.get(month);
    if (!m) {
      m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() };
      monthMap.set(month, m);
    }
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let cu = custMap.get(customerId);
    if (!cu) {
      cu = { customerId, revenue: 0, ids: new Set() };
      custMap.set(customerId, cu);
    }
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthSet];
  months.sort();

  const categories = [];
  for (const c of catMap.values()) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
    const prods = [];
    for (const ps of c.skus.values()) if (ps.revenue > 0) prods.push(ps);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: c.category,
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
