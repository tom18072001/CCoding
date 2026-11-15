// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

function perr(code, message, tok) {
  return { __parse: true, error: { code, message, line: tok.line, column: tok.column } };
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, what) => (tok.type === 'eof'
    ? perr('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
    : perr('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đợi ${what}`, tok));
  const isP = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', value: t.value, line: t.line, column: t.column }; }
    if (t.type === 'string') { next(); return { type: 'String', parts: t.value, line: t.line, column: t.column }; }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        next(); return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
      }
      if (t.value === 'null') { next(); return { type: 'Null', line: t.line, column: t.column }; }
    }
    if (isP(t, '[')) {
      next();
      const items = [];
      if (isP(peek(), ']')) { next(); return { type: 'Array', items, line: t.line, column: t.column }; }
      items.push(value());
      for (;;) {
        const s = peek();
        if (isP(s, ']')) { next(); break; }
        if (!isP(s, ',')) throw unexpected(s, "',' hoặc ']'");
        next();
        if (isP(peek(), ']')) { next(); break; }
        items.push(value());
      }
      return { type: 'Array', items, line: t.line, column: t.column };
    }
    throw unexpected(t, 'giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      next();
      const s = peek();
      if (isP(s, '=')) {
        next();
        return { type: 'Assign', key: t.value, value: value(), line: t.line, column: t.column };
      }
      if (isP(s, '{')) {
        next();
        return { type: 'Block', key: t.value, body: stmts(false), line: t.line, column: t.column };
      }
      throw unexpected(s, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      next();
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) throw perr('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      next();
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), line: t.line, column: t.column };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw perr('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      next();
      const nm = peek();
      if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
      next();
      const eq = peek();
      if (!isP(eq, '=')) throw unexpected(eq, "'='");
      next();
      return { type: 'Const', name: nm.value, value: value(), line: t.line, column: t.column };
    }
    throw unexpected(t, 'câu lệnh');
  }

  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (top) {
        if (t.type === 'eof') break;
      } else if (isP(t, '}')) { next(); break; }
      body.push(stmt(top));
    }
    return body;
  }

  const body = stmts(true);
  return { type: 'File', body, line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return { ok: false, error: lx.error };
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e && e.__parse) return { ok: false, error: e.error };
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
  const parsed = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) { failure = { ...r.error, file: name }; return false; }
    parsed[name] = r.ast;
    for (const inc of collectIncludes(r.ast.body, [])) {
      if (has(inc) && !Object.prototype.hasOwnProperty.call(parsed, inc)) {
        if (!visit(inc)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) {
    const { code, message, line, column, file } = failure;
    return { ok: false, error: { code, message, file, line, column } };
  }
  return { ok: true, program: { entry, files: parsed } };
}
