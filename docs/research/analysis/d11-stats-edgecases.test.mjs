// node --test docs/research/analysis/d11-stats-edgecases.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runEdgeCases } from './d11-stats-edgecases.mjs';

const rows = runEdgeCases();
test('đủ 12 ca F1–F12, mỗi ca có kết quả so với S2', () => {
  assert.deepEqual(rows.map((r) => r.id), Array.from({ length: 12 }, (_, i) => `F${i + 1}`));
  for (const r of rows) assert.equal(r.s2, true, `${r.id}: đầu ra thật lệch dự đoán S2`);
});
test('các ca lệch đăng ký đã biết: F1 (T-1), F7 (B-1), F11 (S-1), F12 (T-2); ca khác khớp', () => {
  const lech = rows.filter((r) => r.dk === false).map((r) => r.id);
  assert.deepEqual(lech, ['F1', 'F7', 'F11', 'F12']);
});
