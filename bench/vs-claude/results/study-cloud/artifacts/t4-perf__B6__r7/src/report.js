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

  // Mô phỏng JSON.parse(JSON.stringify(v)) của bản cũ (undefined bị bỏ, NaN/Infinity -> null, -0 -> 0).
  const norm = (v) => {
    const t = typeof v;
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
    if (v === undefined) return undefined;
    const j = JSON.stringify(v);
    return j === undefined ? undefined : JSON.parse(j);
  };

  // sku -> sản phẩm ĐẦU TIÊN khớp (giống Array.find, so sánh ===)
  const prodBySku = new Map();
  for (const x of products) if (!prodBySku.has(x.sku)) prodBySku.set(x.sku, x);

  const monthsSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, prods: Map }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids: Set, custs: Set }
  const custAgg = new Map(); // customerId -> { customerId, revenue, ids: Set }
  let grandTotal = 0;

  // 1. một lượt duyệt, cộng dồn tuần tự theo thứ tự dòng
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const raw = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
    const category = p ? norm(p.category) : 'unknown';
    const name = p ? norm(p.name) : '(không rõ)';
    const sku = norm(o.sku);
    const id = norm(o.id);
    const customerId = norm(o.customerId);
    const paid = norm(o.status) === 'paid';

    monthsSet.add(month);
    grandTotal += amount;

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), prods: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let pr = c.prods.get(sku);
    if (!pr) c.prods.set(sku, (pr = { sku, name, revenue: 0, qty: 0 }));
    pr.revenue += amount;
    pr.qty += qtySigned;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let cu = custAgg.get(customerId);
    if (!cu) custAgg.set(customerId, (cu = { customerId, revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  // 2. các tháng có dữ liệu
  const months = [...monthsSet].sort();

  // 3. theo danh mục
  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) ?? 0;
    const prods = [];
    for (const p of c.prods.values()) if (p.revenue > 0) prods.push(p);
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

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const top = [];
  for (const cu of custAgg.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
