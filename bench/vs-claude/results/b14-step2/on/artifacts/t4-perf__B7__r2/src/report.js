'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Bản tối ưu: một lượt duyệt, gom nhóm bằng Map (O(n)). Giữ đúng thứ tự cộng dồn
 * và thứ tự xuất hiện đầu tiên như bản gốc để kết quả giống hệt.
 */
// Mô phỏng JSON.parse(JSON.stringify(x)) cho giá trị nguyên thủy: số không hữu hạn -> null
// (-0 vào cộng dồn bắt đầu từ 0 nên không ảnh hưởng; khóa Map coi -0 == 0 như includes).
const J = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v + 0 : null) : v);

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sản phẩm: lấy bản ghi đầu tiên theo sku (giống Array.find)
  const prodBySku = new Map();
  for (const p of products) if (!prodBySku.has(p.sku)) prodBySku.set(p.sku, p);
  const findProd = (sku) => (sku !== sku ? undefined : prodBySku.get(sku)); // find dùng ===, NaN không khớp

  const monthAgg = new Map(); // month -> { revenue, refunds, ids:Set, custs:Set }
  const catAgg = new Map(); // category -> { total, byMonth:Map, skus:Map }
  const custAgg = new Map(); // customerId -> { revenue, ids:Set }
  let grandTotal = 0;
  const monthOfDate = new Map(); // chỉ trong phạm vi một lần gọi

  for (const o of orders) {
    let month = typeof o.date === 'string' ? monthOfDate.get(o.date) : undefined;
    if (month === undefined) {
      month = new Date(o.date).toISOString().slice(0, 7);
      if (typeof o.date === 'string') monthOfDate.set(o.date, month);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const p = findProd(o.sku);
    const refunded = o.status === 'refunded';
    let amount = o.qty * o.unitPrice;
    if (refunded) amount = -amount;
    let qtySigned = refunded ? -o.qty : o.qty;
    // bản gốc đi qua JSON.stringify/parse: số không hữu hạn thành null
    amount = J(amount);
    qtySigned = J(qtySigned);
    const category = p ? J(p.category) : 'unknown';
    const name = p ? J(p.name) : '(không rõ)';
    const sku = J(o.sku);
    const id = J(o.id);
    const customerId = J(o.customerId);
    const paid = o.status === 'paid';

    grandTotal += amount;

    let m = monthAgg.get(month);
    if (!m) monthAgg.set(month, (m = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() }));
    m.revenue += amount;
    if (amount < 0) m.refunds -= amount;
    if (paid) {
      m.ids.add(id);
      m.custs.add(customerId);
    }

    let c = catAgg.get(category);
    if (!c) catAgg.set(category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total += amount;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + amount);
    let s = c.skus.get(sku);
    if (!s) c.skus.set(sku, (s = { sku, name, revenue: 0, qty: 0 }));
    s.revenue += amount;
    s.qty += qtySigned;

    let u = custAgg.get(customerId);
    if (!u) custAgg.set(customerId, (u = { customerId, revenue: 0, ids: new Set() }));
    u.revenue += amount;
    if (paid) u.ids.add(id);
  }

  const months = [...monthAgg.keys()];
  months.sort();

  const categories = [];
  for (const [category, c] of catAgg) {
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
  for (const u of custAgg.values()) top.push({ customerId: u.customerId, revenue: u.revenue, orders: u.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
