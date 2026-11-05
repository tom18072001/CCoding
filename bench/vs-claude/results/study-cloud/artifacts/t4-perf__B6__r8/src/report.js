'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Mô phỏng JSON.parse(JSON.stringify(...)) cho một giá trị: số không hữu hạn -> null, -0 -> 0, undefined/hàm/symbol -> undefined.
function norm(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // Map sku -> sản phẩm ĐẦU TIÊN (như Array.find với ===; NaN không bao giờ khớp)
  const prodBySku = new Map();
  for (const p of products) {
    const k = p.sku;
    if (k !== k) continue;
    if (!prodBySku.has(k)) prodBySku.set(k, p);
  }

  const monthSet = new Map(); // month -> { revenue, refunds, ids, custs } (thứ tự xuất hiện)
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const custMap = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const refunded = o.status === 'refunded';
    const rawAmount = o.qty * o.unitPrice;
    const amount = norm(refunded ? -rawAmount : rawAmount) || 0; // null (NaN/Infinity) cộng vào như 0
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = norm(p ? p.category : 'unknown');
    const name = norm(p ? p.name : '(không rõ)');
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthSet.get(month);
    if (!m) monthSet.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let cu = custMap.get(customerId);
    if (!cu) custMap.set(customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthSet.keys()];
  months.sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
    const prods = [...c.skus.values()].filter((x) => x.revenue > 0);
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
    const m = monthSet.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custMap) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
