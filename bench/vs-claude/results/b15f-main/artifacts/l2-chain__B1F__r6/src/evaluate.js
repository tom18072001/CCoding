// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6. Dùng src/resolve.js (hợp nhất/phân giải dùng chung với check).
import { buildModel, evalTree, toValue } from './resolve.js';

export function evaluate(program) {
  return toValue(evalTree(buildModel(program)));
}
