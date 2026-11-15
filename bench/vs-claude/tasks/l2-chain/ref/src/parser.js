import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, what) => {
    if (tok.type === 'eof') throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${what}`, tok);
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi (đợi ${what})`, tok);
  };

  function value() {
    const t = next();
    if (t.type === 'number') return { type: 'Number', value: t.value, line: t.line, column: t.column };
    if (t.type === 'string') return { type: 'String', parts: t.value, line: t.line, column: t.column };
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
    if (t.type === 'keyword' && t.value === 'null') return { type: 'Null', line: t.line, column: t.column };
    if (t.type === 'punct' && t.value === '[') {
      const items = [];
      for (;;) {
        const q = peek();
        if (q.type === 'punct' && q.value === ']') { next(); break; }
        items.push(value());
        const s = peek();
        if (s.type === 'punct' && s.value === ',') { next(); continue; }
        if (s.type === 'punct' && s.value === ']') { next(); break; }
        unexpected(s, '"," hoặc "]"');
      }
      return { type: 'Array', items, line: t.line, column: t.column };
    }
    return unexpected(t, 'một giá trị');
  }

  function statements(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (!top) unexpected(t, '"}"');
        return body;
      }
      if (t.type === 'punct' && t.value === '}' && !top) { return body; }
      next();
      if (t.type === 'ident') {
        const s = next();
        if (s.type === 'punct' && s.value === '=') {
          body.push({ type: 'Assign', key: t.value, value: value(), line: t.line, column: t.column });
        } else if (s.type === 'punct' && s.value === '{') {
          const inner = statements(false);
          next();
          body.push({ type: 'Block', key: t.value, body: inner, line: t.line, column: t.column });
        } else unexpected(s, '"=" hoặc "{"');
      } else if (t.type === 'keyword' && t.value === 'include') {
        const s = next();
        if (s.type !== 'string') unexpected(s, 'đường dẫn tệp (chuỗi)');
        if (s.value.some((x) => x.type !== 'Text')) throw new ParseError('PARSE_BAD_INCLUDE', 'Đường dẫn include không được chứa nội suy', s);
        body.push({ type: 'Include', path: s.value.map((x) => x.value).join(''), line: t.line, column: t.column });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được khai báo ở cấp cao nhất', t);
        const name = next();
        if (name.type !== 'ident') unexpected(name, 'tên hằng');
        const eq = next();
        if (!(eq.type === 'punct' && eq.value === '=')) unexpected(eq, '"="');
        body.push({ type: 'Const', name: name.value, value: value(), line: t.line, column: t.column });
      } else unexpected(t, 'khóa, include hoặc const');
    }
  }

  const body = statements(true);
  return { type: 'File', line: 1, column: 1, body };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
    throw e;
  }
}

export function includesOf(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 } };
  }
  const asts = {};
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) return { ok: false, error: { ...r.error, file: name } };
    asts[name] = r.ast;
    for (const inc of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, inc.path) && !Object.hasOwn(asts, inc.path)) {
        const sub = visit(inc.path);
        if (!sub.ok) return sub;
      }
    }
    return { ok: true };
  };
  const r = visit(entry);
  if (!r.ok) return r;
  return { ok: true, program: { entry, files: asts } };
}
