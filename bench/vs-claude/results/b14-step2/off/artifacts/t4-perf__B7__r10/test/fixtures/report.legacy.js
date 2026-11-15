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

  // 1. chuẩn hóa từng dòng
  const rows = [];
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = products.find((x) => x.sku === o.sku);
    const amount = o.qty * o.unitPrice;
    const row = {
      ...o,
      month,
      category: p ? p.category : 'unknown',
      name: p ? p.name : '(không rõ)',
      amount: o.status === 'refunded' ? -amount : amount,
      qtySigned: o.status === 'refunded' ? -o.qty : o.qty,
    };
    rows.push(JSON.parse(JSON.stringify(row)));
  }

  // 2. các tháng có dữ liệu
  const months = [];
  for (const r of rows) if (!months.includes(r.month)) months.push(r.month);
  months.sort();

  // 3. theo danh mục
  const cats = [];
  for (const r of rows) if (!cats.includes(r.category)) cats.push(r.category);
  const grandTotal = rows.reduce((a, r) => a + r.amount, 0);
  const categories = cats.map((c) => {
    const inCat = rows.filter((r) => r.category === c);
    const total = inCat.reduce((a, r) => a + r.amount, 0);
    const byMonth = {};
    for (const m of months) byMonth[m] = rows.filter((r) => r.category === c && r.month === m).reduce((a, r) => a + r.amount, 0);
    const skus = [];
    for (const r of inCat) if (!skus.includes(r.sku)) skus.push(r.sku);
    const prods = skus
      .map((s) => {
        const rs = inCat.filter((r) => r.sku === s);
        return { sku: s, name: rs[0].name, revenue: rs.reduce((a, r) => a + r.amount, 0), qty: rs.reduce((a, r) => a + r.qtySigned, 0) };
      })
      .filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    return {
      category: c,
      total,
      share: grandTotal === 0 ? 0 : Math.round((total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    };
  });
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((m) => {
    const rs = rows.filter((r) => r.month === m);
    const revenue = rs.reduce((a, r) => a + r.amount, 0);
    const refunds = rs.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
    const paid = rs.filter((r) => r.status === 'paid');
    const orderIds = [];
    for (const r of paid) if (!orderIds.includes(r.id)) orderIds.push(r.id);
    const customers = [];
    for (const r of paid) if (!customers.includes(r.customerId)) customers.push(r.customerId);
    running += revenue;
    return { month: m, revenue, refunds, orders: orderIds.length, customers: customers.length, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const custs = [];
  for (const r of rows) if (!custs.includes(r.customerId)) custs.push(r.customerId);
  const top = custs.map((c) => {
    const rs = rows.filter((r) => r.customerId === c);
    const ids = [];
    for (const r of rs) if (r.status === 'paid' && !ids.includes(r.id)) ids.push(r.id);
    return { customerId: c, revenue: rs.reduce((a, r) => a + r.amount, 0), orders: ids.length };
  });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
