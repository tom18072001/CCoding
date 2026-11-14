'use strict';
// Đo thời gian buildReport trên bộ dữ liệu lớn: node bench/run.js [số dòng]
const { generate } = require('../src/gen');
const { buildReport } = require('../src/report');
const n = Number(process.argv[2] || 200000);
const data = generate({ orders: n, products: 2000, customers: 3000, seed: 42 });
const t0 = process.hrtime.bigint();
const rep = buildReport(data.orders, data.products, { topN: 5 });
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`${n} dòng: ${ms.toFixed(0)} ms · ${rep.months.length} tháng · ${rep.categories.length} danh mục · tổng ${rep.grandTotal}`);
