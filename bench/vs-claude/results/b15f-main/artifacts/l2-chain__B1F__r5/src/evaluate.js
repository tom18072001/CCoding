// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6. Logic dùng chung nằm ở merge.js.

import { buildContext, evalCell } from './merge.js';

export function evaluate(program) {
  const ctx = buildContext(program);
  return evalCell(ctx, ctx.root);
}
