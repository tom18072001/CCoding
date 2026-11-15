'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */
// Bản gốc làm JSON.parse(JSON.stringify(row)): số không hữu hạn -> null (cộng vào tổng như 0), -0 -> 0.
const norm = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : 0) : x);

// Trường định danh/nhãn: số không hữu hạn -> null, -0 -> 0 (như JSON round-trip).
const normKey = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : null) : x);

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (giống Array.prototype.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthOf = new Map(); // cache cục bộ trong một lần gọi
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custs = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month = typeof o.date === 'string' ? monthOf.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOf.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    // find dùng === nên sku NaN không bao giờ khớp; Map thì khớp -> loại trừ
    const p = o.sku === o.sku ? prodBySku.get(o.sku) : undefined;
    const category = p ? normKey(p.category) : 'unknown';
    const name = p ? normKey(p.name) : '(không rõ)';
    const sku = normKey(o.sku);
    const id = normKey(o.id);
    const customerId = normKey(o.customerId);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const amount = norm(refunded ? -raw : raw);
    const qtySigned = norm(refunded ? -o.qty : o.qty);
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
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let cu = custs.get(customerId);
    if (!cu) custs.set(customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
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
    const a = monthAgg.get(m);
    running += a.revenue;
    return { month: m, revenue: a.revenue, refunds: a.refunds, orders: a.ids.size, customers: a.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custs) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
