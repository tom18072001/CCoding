// Điểm vào: xuất lại API của 4 tầng và hàm compile (SPEC.md mục 8).

import { parseProject } from './parser.js';
import { check } from './check.js';
import { evaluate } from './evaluate.js';

export { tokenize } from './lexer.js';
export { parse, parseProject } from './parser.js';
export { check } from './check.js';
export { evaluate } from './evaluate.js';
export {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from './diff.js';

export function compile(files, entry, schema) {
  const parsed = parseProject(files, entry);
  if (!parsed.ok) return { ok: false, stage: 'parse', errors: [parsed.error] };
  const errors = check(parsed.program, schema);
  if (errors.length) return { ok: false, stage: 'check', errors };
  return { ok: true, config: evaluate(parsed.program) };
}
