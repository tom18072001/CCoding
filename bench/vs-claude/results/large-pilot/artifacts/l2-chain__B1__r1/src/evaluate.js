// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { buildModel } from './model.js';

export function evaluate(program) {
  const m = buildModel(program);
  return m.evalTarget(m.root);
}
