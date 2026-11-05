'use strict';
// Sinh dữ liệu giả lập tất định (dùng cho test và đo hiệu năng).

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const CATS = ['Đồ uống', 'Văn phòng phẩm', 'Gia dụng', 'Điện tử', 'Thời trang', 'Sách', 'Đồ chơi', 'Mỹ phẩm', 'Thực phẩm', 'Thể thao'];

function generate({ orders = 1000, products = 200, customers = 300, seed = 1 } = {}) {
  const r = rng(seed);
  const pick = (n) => Math.floor(r() * n);
  const prods = [];
  for (let i = 0; i < products; i++) prods.push({ sku: `SKU${String(i).padStart(5, '0')}`, name: `Sản phẩm ${i}`, category: CATS[pick(CATS.length)] });
  const rows = [];
  let orderNo = 0;
  while (rows.length < orders) {
    orderNo++;
    const lines = 1 + pick(4);
    const customerId = `C${String(pick(customers)).padStart(4, '0')}`;
    const month = 1 + pick(12);
    const day = 1 + pick(28);
    const hour = pick(24);
    const tz = r() < 0.3 ? '+07:00' : 'Z';
    const date = `2025-${String(month).padStart(2, '0')}-${String(day === 28 && r() < 0.5 ? (month === 2 ? 28 : 30) : day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:15:00${tz}`;
    const roll = r();
    const status = roll < 0.85 ? 'paid' : roll < 0.95 ? 'refunded' : 'cancelled';
    for (let l = 0; l < lines && rows.length < orders; l++) {
      const unknown = r() < 0.01;
      rows.push({
        id: `O${orderNo}`,
        customerId,
        sku: unknown ? `GONE${pick(50)}` : prods[pick(products)].sku,
        qty: 1 + pick(5),
        unitPrice: 500 + pick(200) * 250,
        date,
        status,
      });
    }
  }
  return { orders: rows, products: prods };
}

module.exports = { generate, rng };
