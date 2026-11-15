// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildModel } from './core.js';

export function evaluate(program) {
  const model = buildModel(program);
  return model.evalM(model.root);
}
