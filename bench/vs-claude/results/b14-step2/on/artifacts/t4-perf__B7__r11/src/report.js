'use strict';

/**
 * Báo cáo doanh số.
 * orders: [{ id, customerId, sku, qty, unitPrice (xu, số nguyên), date (ISO 8601 có múi giờ), status: 'paid' | 'refunded' | 'cancelled' }]
 *   — mỗi phần tử là MỘT DÒNG của đơn hàng; một đơn (id) có thể có nhiều dòng.
 * products: [{ sku, name, category }]
 * options: { topN = 3, from?: 'YYYY-MM', to?: 'YYYY-MM' } — lọc theo tháng (UTC) của date, bao gồm hai đầu.
 *
 * Hiện thực O(n): gom nhóm bằng Map/Set, giữ nguyên thứ tự cộng dồn và thứ tự xuất hiện
 * của bản gốc (kể cả hiệu ứng JSON round-trip: số không hữu hạn -> null, -0 -> 0).
 */

// Mô phỏng JSON.parse(JSON.stringify(...)) cho giá trị nguyên thủy của một trường.
function j(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
  return v;
}

function buildReport(orders, products, options = {}) {
  const topN = options.topN ?? 3;
  const from = options.from;
  const to = options.to;

  // sku -> sản phẩm đầu tiên khớp (như Array.find với ===; NaN không bao giờ khớp)
  const prodBySku = new Map();
  for (const p of products) {
    const k = p.sku;
    if (k !== k) continue;
    if (!prodBySku.has(k)) prodBySku.set(k, p);
  }

  // 1-5. một lượt: chuẩn hóa dòng + gom nhóm, không tạo object trung gian theo dòng
  const monthSet = new Set();
  const monthCache = new Map(); // chuỗi date hợp lệ -> tháng (parse Date là phần đắt nhất)
  let grandTotal = 0;
  const catMap = new Map(); // category -> { total, byMonth: Map, skus: Map }
  const monthMap = new Map(); // month -> { revenue, refunds, ids, custs }
  const custMap = new Map(); // customerId -> { revenue, ids }

  for (const o of orders) {
    const d = o.date;
    let month;
    if (typeof d === 'string') {
      month = monthCache.get(d);
      if (month === undefined) {
        month = new Date(d).toISOString().slice(0, 7); // ném lỗi nếu date không hợp lệ (không cache)
        monthCache.set(d, month);
      }
    } else {
      month = new Date(d).toISOString().slice(0, 7);
    }
    if (from && month < from) continue;
    if (to && month > to) continue;
    const status = o.status;
    if (status === 'cancelled') continue;
    const sku0 = o.sku;
    const p = sku0 !== sku0 ? undefined : prodBySku.get(sku0);
    const refunded = status === 'refunded';
    const raw = o.qty * o.unitPrice;
    const a = j(refunded ? -raw : raw);
    const qtySigned = j(refunded ? -o.qty : o.qty);
    const category = p ? j(p.category) : 'unknown';
    const sku = j(sku0);
    const customerId = j(o.customerId);

    let mo = monthMap.get(month);
    if (!mo) {
      mo = { revenue: 0, refunds: 0, ids: new Set(), custs: new Set() };
      monthMap.set(month, mo);
      monthSet.add(month);
    }

    grandTotal += a;

    let c = catMap.get(category);
    if (!c) {
      c = { total: 0, byMonth: new Map(), skus: new Map() };
      catMap.set(category, c);
    }
    c.total += a;
    c.byMonth.set(month, (c.byMonth.get(month) || 0) + a);
    let s = c.skus.get(sku);
    if (!s) {
      s = { sku, name: p ? j(p.name) : '(không rõ)', revenue: 0, qty: 0 };
      c.skus.set(sku, s);
    }
    s.revenue += a;
    s.qty += qtySigned;

    mo.revenue += a;
    if (a < 0) mo.refunds -= a;
    if (status === 'paid') {
      const id = j(o.id);
      mo.ids.add(id);
      mo.custs.add(customerId);
      let cu = custMap.get(customerId);
      if (!cu) {
        cu = { revenue: 0, ids: new Set() };
        custMap.set(customerId, cu);
      }
      cu.revenue += a;
      cu.ids.add(id);
    } else {
      let cu = custMap.get(customerId);
      if (!cu) {
        cu = { revenue: 0, ids: new Set() };
        custMap.set(customerId, cu);
      }
      cu.revenue += a;
    }
  }

  const months = Array.from(monthSet);
  months.sort();


  const categories = [];
  for (const [category, c] of catMap) {
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
  const monthly = months.map((m) => {
    const mo = monthMap.get(m);
    running += mo.revenue;
    return { month: m, revenue: mo.revenue, refunds: mo.refunds, orders: mo.ids.size, customers: mo.custs.size, runningTotal: running };
  });

  const top = [];
  for (const [customerId, cu] of custMap) top.push({ customerId, revenue: cu.revenue, orders: cu.ids.size });
  top.sort((a, b) => b.revenue - a.revenue || (a.customerId < b.customerId ? -1 : 1));

  return { months, grandTotal, categories, monthly, topCustomers: top.slice(0, 5) };
}

module.exports = { buildReport };
