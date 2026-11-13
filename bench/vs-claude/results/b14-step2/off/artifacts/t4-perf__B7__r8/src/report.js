'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Bản tối ưu: một lượt duyệt, dùng Map/Set thay cho find/includes/filter lồng nhau.
 * Thứ tự cộng dồn và thứ tự xuất hiện đầu tiên được giữ nguyên như bản cũ.
 */
function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // find() trả về phần tử ĐẦU TIÊN khớp sku → chỉ giữ lần xuất hiện đầu
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);

  const monthCache = new Map();
  const monthSet = new Set();
  const cats = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const mon = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const custs = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;

  for (const o of orders) {
    let month = monthCache.get(o.date);
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7); // ném lỗi với ngày sai, như cũ
      monthCache.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = prodBySku.get(o.sku);
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = o.status === 'refunded';
    const raw = o.qty * o.unitPrice;
    // "+ 0" chuẩn hóa -0 thành 0 (bản cũ đi qua JSON nên -0 → 0);
    // NaN/Infinity thành null qua JSON và được cộng như 0
    let amount = (refunded ? -raw : raw) + 0;
    if (!Number.isFinite(amount)) amount = 0;
    let qtySigned = (refunded ? -o.qty : o.qty) + 0;
    if (!Number.isFinite(qtySigned)) qtySigned = 0;
    const paid = o.status === 'paid';

    monthSet.add(month);
    grandTotal += amount;

    let c = cats.get(category);
    if (c === undefined) {
      c = { total: 0, byMonth: new Map(), skus: new Map() };
      cats.set(category, c);
    }
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(o.sku);
    if (s === undefined) {
      s = { sku: o.sku, name, revenue: 0, qty: 0 };
      c.skus.set(o.sku, s);
    }
    s.revenue += amount;
    s.qty += qtySigned;

    let m = mon.get(month);
    if (m === undefined) {
      m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() };
      mon.set(month, m);
    }
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(o.id);
      m.custs.add(o.customerId);
    }

    let cu = custs.get(o.customerId);
    if (cu === undefined) {
      cu = { revenue: 0, ids: new Set() };
      custs.set(o.customerId, cu);
    }
    cu.revenue += amount;
    if (paid) cu.ids.add(o.id);
  }

  const months = [...monthSet].sort();

  const categories = [];
  for (const [category, c] of cats) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.get(m) || 0;
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
    const m = mon.get(mo);
    running += m.revenue;
    return { month: mo, revenue: m.revenue, refunds: m.refunds, orders: m.ids.size, customers: m.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custs) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
