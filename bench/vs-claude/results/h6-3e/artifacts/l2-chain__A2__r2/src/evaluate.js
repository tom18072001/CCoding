// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { buildModel, evalTarget } from './model.js';

export function evaluate(program) {
  const model = buildModel(program);
  return evalTarget(model, model.root);
}
