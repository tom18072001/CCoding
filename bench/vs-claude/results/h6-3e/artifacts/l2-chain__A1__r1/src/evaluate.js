// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { buildModel, toJSON } from './merge.js';

export function evaluate(program) {
  const model = buildModel(program);
  return toJSON(model.evalEntry(model.root));
}
