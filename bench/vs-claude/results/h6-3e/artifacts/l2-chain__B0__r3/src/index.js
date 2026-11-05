// Điểm vào: xuất lại API của 4 tầng và hàm compile (SPEC.md mục 8).
import { parseProject } from './parser.js';
import { check } from './check.js';
import { evaluate } from './evaluate.js';

export { tokenize } from './lexer.js';
export { parse, parseProject } from './parser.js';
export { check } from './check.js';
export { evaluate } from './evaluate.js';
export * from './diff.js';

export function compile(files, entry, schema) {
  const p = parseProject(files, entry);
  if (!p.ok) return { ok: false, stage: 'parse', errors: [p.error] };
  const errors = check(p.program, schema);
  if (errors.length) return { ok: false, stage: 'check', errors };
  return { ok: true, config: evaluate(p.program) };
}
