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

  // Tra cứu sản phẩm: sku trùng -> lấy dòng đầu tiên (như Array.find). NaN không bao giờ === nên bỏ qua.
  const pmap = new Map();
  for (const p of products) {
    const k = p.sku;
    if (k === k && !pmap.has(k)) pmap.set(k, p);
  }
  // Giá trị "an toàn": JSON round-trip không làm đổi giá trị.
  const plain = (v) => {
    const t = typeof v;
    if (t === 'string' || t === 'boolean' || t === 'undefined' || v === null) return true;
    return t === 'number' && Number.isFinite(v) && !(v === 0 && 1 / v < 0);
  };

  // 1. chuẩn hóa từng dòng
  const rows = [];
  for (const o of orders) {
    const month = new Date(o.date).toISOString().slice(0, 7);
    if (from && month < from) continue;
    if (to && month > to) continue;
    if (o.status === 'cancelled') continue;
    const sk = o.sku;
    const p = sk === sk ? pmap.get(sk) : undefined;
    const category = p ? p.category : 'unknown';
    const name = p ? p.name : '(không rõ)';
    const refunded = o.status === 'refunded';
    const amount = o.qty * o.unitPrice;
    if (
      typeof o.qty === 'number' && Number.isFinite(o.qty) &&
      plain(o.id) && plain(o.customerId) && plain(sk) && plain(o.status) &&
      plain(category) && plain(name)
    ) {
      // đường nhanh: tương đương JSON.parse(JSON.stringify(row))
      const a = refunded ? -amount : amount;
      rows.push({
        id: o.id,
        customerId: o.customerId,
        sku: sk,
        status: o.status,
        month,
        category,
        name,
        amount: Number.isFinite(a) ? a + 0 : null,
        qtySigned: (refunded ? -o.qty : o.qty) + 0,
      });
    } else {
      const row = {
        ...o,
        month,
        category,
        name,
        amount: refunded ? -amount : amount,
        qtySigned: refunded ? -o.qty : o.qty,
      };
      rows.push(JSON.parse(JSON.stringify(row)));
    }
  }

  // 2. gom nhóm một lượt (cộng tuần tự theo thứ tự dòng)
  const monthSet = new Set();
  const catMap = new Map(); // category -> {total, byMonth: Map, skus: Map}
  const monthMap = new Map(); // month -> {revenue, refunds, orderIds:Set, customers:Set}
  const custMap = new Map(); // customerId -> {revenue, ids:Set}
  let grandTotal = 0;
  for (const r of rows) {
    const m = r.month;
    monthSet.add(m);
    grandTotal = grandTotal + r.amount;

    let c = catMap.get(r.category);
    if (!c) catMap.set(r.category, (c = { total: 0, byMonth: new Map(), skus: new Map() }));
    c.total = c.total + r.amount;
    c.byMonth.set(m, (c.byMonth.has(m) ? c.byMonth.get(m) : 0) + r.amount);
    let s = c.skus.get(r.sku);
    if (!s) c.skus.set(r.sku, (s = { sku: r.sku, name: r.name, revenue: 0, qty: 0 }));
    s.revenue = s.revenue + r.amount;
    s.qty = s.qty + r.qtySigned;

    let mo = monthMap.get(m);
    if (!mo) monthMap.set(m, (mo = { revenue: 0, refunds: 0, orderIds: new Set(), customers: new Set() }));
    mo.revenue = mo.revenue + r.amount;
    if (r.amount < 0) mo.refunds = mo.refunds - r.amount;

    let cu = custMap.get(r.customerId);
    if (!cu) custMap.set(r.customerId, (cu = { revenue: 0, ids: new Set() }));
    cu.revenue = cu.revenue + r.amount;

    if (r.status === 'paid') {
      mo.orderIds.add(r.id);
      mo.customers.add(r.customerId);
      cu.ids.add(r.id);
    }
  }

  const months = [...monthSet];
  months.sort();

  // 3. theo danh mục
  const categories = [];
  for (const [cat, c] of catMap) {
    const byMonth = {};
    for (const m of months) byMonth[m] = c.byMonth.has(m) ? c.byMonth.get(m) : 0;
    const prods = [...c.skus.values()].filter((p) => p.revenue > 0);
    prods.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
    categories.push({
      category: cat,
      total: c.total,
      share: grandTotal === 0 ? 0 : Math.round((c.total / grandTotal) * 10000) / 10000,
      byMonth,
      topProducts: prods.slice(0, topN),
    });
  }
  categories.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  // 4. theo tháng
  let running = 0;
  const monthly = months.map((m) => {
    const mo = monthMap.get(m);
    running += mo.revenue;
    return { month: m, revenue: mo.revenue, refunds: mo.refunds, orders: mo.orderIds.size, customers: mo.customers.size, runningTotal: running };
  });

  // 5. khách hàng doanh thu cao nhất
  const top = [];
  for (const [cid, cu] of custMap) top.push({ customerId: cid, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
