'use strict';

/**
 * Báo cáo doanh số (bản tối ưu: một lượt duyệt, dùng Map/Set thay cho quét tuyến tính).
 * Hành vi phải giống hệt bản gốc (xem test/legacy-report.js).
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 */

// Bản gốc đi qua JSON.parse(JSON.stringify(row)): -0 -> 0, NaN/Infinity -> null.
function jsonNum(x) {
  return Number.isFinite(x) ? x + 0 : null;
}

// Mô phỏng JSON.parse(JSON.stringify(v)) cho một giá trị của dòng (đối tượng được sao chép nên
// mỗi dòng có tham chiếu riêng, giống bản gốc khi dùng includes/===).
function norm(v) {
  if (v === null) return v;
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v;
    case 'number':
      return jsonNum(v);
    case 'object': {
      const t = JSON.stringify(v);
      return t === undefined ? undefined : JSON.parse(t);
    }
    case 'bigint':
      return JSON.stringify(v); // ném TypeError như bản gốc
    default:
      return undefined; // undefined, function, symbol: khóa bị bỏ
  }
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sản phẩm: khớp đầu tiên theo sku (như Array.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map(); // chuỗi date -> tháng (tránh tạo Date lặp lại)
  const monthStates = new Map(); // month -> { revenue, refunds, ids, custs }
  const catStates = new Map(); // category -> { total, byMonth, skus }
  const custStates = new Map(); // customerId -> { revenue, ids }
  let grandTotal = 0;

  for (const o of orders) {
    let month;
    const d = o.date;
    if (typeof d === 'string') {
      month = monthCache.get(d);
      if (month === undefined) {
        month = new Date(d).toISOString().slice(0, 7);
        monthCache.set(d, month);
      }
    } else {
      month = new Date(d).toISOString().slice(0, 7);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    const status = o.status;
    if (status === 'cancelled') continue;

    const rawSku = o.sku;
    const p = rawSku !== rawSku ? undefined : prodBySku.get(rawSku); // NaN !== NaN trong Array.find
    const category = norm(p ? p.category : 'unknown');
    const name = norm(p ? p.name : '(không rõ)');
    const raw = o.qty * o.unitPrice;
    const refunded = status === 'refunded';
    const amount = jsonNum(refunded ? -raw : raw);
    const qtySigned = refunded ? jsonNum(-o.qty) : norm(o.qty);
    const sku = norm(rawSku);
    const customerId = norm(o.customerId);
    const id = norm(o.id);

    grandTotal += amount;

    let ms = monthStates.get(month);
    if (!ms) {
      ms = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() };
      monthStates.set(month, ms);
    }
    ms.revenue += amount;
    if (amount < 0) ms.refunds -= amount;
    if (status === 'paid') {
      ms.ids.add(id);
      ms.custs.add(customerId);
    }

    let cs = catStates.get(category);
    if (!cs) {
      cs = { total: 0, byMonth: new Map(), skus: new Map() };
      catStates.set(category, cs);
    }
    cs.total += amount;
    cs.byMonth.set(month, (cs.byMonth.get(month) || 0) + amount);
    let ps = cs.skus.get(sku);
    if (!ps) {
      ps = { sku, name, revenue: 0, qty: 0 };
      cs.skus.set(sku, ps);
    }
    ps.revenue += amount;
    ps.qty += qtySigned;

    let cu = custStates.get(customerId);
    if (!cu) {
      cu = { customerId, revenue: 0, ids: new Set() };
      custStates.set(customerId, cu);
    }
    cu.revenue += amount;
    if (status === 'paid') cu.ids.add(id);
  }

  const months = [...monthStates.keys()].sort();

  const categories = [];
  for (const [c, cs] of catStates) {
    const byMonth = {};
    for (const m of months) byMonth[m] = cs.byMonth.get(m) || 0;
    const prods = [];
    for (const ps of cs.skus.values()) if (ps.revenue > 0) prods.push(ps);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: c,
      total: cs.total,
      share: grandTotal === 0 ? 0 : Math.round((cs.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  let running = 0;
  const monthly = months.map((m) => {
    const ms = monthStates.get(m);
    running += ms.revenue;
    return { month: m, revenue: ms.revenue, refunds: ms.refunds, orders: ms.ids.size, customers: ms.custs.size, runningTotal: running };
  });

  const top = [];
  for (const cu of custStates.values()) top.push({ customerId: cu.customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
