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

  // Chỉ mục sản phẩm: bản ghi đầu tiên theo sku thắng (giống Array.find).
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  // Bản cũ qua JSON round-trip: NaN/Infinity -> null (~0), -0 -> 0.
  const norm = (x) => (Number.isFinite(x) ? x + 0 : 0);

  // 1. chuẩn hóa từng dòng
  const rows = [];
  const monthSet = new Set();
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const refunded = o.status === 'refunded';
    const amount = o.qty * o.unitPrice;
    rows.push({
      id: o.id,
      customerId: o.customerId,
      sku: o.sku,
      status: o.status,
      month,
      category: p ? p.category : 'unknown',
      name: p ? p.name : '(không rõ)',
      amount: norm(refunded ? -amount : amount),
      qtySigned: norm(refunded ? -o.qty : o.qty),
    });
    monthSet.add(month);
  }

  // 2. các tháng có dữ liệu
  const months = [...monthSet];
  months.sort();

  // Gom nhóm một lượt (giữ thứ tự xuất hiện đầu tiên và thứ tự cộng như bản cũ)
  let grandTotal = 0;
  const catMap = new Map();
  const monthMap = new Map();
  const custMap = new Map();
  for (const m of months) monthMap.set(m, { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() });
  for (const r of rows) {
    grandTotal += r.amount;

    let c = catMap.get(r.category);
    if (!c) {
      c = { total: 0, byMonth: {}, skus: new Map() };
      for (const m of months) c.byMonth[m] = 0;
      catMap.set(r.category, c);
    }
    c.total += r.amount;
    c.byMonth[r.month] += r.amount;
    let s = c.skus.get(r.sku);
    if (!s) {
      s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 };
      c.skus.set(r.sku, s);
    }
    s.revenue += r.amount;
    s.qty += r.qtySigned;

    const mo = monthMap.get(r.month);
    mo.revenue += r.amount;
    if (r.amount < 0) mo.refunds -= r.amount;
    const paid = r.status === 'paid';
    if (paid) {
      mo.ids.add(r.id);
      mo.custs.add(r.customerId);
    }

    let cu = custMap.get(r.customerId);
    if (!cu) {
      cu = { customerId: r.customerId, revenue: 0, ids: new Set() };
      custMap.set(r.customerId, cu);
    }
    cu.revenue += r.amount;
    if (paid) cu.ids.add(r.id);
  }

  // 3. theo danh mục
  const categories = [];
  for (const [category, c] of catMap) {
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push(s);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category,
      total: c.total,
      share: grandTotal === 0 ? 0 : Math.round((c.total / grandTotal) * 10000) / 10000,
      byMonth: c.byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((m) => {
    const mo = monthMap.get(m);
    running += mo.revenue;
    return { month: m, revenue: mo.revenue, refunds: mo.refunds, orders: mo.ids.size, customers: mo.custs.size, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const top = [];
  for (const cu of custMap.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
