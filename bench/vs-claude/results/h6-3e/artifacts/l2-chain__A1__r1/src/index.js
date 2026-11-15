// Điểm vào: xuất lại API của 4 tầng và hàm compile (SPEC.md mục 8).

export { tokenize } from './lexer.js';
export { parse, parseProject } from './parser.js';
export { check } from './check.js';
export { evaluate } from './evaluate.js';
export * from './diff.js';

import { parseProject } from './parser.js';
import { check } from './check.js';
import { evaluate } from './evaluate.js';

export function compile(files, entry, schema) {
  const r = parseProject(files, entry);
  if (!r.ok) return { ok: false, stage: 'parse', errors: [r.error] };
  const errors = check(r.program, schema);
  if (errors.length > 0) return { ok: false, stage: 'check', errors };
  return { ok: true, config: evaluate(r.program) };
}
