// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildModel, evalTarget, toJson } from './model.js';

export function evaluate(program) {
  const model = buildModel(program);
  return toJson(evalTarget(model, { kind: 'obj', obj: model.root }));
}
