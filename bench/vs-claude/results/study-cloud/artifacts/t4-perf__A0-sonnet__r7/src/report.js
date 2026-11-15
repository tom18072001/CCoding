'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Bản tối ưu: một lượt duyệt + Map, giữ nguyên hành vi của bản cũ
 * (kể cả việc JSON round-trip: số không hữu hạn -> null, -0 -> 0, undefined bị bỏ).
 */

// Mô phỏng JSON.parse(JSON.stringify(x)) cho giá trị nguyên thủy dùng trong báo cáo.
function jn(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (giống Array.prototype.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map();
  const rows = [];
  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const amount = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    rows.push({
      id: jn(o.id),
      customerId: jn(o.customerId),
      sku: jn(o.sku),
      status: o.status,
      month,
      category: p ? jn(p.category) : 'unknown',
      name: p ? jn(p.name) : '(không rõ)',
      amount: jn(refunded ? -amount : amount),
      qtySigned: jn(refunded ? -o.qty : o.qty),
    });
  }

  // 2. các tháng
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const monthIdx = new Map(months.map((m, i) => [m, i]));

  // 3 + 4 + 5: gom nhóm trong một lượt
  let grandTotal = 0;
  const catMap = new Map(); // category -> {total, byMonth[], prods Map}
  const monMap = months.map(() => ({ revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
  const custMap = new Map(); // customerId -> {revenue, ids}
  for (const r of rows) {
    grandTotal += r.amount;
    let c = catMap.get(r.category);
    if (!c) {
      c = { total: 0, byMonth: new Array(months.length).fill(0), prods: new Map() };
      catMap.set(r.category, c);
    }
    c.total += r.amount;
    const mi = monthIdx.get(r.month);
    c.byMonth[mi] += r.amount;
    let pr = c.prods.get(r.sku);
    if (!pr) {
      pr = { sku: r.sku, name: r.name, revenue: 0, qty: 0 };
      c.prods.set(r.sku, pr);
    }
    pr.revenue += r.amount;
    pr.qty += r.qtySigned;

    const mo = monMap[mi];
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

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    months.forEach((m, i) => { byMonth[m] = c.byMonth[i]; });
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

  let running = 0;
  const monthly = months.map((m, i) => {
    const mo = monMap[i];
    running += mo.revenue;
    return { month: m, revenue: mo.revenue, refunds: mo.refunds, orders: mo.ids.size, customers: mo.custs.size, runningTotal: running };
  });

  const top = [];
  for (const cu of custMap.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
