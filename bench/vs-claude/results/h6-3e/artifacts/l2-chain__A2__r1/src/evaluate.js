// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildContext, evalMv } from './merge.js';

export function evaluate(program) {
  const ctx = buildContext(program);
  return evalMv(ctx, ctx.root);
}
