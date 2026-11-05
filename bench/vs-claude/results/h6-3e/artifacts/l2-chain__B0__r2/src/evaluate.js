// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { evaluateAnnotated, cloneJson } from './merge.js';

export function evaluate(program) {
  return cloneJson(evaluateAnnotated(program).v);
}
