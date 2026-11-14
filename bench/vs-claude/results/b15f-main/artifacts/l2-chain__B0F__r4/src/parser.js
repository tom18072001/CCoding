// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
//
// HỢP ĐỒNG AST (D4 — đúng SPEC §2, không có trường thừa). Mọi nút: { type, line, column, ... }
//   File    { body: Stmt[] }                 luôn 1:1
//   Assign  { key, value: Value }            vị trí token khóa
//   Block   { key, body: Stmt[] }            vị trí token khóa
//   Include { path: string }                 vị trí từ khóa include
//   Const   { name, value: Value }           vị trí từ khóa const (chỉ ở cấp cao nhất)
//   Number { value } | Bool { value } | Null | String { parts } | Array { items }
//   Part: { type:'Text', value } (không vị trí) | { type:'Ref', path, const, line, column }
// parse(source)            -> { ok:true, ast } | { ok:false, error:{ code, message, line, column } }
// parseProject(files, e)   -> { ok:true, program:{ entry, files:{[tên]:File}} }
//                           | { ok:false, error:{ code, message, file, line, column } }
// Lỗi được trả về, không ném.

import { tokenize } from './lexer.js';

class ParseError {
  constructor(code, tok) {
    this.code = code;
    this.line = tok.line;
    this.column = tok.column;
  }
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return {
        ok: false,
        error: { code: e.code, message: `Lỗi cú pháp (${e.code})`, line: e.line, column: e.column },
      };
    }
    throw e;
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const bad = (tok) =>
    new ParseError(tok.type === 'eof' ? 'PARSE_UNEXPECTED_EOF' : 'PARSE_UNEXPECTED_TOKEN', tok);
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function parseValue() {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'number') return { type: 'Number', ...pos, value: t.value };
    if (t.type === 'string') {
      const parts = t.value.map((x) =>
        x.type === 'Text' ? { type: 'Text', value: x.value } : { ...x, path: [...x.path] },
      );
      return { type: 'String', ...pos, parts };
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        return { type: 'Bool', ...pos, value: t.value === 'true' };
      }
      if (t.value === 'null') return { type: 'Null', ...pos };
    }
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) {
          next();
          break;
        }
        items.push(parseValue());
        const s = next();
        if (isPunct(s, ']')) break;
        if (!isPunct(s, ',')) throw bad(s);
      }
      return { type: 'Array', ...pos, items };
    }
    throw bad(t);
  }

  function parseStmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw bad(t);
      }
      if (isPunct(t, '}') && !top) return body;
      next();
      const pos = { line: t.line, column: t.column };
      if (t.type === 'ident') {
        const s = next();
        if (isPunct(s, '=')) {
          body.push({ type: 'Assign', ...pos, key: t.value, value: parseValue() });
        } else if (isPunct(s, '{')) {
          const inner = parseStmts(false);
          next(); // '}'
          body.push({ type: 'Block', ...pos, key: t.value, body: inner });
        } else {
          throw bad(s);
        }
      } else if (t.type === 'keyword' && t.value === 'include') {
        const s = next();
        if (s.type !== 'string') throw bad(s);
        if (s.value.some((x) => x.type === 'Ref')) throw new ParseError('PARSE_BAD_INCLUDE', s);
        body.push({ type: 'Include', ...pos, path: s.value.map((x) => x.value).join('') });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', t);
        const n = next();
        if (n.type !== 'ident') throw bad(n);
        const eq = next();
        if (!isPunct(eq, '=')) throw bad(eq);
        body.push({ type: 'Const', ...pos, name: n.value, value: parseValue() });
      } else {
        throw bad(t);
      }
    }
  }

  const body = parseStmts(true);
  return { type: 'File', line: 1, column: 1, body };
}

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (n) => Object.hasOwn(files, n);
  if (!has(entry)) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ENTRY_NOT_FOUND',
        message: `Không có tệp vào: ${entry}`,
        file: entry,
        line: 1,
        column: 1,
      },
    };
  }
  const parsed = new Map();
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = {
        code: r.error.code,
        message: r.error.message,
        file: name,
        line: r.error.line,
        column: r.error.column,
      };
      return false;
    }
    parsed.set(name, r.ast);
    for (const inc of collectIncludes(r.ast.body, [])) {
      if (has(inc) && !parsed.has(inc) && !visit(inc)) return false;
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: Object.fromEntries(parsed) } };
}
