// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { mergeProgram, evaluateTarget } from './merge.js';

export function evaluate(program) {
  const merged = mergeProgram(program);
  return evaluateTarget(merged, merged.root);
}
