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

  // tra cứu sản phẩm: bản ghi đầu tiên theo sku thắng (giống Array.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Số học giữ nguyên bản cũ (JSON round-trip: NaN/Infinity -> null ~ 0 khi cộng, -0 -> 0)
  const norm = (x) => (Number.isFinite(x) ? x + 0 : 0);

  // 1. chuẩn hóa + gom nhóm trong một lượt (giữ thứ tự xuất hiện đầu tiên của Map)
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custs = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const raw = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = norm(refunded ? -raw : raw);
    const negative = Number.isFinite(refunded ? -raw : raw) && amount < 0;
    // qty thiếu: bản cũ để undefined (JSON bỏ khóa) nên tổng thành NaN; giữ nguyên hành vi đó
    const qtySigned = !refunded && o.qty === undefined ? NaN : norm(refunded ? -o.qty : o.qty);
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = cats.get(category);
    if (!c) cats.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let ps = c.skus.get(o.sku);
    if (!ps) c.skus.set(o.sku, (ps = { sku: o.sku, name, revenue: 0, qty: 0 }));
    ps.revenue += amount;
    ps.qty += qtySigned;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (negative) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
    }

    let cu = custs.get(o.customerId);
    if (!cu) custs.set(o.customerId, (cu = { customerId: o.customerId, revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  // 2. các tháng có dữ liệu
  const months = [...monthSet].sort();

  // 3. theo danh mục
  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    const total = c.total;
    categories.push({
      category,
      total,
      share: grandTotal === 0 ? 0 : Math.round((total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((m) => {
    const a = monthAgg.get(m);
    running += a.revenue;
    return { month: m, revenue: a.revenue, refunds: a.refunds, orders: a.ids.size, customers: a.custs.size, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const top = [...custs.values()].map((c) => ({ customerId: c.customerId, revenue: c.revenue, orders: c.ids.size }));
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
