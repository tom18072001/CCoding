// Điểm vào: xuất lại API của 4 tầng và hàm compile (SPEC.md mục 8).

export { tokenize } from './lexer.js';
export { parse, parseProject } from './parser.js';
export { check } from './check.js';
export { evaluate } from './evaluate.js';
export * from './diff.js';

export function compile(files, entry, schema) {
  throw new Error('chưa làm: compile');
}
