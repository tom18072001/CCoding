// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildModel, view, toJson } from './model.js';

export function evaluate(program) {
  const model = buildModel(program);
  return toJson(view(model, model.root));
}
