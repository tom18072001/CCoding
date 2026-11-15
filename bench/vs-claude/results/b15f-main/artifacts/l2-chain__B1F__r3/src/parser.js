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

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, what) => {
    if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${what}`, tok);
    return new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${what}`, tok);
  };
  const pos = (t) => ({ line: t.line, column: t.column });
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', value: t.value, ...pos(t) }; }
    if (t.type === 'string') { next(); return { type: 'String', parts: t.value, ...pos(t) }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      next();
      return { type: 'Bool', value: t.value === 'true', ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'null') { next(); return { type: 'Null', ...pos(t) }; }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const b = peek();
        if (isPunct(b, ',')) { next(); continue; }
        if (isPunct(b, ']')) { next(); break; }
        throw unexpected(b, "',' hoặc ']'");
      }
      return { type: 'Array', items, ...pos(t) };
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmts(depth) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (depth > 0) throw unexpected(t, "'}'");
        return body;
      }
      if (isPunct(t, '}') && depth > 0) { next(); return body; }
      if (t.type === 'ident') {
        next();
        const a = peek();
        if (isPunct(a, '=')) {
          next();
          body.push({ type: 'Assign', key: t.value, value: value(), ...pos(t) });
        } else if (isPunct(a, '{')) {
          next();
          body.push({ type: 'Block', key: t.value, body: stmts(depth + 1), ...pos(t) });
        } else {
          throw unexpected(a, "'=' hoặc '{'");
        }
        continue;
      }
      if (t.type === 'keyword' && t.value === 'include') {
        next();
        const s = peek();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type !== 'Text')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        next();
        body.push({ type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos(t) });
        continue;
      }
      if (t.type === 'keyword' && t.value === 'const') {
        if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        next();
        const nm = peek();
        if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
        next();
        if (!isPunct(peek(), '=')) throw unexpected(peek(), "'='");
        next();
        body.push({ type: 'Const', name: nm.value, value: value(), ...pos(t) });
        continue;
      }
      throw unexpected(t, 'một câu lệnh');
    }
  }

  const body = stmts(0);
  return { type: 'File', body, line: 1, column: 1 };
}

export function parse(source) {
  const lex = tokenize(source);
  if (!lex.ok) return lex;
  try {
    return { ok: true, ast: parseTokens(lex.tokens) };
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
}

export function parseProject(files, entry) {
  const has = (name) => Object.hasOwn(files, name);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  const set = (k, v) => Object.defineProperty(parsed, k, { value: v, enumerable: true, writable: true, configurable: true });
  let failure = null;

  function visit(name) {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return;
    }
    set(name, r.ast);
    const incs = [];
    collectIncludes(r.ast.body, incs);
    for (const path of incs) {
      if (has(path) && !Object.hasOwn(parsed, path)) {
        visit(path);
        if (failure) return;
      }
    }
  }
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
