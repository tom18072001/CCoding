// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { createMerged } from './merge.js';

export function evaluate(program) {
  const m = createMerged(program);
  return m.evalTarget(m.root);
}
