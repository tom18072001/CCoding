// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { merge, evalTarget } from './merge.js';

export function evaluate(program) {
  const ctx = merge(program);
  return evalTarget(ctx, ctx.root);
}
