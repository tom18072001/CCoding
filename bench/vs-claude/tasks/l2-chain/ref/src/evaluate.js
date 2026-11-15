import { buildModel } from './core.js';

export function evaluate(program) {
  const m = buildModel(program);
  return m.evalEntry(m.root, new Set());
}
