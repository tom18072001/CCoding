const path = require('path');
const root = process.cwd();
const { generate } = require(path.join(root, 'src', 'gen'));
const { buildReport: N } = require(path.join(root, 'src', 'report'));
const { buildReport: L } = require(path.join(root, 'test', 'fixtures', 'report.legacy'));
const assert = require('assert');
const opts = [{}, { topN: 1 }, { topN: 10, from: '2025-03', to: '2025-09' }, { from: '2025-12' }, { to: '2025-01', topN: 0 }, { from: '2025-06', to: '2025-06' }, { from: '2026-01' }];
function run(g, o) {
  const a = L(g.orders, g.products, o), b = N(g.orders, g.products, o);
  assert.deepStrictEqual(b, a);
  assert.strictEqual(JSON.stringify(b), JSON.stringify(a));
  assert.strictEqual(Object.is(b.grandTotal, a.grandTotal), true);
}
let n = 0;
for (let seed = 1; seed <= 20; seed++) {
  const size = 5000 + (seed * 797) % 15001;
  const g = generate({ orders: size, products: 50 + seed * 10, customers: 100 + seed * 20, seed: seed * 7919 });
  if (seed % 3 === 0) g.products.push({ ...g.products[0], name: 'dup', category: 'X' });
  if (seed % 4 === 0) g.orders.slice(0, 300).forEach((o, i) => { if (i % 3 === 0) o.qty = 0; if (i % 5 === 0) o.unitPrice = 0; });
  if (seed % 5 === 0) delete g.products[1].category;
  for (const o of opts) { run(g, o); n++; }
}
console.log('ok 20 seeds', n, 'comparisons');
const g = generate({ orders: 50 }); g.orders[10].date = 'not-a-date';
let e1, e2; try { L(g.orders, g.products) } catch (e) { e1 = e } try { N(g.orders, g.products) } catch (e) { e2 = e }
assert(e1 && e2 && e1.constructor === e2.constructor && e1.message === e2.message); console.log('invalid date same error:', e1.message);
if (process.argv[2] === 'big') {
  const G = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  let t = Date.now(); const a = L(G.orders, G.products); console.log('legacy ms', Date.now() - t);
  t = Date.now(); const b = N(G.orders, G.products); console.log('new ms', Date.now() - t);
  assert.deepStrictEqual(b, a); assert.strictEqual(JSON.stringify(b), JSON.stringify(a)); console.log('big identical');
}
