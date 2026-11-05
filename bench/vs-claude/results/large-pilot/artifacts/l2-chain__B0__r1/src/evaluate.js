// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { buildProject, evalLoc, locToJson } from './merge.js';

export function evaluate(program) {
  const ctx = buildProject(program);
  return locToJson(evalLoc(ctx, ctx.root));
}
