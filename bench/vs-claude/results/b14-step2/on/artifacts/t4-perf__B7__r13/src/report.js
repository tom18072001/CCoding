'use strict';

/**
 * Báo cáo doanh số (bản tối ưu: một lượt duyệt, Map/Set thay cho find/includes/filter lồng nhau).
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Giữ nguyên hành vi bản cũ, gồm cả: sản phẩm trùng sku lấy bản đầu tiên; số không hữu hạn
 * (NaN/Infinity) bị coi là 0 và -0 thành 0 (vì bản cũ đi qua JSON); thứ tự cộng dồn theo thứ tự dòng.
 */
function num(x) {
  return Number.isFinite(x) ? x + 0 : 0;
}

// Giá trị sau JSON.parse(JSON.stringify(...)): số không hữu hạn -> null, -0 -> 0 (undefined giữ nguyên).
function jv(x) {
  return typeof x === 'number' ? (Number.isFinite(x) ? x + 0 : null) : x;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map();
  const monthSet = new Set();
  let grandTotal = 0;
  const catMap = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custMap = new Map(); // customerId -> { revenue, ids:Set }

  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    // find dùng === nên sku NaN không bao giờ khớp (Map thì khớp)
    const p = o.sku !== o.sku ? undefined : prodBySku.get(o.sku);
    const category = p ? jv(p.category) : 'unknown';
    const name = p ? jv(p.name) : '(không rõ)';
    const sku = jv(o.sku);
    const id = jv(o.id);
    const customerId = jv(o.customerId);
    const raw = o.qty * o.unitPrice;
    const refunded = o.status === 'refunded';
    const amount = num(refunded ? -raw : raw);
    const qtySigned = jv(refunded ? -o.qty : o.qty); // giữ nguyên ngữ nghĩa cộng của bản cũ (chuỗi/null/undefined)
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = catMap.get(category);
    if (!c) catMap.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
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

    let cu = custMap.get(customerId);
    if (!cu) custMap.set(customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue += amount;
    if (paid) cu.ids.add(id);
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of catMap) {
    const byMonth = {};
    for (const mo of months) byMonth[mo] = c.byMonth.get(mo) || 0;
    const prods = [];
    for (const s of c.skus.values()) if (s.revenue > 0) prods.push(s);
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
  const monthly = months.map((mo) => {
    const m = monthAgg.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custMap) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
