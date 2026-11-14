// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
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
  const err = (tok) => {
    if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', 'Hết tệp đột ngột', tok);
    return new ParseError('PARSE_UNEXPECTED_TOKEN', 'Token không mong đợi', tok);
  };
  const expectPunct = (v) => {
    const t = next();
    if (t.type !== 'punct' || t.value !== v) throw err(t);
    return t;
  };

  function value() {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'number') return { type: 'Number', ...pos, value: t.value };
    if (t.type === 'string') return { type: 'String', ...pos, parts: t.value };
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') return { type: 'Bool', ...pos, value: t.value === 'true' };
      if (t.value === 'null') return { type: 'Null', ...pos };
    }
    if (t.type === 'punct' && t.value === '[') {
      const items = [];
      for (;;) {
        const a = peek();
        if (a.type === 'punct' && a.value === ']') { next(); break; }
        items.push(value());
        const b = next();
        if (b.type === 'punct' && b.value === ',') continue;
        if (b.type === 'punct' && b.value === ']') break;
        throw err(b);
      }
      return { type: 'Array', ...pos, items };
    }
    throw err(t);
  }

  function stmts(inBlock) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (inBlock) throw err(t);
        break;
      }
      if (t.type === 'punct' && t.value === '}') {
        if (inBlock) break;
        throw err(t);
      }
      body.push(stmt(inBlock));
    }
    return body;
  }

  function stmt(inBlock) {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'ident') {
      const n = next();
      if (n.type === 'punct' && n.value === '=') return { type: 'Assign', ...pos, key: t.value, value: value() };
      if (n.type === 'punct' && n.value === '{') {
        const body = stmts(true);
        expectPunct('}');
        return { type: 'Block', ...pos, key: t.value, body };
      }
      throw err(n);
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const n = next();
      if (n.type !== 'string') throw err(n);
      if (n.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', n);
      }
      return { type: 'Include', ...pos, path: n.value.map((x) => x.value).join('') };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (inBlock) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const name = next();
      if (name.type !== 'ident') throw err(name);
      expectPunct('=');
      return { type: 'Const', ...pos, name: name.value, value: value() };
    }
    throw err(t);
  }

  const body = stmts(false);
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

function includesOf(stmts, out = []) {
  for (const s of stmts) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: 'Không tìm thấy tệp vào', file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  let failure = null;
  const load = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { ok: false, error: { ...r.error, file: name } };
      return false;
    }
    parsed[name] = r.ast;
    for (const inc of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, inc) && !Object.hasOwn(parsed, inc)) {
        if (!load(inc)) return false;
      }
    }
    return true;
  };
  if (!load(entry)) return failure;
  return { ok: true, program: { entry, files: parsed } };
}
