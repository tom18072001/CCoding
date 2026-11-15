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

  // JSON round-trip của bản gốc: -0 -> 0, NaN/Infinity -> null
  const norm = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : null) : x);

  // bản gốc dùng find() => lấy sản phẩm đầu tiên theo sku
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthIdx = new Map();
  const months = [];
  const mons = [], amounts = [], qtys = [], cats = [], names = [], skus = [], custs = [], ids = [], paids = [];
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    mons.push(month);
    amounts.push(norm(refunded ? -amount : amount));
    qtys.push(norm(refunded ? -o.qty : o.qty));
    cats.push(p ? p.category : 'unknown');
    names.push(p ? p.name : '(không rõ)');
    skus.push(o.sku);
    custs.push(o.customerId);
    ids.push(o.id);
    paids.push(o.status === 'paid');
    if (!monthIdx.has(month)) { monthIdx.set(month, months.length); months.push(month); }
  }
  const n = mons.length;
  const sortedMonths = months.slice().sort();

  // gom nhóm một lượt, giữ thứ tự dòng gốc trong từng nhóm
  let grandTotal = 0;
  const catMap = new Map();
  const monMap = new Map();
  const custMap = new Map();
  for (let i = 0; i < n; i++) {
    const a = amounts[i], c = cats[i], m = mons[i], cu = custs[i];
    grandTotal += a;

    let cg = catMap.get(c);
    if (!cg) catMap.set(c, (cg = { total: 0, byMonth: new Map(), prods: new Map() }));
    cg.total += a;
    cg.byMonth.set(m, (cg.byMonth.get(m) || 0) + a);
    let pg = cg.prods.get(skus[i]);
    if (!pg) cg.prods.set(skus[i], (pg = { sku: skus[i], name: names[i], revenue: 0, qty: 0 }));
    pg.revenue += a;
    pg.qty += qtys[i];

    let mg = monMap.get(m);
    if (!mg) monMap.set(m, (mg = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    mg.revenue += a;
    if (a < 0) mg.refunds -= a;
    if (paids[i]) { mg.ids.add(ids[i]); mg.custs.add(cu); }

    let ug = custMap.get(cu);
    if (!ug) custMap.set(cu, (ug = { customerId: cu, revenue: 0, ids: new Set() }));
    ug.revenue += a;
    if (paids[i]) ug.ids.add(ids[i]);
  }

  const categories = [];
  for (const [c, g] of catMap) {
    const byMonth = {};
    for (const m of sortedMonths) byMonth[m] = g.byMonth.get(m) || 0;
    const prods = [];
    for (const p of g.prods.values()) if (p.revenue > 0) prods.push(p);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: c,
      total: g.total,
      share: grandTotal === 0 ? 0 : Math.round((g.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = sortedMonths.map((m) => {
    const g = monMap.get(m);
    running += g.revenue;
    return { month: m, revenue: g.revenue, refunds: g.refunds, orders: g.ids.size, customers: g.custs.size, runningTotal: running };
  });

  const top = [];
  for (const g of custMap.values()) top.push({ customerId: g.customerId, revenue: g.revenue, orders: g.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months: sortedMonths, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
