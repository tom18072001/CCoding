'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Một lượt duyệt, gom nhóm bằng Map/Set; thứ tự cộng và thứ tự chèn giữ như bản gốc O(n·k).
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // Bản đầu tiên theo sku thắng (giống products.find).
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map(); // chỉ sống trong một lần gọi
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth, skus }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids, custs }
  const custAgg = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    let month;
    const d = o.date;
    if (typeof d === 'string' && monthCache.has(d)) month = monthCache.get(d);
    else {
      month = new Date(d).toISOString().slice(0, 7);
      if (typeof d === 'string') monthCache.set(d, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    let amount = refunded ? -raw : raw;
    let qtySigned = refunded ? -o.qty : o.qty;
    // Giữ hành vi JSON.parse(JSON.stringify(row)) của bản gốc: NaN/Infinity -> null (cộng như 0), -0 -> 0.
    amount = Number.isFinite(amount) ? amount + 0 : 0;
    qtySigned = Number.isFinite(qtySigned) ? qtySigned + 0 : 0;
    const category = p ? p.category : 'unknown'; // có thể undefined nếu sản phẩm thiếu category
    const name = p ? p.name : '(không rõ)';
    const sku = o.sku;
    const customerId = o.customerId;
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.custs.add(customerId);
    }

    let cu = custAgg.get(customerId);
    if (!cu) custAgg.set(customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of cats) {
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
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custAgg) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
