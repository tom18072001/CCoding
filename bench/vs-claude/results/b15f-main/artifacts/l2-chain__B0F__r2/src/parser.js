// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

const unexpected = (tok, dang) =>
  tok.type === 'eof'
    ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${dang}`, tok)
    : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${dang}`, tok);

const isPunct = (t, v) => t.type === 'punct' && t.value === v;

function parseTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const at = (t) => ({ line: t.line, column: t.column });

  function expectPunct(v) {
    const t = peek();
    if (!isPunct(t, v)) throw unexpected(t, `'${v}'`);
    return next();
  }

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', value: t.value, ...at(t) }; }
    if (t.type === 'string') { next(); return { type: 'String', parts: t.value, ...at(t) }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      next();
      return { type: 'Bool', value: t.value === 'true', ...at(t) };
    }
    if (t.type === 'keyword' && t.value === 'null') { next(); return { type: 'Null', ...at(t) }; }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { next(); continue; }
        if (isPunct(s, ']')) { next(); break; }
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', items, ...at(t) };
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
      if (isPunct(t, '}')) {
        if (depth > 0) return body;
        throw unexpected(t, 'một câu lệnh');
      }
      body.push(stmt(depth));
    }
  }

  function stmt(depth) {
    const t = next();
    if (t.type === 'ident') {
      const s = peek();
      if (isPunct(s, '=')) {
        next();
        return { type: 'Assign', key: t.value, value: value(), ...at(t) };
      }
      if (isPunct(s, '{')) {
        next();
        const body = stmts(depth + 1);
        expectPunct('}');
        return { type: 'Block', key: t.value, body, ...at(t) };
      }
      throw unexpected(s, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      next();
      if (s.value.some((p) => p.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      return { type: 'Include', path: s.value.map((p) => p.value).join(''), ...at(t) };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const n = peek();
      if (n.type !== 'ident') throw unexpected(n, 'tên hằng');
      next();
      expectPunct('=');
      return { type: 'Const', name: n.value, value: value(), ...at(t) };
    }
    throw unexpected(t, 'một câu lệnh');
  }

  const body = stmts(0);
  return { type: 'File', body, line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return { ok: false, error: lx.error };
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
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

export function parseProject(files, entry) {
  const has = (k) => Object.prototype.hasOwnProperty.call(files, k);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return false;
    }
    out[name] = r.ast;
    for (const p of collectIncludes(r.ast.body, [])) {
      if (has(p) && !Object.prototype.hasOwnProperty.call(out, p)) {
        if (!visit(p)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: out } };
}
