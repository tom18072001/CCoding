// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { Model, toValue } from './merge.js';

export function evaluate(program) {
  return toValue(new Model(program).annotateRoot());
}
