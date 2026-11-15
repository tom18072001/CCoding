// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.code = code;
    this.line = tok.line;
    this.column = tok.column;
  }
}

function describe(tok) {
  return tok.type === 'eof' ? 'hết tệp' : `${tok.type} ${JSON.stringify(tok.value)}`;
}

function run(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const fail = (tok, expected) => {
    if (tok.type === 'eof') throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đợi ${expected}`, tok);
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Gặp ${describe(tok)}, đợi ${expected}`, tok);
  };
  const isPunct = (tok, v) => tok.type === 'punct' && tok.value === v;
  const at = (type, tok, extra) => ({ type, line: tok.line, column: tok.column, ...extra });

  function value() {
    const t = next();
    if (t.type === 'number') return at('Number', t, { value: t.value });
    if (t.type === 'string') return at('String', t, { parts: t.value.map((x) => ({ ...x })) });
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') return at('Bool', t, { value: t.value === 'true' });
      if (t.value === 'null') return at('Null', t, {});
    }
    if (isPunct(t, '[')) {
      const items = [];
      while (true) {
        if (isPunct(peek(), ']')) {
          next();
          break;
        }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) {
          next();
        } else if (isPunct(s, ']')) {
          next();
          break;
        } else fail(s, '"," hoặc "]"');
      }
      return at('Array', t, { items });
    }
    return fail(t, 'một giá trị');
  }

  function stmts(top) {
    const body = [];
    while (true) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        fail(t, '"}"');
      }
      if (isPunct(t, '}')) {
        if (top) fail(t, 'một câu lệnh');
        return body;
      }
      next();
      if (t.type === 'ident') {
        const s = peek();
        if (isPunct(s, '=')) {
          next();
          body.push(at('Assign', t, { key: t.value, value: value() }));
        } else if (isPunct(s, '{')) {
          next();
          const inner = stmts(false);
          next(); // '}'
          body.push(at('Block', t, { key: t.value, body: inner }));
        } else fail(s, '"=" hoặc "{"');
      } else if (t.type === 'keyword' && t.value === 'include') {
        const s = next();
        if (s.type !== 'string') fail(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type === 'Ref')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        body.push(at('Include', t, { path: s.value.map((x) => x.value).join('') }));
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        const nm = next();
        if (nm.type !== 'ident') fail(nm, 'tên hằng');
        const eq = next();
        if (!isPunct(eq, '=')) fail(eq, '"="');
        body.push(at('Const', t, { name: nm.value, value: value() }));
      } else fail(t, 'một câu lệnh');
    }
  }

  const body = stmts(true);
  return { type: 'File', line: 1, column: 1, body };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: run(lx.tokens) };
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

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  const seen = new Set();
  let failure = null;
  const visit = (name) => {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { ...r.error, file: name };
      return false;
    }
    Object.defineProperty(parsed, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const path of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, path) && !seen.has(path) && !visit(path)) return false;
    }
    return true;
  };
  if (!visit(entry)) {
    const { code, message, line, column, file } = failure;
    return { ok: false, error: { code, message, file, line, column } };
  }
  return { ok: true, program: { entry, files: parsed } };
}
