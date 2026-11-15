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

  // tra cứu sản phẩm: giữ bản ghi ĐẦU TIÊN theo sku (như Array.find)
  let prodMap = new Map();
  try {
    for (const x of products) if (!prodMap.has(x.sku)) prodMap.set(x.sku, x);
  } catch {
    prodMap = null; // products bất thường: rơi về products.find để ném lỗi đúng lúc như bản cũ
  }

  // JSON round-trip của bản cũ: undefined bị bỏ (vẫn là undefined), số không hữu hạn -> null (cộng như 0), -0 -> 0
  const key = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? (v === 0 ? 0 : v) : null) : v);
  const num = (v) => (Number.isFinite(v) ? v : 0);

  const months = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const mon = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custs = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodMap ? (o.sku !== o.sku ? undefined : prodMap.get(o.sku)) : // NaN không bao giờ === nên find không khớp
       products.find((x) => x.sku === o.sku);
    const rawAmount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = num(refunded ? -rawAmount : rawAmount);
    const qtySigned = key(refunded ? -o.qty : o.qty); // giữ nguyên chuỗi/null như JSON round-trip
    const category = key(p ? p.category : 'unknown');
    const name = key(p ? p.name : '(không rõ)');
    const sku = key(o.sku);
    const id = key(o.id);
    const customerId = key(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;
    months.add(month);

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let m = mon.get(month);
    if (!m) mon.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let u = custs.get(customerId);
    if (!u) custs.set(customerId, (u = { revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const monthList = [...months].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const mm of monthList) byMonth[mm] = c.byMonth.get(mm) || 0;
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
  const monthly = monthList.map((mm) => {
    const m = mon.get(mm);
    running += m.revenue;
    return { month: mm, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, u] of custs) top.push({ customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months: monthList, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
