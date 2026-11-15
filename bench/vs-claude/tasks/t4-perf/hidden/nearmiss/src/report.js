'use strict';

const monthCache = new Map();
function utcMonth(date) {
  let m = monthCache.get(date);
  if (m === undefined) {
    m = new Date(date).toISOString().slice(0, 7);
    monthCache.set(date, m);
  }
  return m;
}

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;
  const bySku = new Map();
  for (const p of products) if (!bySku.has(p.sku)) bySku.set(p.sku, p);

  const monthSet = new Set();
  const catOrder = [];
  const cats = new Map(); // category -> { total, byMonth: Map, prods: Map(sku -> {name, revenue, qty}), prodOrder: [] }
  const mon = new Map(); // month -> { revenue, refunds, orders:Set, customers:Set }
  const custOrder = [];
  const custs = new Map(); // customerId -> { revenue, orders:Set }
  let grandTotal = 0;

  for (const o of orders) {
    if (o.status === 'cancelled') {
      // vẫn phải kiểm tra date hợp lệ như bản cũ (new Date(...).toISOString() ném lỗi với ngày sai)
      utcMonth(o.date);
      continue;
    }
    const month = utcMonth(o.date);
    if (from && month < from) continue;
    if (to && month > to) continue;
    const p = bySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const base = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = refunded ? -base : base;
    const qtySigned = refunded ? -o.qty : o.qty;
    grandTotal += amount;
    monthSet.add(month);

    let c = cats.get(category);
    if (!c) {
      c = { total: 0, byMonth: new Map(), prods: new Map() };
      cats.set(category, c);
      catOrder.push(category);
    }
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) ?? 0) + amount);
    let pr = c.prods.get(o.sku);
    if (!pr) c.prods.set(o.sku, (pr = { sku: o.sku, name, revenue: 0, qty: 0 }));
    pr.revenue += amount;
    pr.qty += qtySigned;

    let m = mon.get(month);
    if (!m) mon.set(month, (m = { revenue: 0, refunds: 0, orders: new Set(), customers: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (o.status === 'paid') {
      m.orders.add(o.id);
      m.customers.add(o.customerId);
    }

    let cu = custs.get(o.customerId);
    if (!cu) {
      custs.set(o.customerId, (cu = { revenue: 0, orders: new Set() }));
      custOrder.push(o.customerId);
    }
    cu.revenue += amount;
    if (o.status === 'paid') cu.orders.add(o.id);
  }

  const months = [...monthSet].sort();
  const categories = catOrder.map((category) => {
    const c = cats.get(category);
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) ?? 0;
    const prods = [...c.prods.values()].filter((p) => p.revenue >= 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    return {
      category,
      total: c.total,
      share: grandTotal === 0 ? 0 : Math.round((c.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN).map((p) => ({ sku: p.sku, name: p.name, revenue: p.revenue, qty: p.qty })),
    };
  });
  categories.sort((a, b) => b.total - a.total || cmpStr(a.category, b.category));

  let running = 0;
  const monthly = months.map((month) => {
    const m = mon.get(month);
    running += m.revenue;
    return { month, revenue: m.revenue, refunds: m.refunds, orders: m.orders.size, customers: m.customers.size, runningTotal: running };
  });

  const top = custOrder.map((customerId) => {
    const cu = custs.get(customerId);
    return { customerId, revenue: cu.revenue, orders: cu.orders.size };
  });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
