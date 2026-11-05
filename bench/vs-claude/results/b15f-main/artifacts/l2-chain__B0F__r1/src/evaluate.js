// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6. Logic nằm ở merge.js.
import { merge, evaluateMerged } from './merge.js';

export function evaluate(program) {
  return evaluateMerged(merge(program));
}
