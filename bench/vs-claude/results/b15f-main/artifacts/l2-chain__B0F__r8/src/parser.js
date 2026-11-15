// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError {
  constructor(code, message, tok) {
    this.code = code;
    this.message = message;
    this.line = tok.line;
    this.column = tok.column;
  }
}

function describe(tok) {
  return tok.type === 'eof' ? 'hết tệp' : `${tok.type} ${JSON.stringify(tok.value)}`;
}

function unexpected(tok, expect) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đang đợi ${expect}`, tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', `Gặp ${describe(tok)}, đang đợi ${expect}`, tok);
}

function buildAst(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  // Không bao giờ đi quá token eof (eof luôn gây lỗi trước khi bị tiêu thụ).
  const next = () => tokens[p < tokens.length - 1 ? p++ : p];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const isKw = (t, v) => t.type === 'keyword' && t.value === v;

  function value() {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'number') return { type: 'Number', value: t.value, ...pos };
    if (t.type === 'string') return { type: 'String', parts: t.value, ...pos };
    if (isKw(t, 'true')) return { type: 'Bool', value: true, ...pos };
    if (isKw(t, 'false')) return { type: 'Bool', value: false, ...pos };
    if (isKw(t, 'null')) return { type: 'Null', ...pos };
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', items, ...pos };
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmt(depth) {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'ident') {
      const s = next();
      if (isPunct(s, '=')) return { type: 'Assign', key: t.value, value: value(), ...pos };
      if (isPunct(s, '{')) return { type: 'Block', key: t.value, body: stmts(depth + 1), ...pos };
      throw unexpected(s, "'=' hoặc '{'");
    }
    if (isKw(t, 'include')) {
      const s = next();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos };
    }
    if (isKw(t, 'const')) {
      if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const nm = next();
      if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
      const eq = next();
      if (!isPunct(eq, '=')) throw unexpected(eq, "'='");
      return { type: 'Const', name: nm.value, value: value(), ...pos };
    }
    throw unexpected(t, 'câu lệnh');
  }

  // depth 0: tới eof; depth > 0: tới '}' (đã đọc '{').
  function stmts(depth) {
    const body = [];
    for (;;) {
      const t = peek();
      if (depth > 0) {
        if (isPunct(t, '}')) { next(); return body; }
        if (t.type === 'eof') throw unexpected(t, "'}'");
      } else if (t.type === 'eof') {
        return body;
      }
      body.push(stmt(depth));
    }
  }

  const body = stmts(0);
  return { type: 'File', body, line: 1, column: 1 };
}

/**
 * @param {string} source
 * @returns {{ok: true, ast: object} | {ok: false, error: {code: string, message: string, line: number, column: number}}}
 */
export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: buildAst(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

/**
 * @param {Record<string,string>} files
 * @param {string} entry
 * @returns {{ok: true, program: {entry: string, files: Record<string, object>}} | {ok: false, error: object}}
 */
export function parseProject(files, entry) {
  const has = (name) => Object.hasOwn(files, name);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  const seen = new Set();
  let failure = null;
  const visit = (name) => {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) { failure = { ...r.error, file: name }; return false; }
    Object.defineProperty(out, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const path of collectIncludes(r.ast.body, [])) {
      if (has(path) && !seen.has(path)) {
        if (!visit(path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) {
    const { code, message, file, line, column } = failure;
    return { ok: false, error: { code, message, file, line, column } };
  }
  return { ok: true, program: { entry, files: out } };
}
