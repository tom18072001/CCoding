// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { createModel } from './model.js';

export function evaluate(program) {
  const model = createModel(program);
  return model.evalValue(model.root);
}
