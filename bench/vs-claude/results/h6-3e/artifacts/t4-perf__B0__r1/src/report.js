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

  // sku -> sản phẩm đầu tiên khớp (giống Array.prototype.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Một lượt duyệt: gom theo tháng / danh mục / khách. Mỗi nhóm cộng dồn theo đúng thứ tự dòng
  // như bản cũ (filter + reduce) nên kết quả số học giống hệt; Map giữ thứ tự xuất hiện đầu tiên.
  const monthAcc = new Map();
  const catAcc = new Map();
  const custAcc = new Map();
  const monthOf = new Map();
  let grandTotal = 0;

  for (const o of orders) {
    // cache cục bộ trong một lần gọi (không giữ giữa các lần gọi); ngày sai vẫn ném lỗi như cũ
    let month = typeof o.date === 'string' ? monthOf.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOf.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    // `+ 0` chuẩn hóa -0 thành 0 (bản cũ đi qua JSON nên -0 thành 0)
    const amount = (refunded ? -raw : raw) + 0;
    const qtySigned = (refunded ? -o.qty : o.qty) + 0;
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthAcc.get(month);
    if (!m) monthAcc.set(month, (m = { revenue: 0, refunds: 0, orderIds: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.orderIds.add(o.id);
      m.customers.add(o.customerId);
    }

    let c = catAcc.get(category);
    if (!c) catAcc.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (!s) c.skus.set(o.sku, (s = { sku: o.sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let u = custAcc.get(o.customerId);
    if (!u) custAcc.set(o.customerId, (u = { customerId: o.customerId, revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(o.id);
  }

  const months = [...monthAcc.keys()].sort();

  const categories = [];
  for (const [category, c] of catAcc) {
    const total = c.total;
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category,
      total,
      share: grandTotal === 0 ? 0 : Math.round((total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((mo) => {
    const m = monthAcc.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.orderIds.size, customers: m.customers.size, runningTotal: running };
  });

  const top = [];
  for (const u of custAcc.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
