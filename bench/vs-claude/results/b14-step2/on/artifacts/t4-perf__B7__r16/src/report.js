'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Hiện thực một lượt duyệt với Map; hành vi giữ nguyên bản cũ (kể cả thứ tự xuất hiện đầu tiên,
 * sản phẩm trùng sku lấy bản đầu, và việc JSON round-trip biến NaN/Infinity thành null, -0 thành 0).
 */
function norm(x) {
  // tương đương JSON.parse(JSON.stringify({x})).x: chỉ number bị đổi (không hữu hạn -> null, -0 -> 0);
  // giá trị khác (chuỗi, undefined, boolean...) giữ nguyên.
  if (typeof x === 'number') return Number.isFinite(x) ? x + 0 : null;
  return x;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthMap = new Map(); // month -> { revenue, refunds, orderIds:Set, customers:Set }
  const catMap = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custMap = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    // bản cũ dùng === (NaN không khớp), Map dùng SameValueZero
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = refunded ? norm(-o.qty) : norm(o.qty);
    const paid = o.status === 'paid';
    const customerId = norm(o.customerId);
    const sku = norm(o.sku);
    const id = norm(o.id);

    grandTotal += amount;

    let m = monthMap.get(month);
    if (!m) monthMap.set(month, (m = { revenue: 0, refunds: 0, orderIds: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.orderIds.add(id);
      m.customers.add(customerId);
    }

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
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

  const months = [...monthMap.keys()].sort();

  const categories = [];
  for (const [category, c] of catMap) {
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
    const m = monthMap.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.orderIds.size, customers: m.customers.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custMap) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
