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

const at = (type, tok, extra) => ({ type, ...extra, line: tok.line, column: tok.column });

function unexpected(tok, what) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đang đợi ${what}`, tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${what}`, tok);
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { p++; return at('Number', t, { value: t.value }); }
    if (t.type === 'string') { p++; return at('String', t, { parts: t.value }); }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') { p++; return at('Bool', t, { value: t.value === 'true' }); }
      if (t.value === 'null') { p++; return at('Null', t, {}); }
    }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { p++; continue; }
        if (isPunct(s, ']')) { p++; break; }
        throw unexpected(s, '`,` hoặc `]`');
      }
      return at('Array', t, { items });
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmt(depth) {
    const t = next();
    if (t.type === 'ident') {
      const s = peek();
      if (isPunct(s, '=')) { p++; return at('Assign', t, { key: t.value, value: value() }); }
      if (isPunct(s, '{')) { p++; return at('Block', t, { key: t.value, body: body(depth + 1) }); }
      throw unexpected(s, '`=` hoặc `{`');
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      p++;
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      return at('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      const n = next();
      if (n.type !== 'ident') throw unexpected(n, 'tên hằng');
      const e = next();
      if (!isPunct(e, '=')) throw unexpected(e, '`=`');
      return at('Const', t, { name: n.value, value: value() });
    }
    throw unexpected(t, 'một câu lệnh');
  }

  // Đọc câu lệnh tới `}` (depth>0, tiêu thụ `}`) hoặc eof (depth=0).
  function body(depth) {
    const out = [];
    for (;;) {
      const t = peek();
      if (depth > 0 && isPunct(t, '}')) { p++; return out; }
      if (t.type === 'eof') {
        if (depth > 0) throw unexpected(t, '`}`');
        return out;
      }
      out.push(stmt(depth));
    }
  }

  return { type: 'File', body: body(0), line: 1, column: 1 };
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

function includesOf(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (n) => Object.prototype.hasOwnProperty.call(files, n);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  const seen = new Set();
  let failure = null;

  function visit(name) {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { ok: false, error: { ...r.error, file: name } };
      return false;
    }
    parsed[name] = r.ast;
    for (const path of includesOf(r.ast.body, [])) {
      if (has(path) && !seen.has(path) && !visit(path)) return false;
    }
    return true;
  }

  if (!visit(entry)) return failure;
  return { ok: true, program: { entry, files: parsed } };
}
