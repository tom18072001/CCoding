// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError {
  constructor(code, message, tok) {
    this.error = { code, message, line: tok.line, column: tok.column };
  }
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: new Parser(lexed.tokens).file() };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.error };
    throw e;
  }
}

class Parser {
  constructor(tokens) { this.t = tokens; this.p = 0; }
  get cur() { return this.t[this.p]; }
  bad(tok, what) {
    if (tok.type === 'eof') throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${what}`, tok);
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${what}`, tok);
  }
  isPunct(v) { return this.cur.type === 'punct' && this.cur.value === v; }
  expectPunct(v) {
    if (!this.isPunct(v)) this.bad(this.cur, `'${v}'`);
    return this.t[this.p++];
  }
  file() {
    const body = [];
    while (this.cur.type !== 'eof') body.push(this.stmt(true));
    return { type: 'File', body, line: 1, column: 1 };
  }
  block() {
    this.expectPunct('{');
    const body = [];
    while (!this.isPunct('}')) {
      if (this.cur.type === 'eof') this.bad(this.cur, "'}'");
      body.push(this.stmt(false));
    }
    this.p++;
    return body;
  }
  stmt(top) {
    const tok = this.cur;
    if (tok.type === 'ident') {
      this.p++;
      if (this.isPunct('{')) {
        return { type: 'Block', key: tok.value, body: this.block(), line: tok.line, column: tok.column };
      }
      this.expectPunct('=');
      return { type: 'Assign', key: tok.value, value: this.value(), line: tok.line, column: tok.column };
    }
    if (tok.type === 'keyword' && tok.value === 'include') {
      this.p++;
      const s = this.cur;
      if (s.type !== 'string') this.bad(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      this.p++;
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), line: tok.line, column: tok.column };
    }
    if (tok.type === 'keyword' && tok.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ hợp lệ ở cấp cao nhất', tok);
      this.p++;
      const name = this.cur;
      if (name.type !== 'ident') this.bad(name, 'tên hằng');
      this.p++;
      this.expectPunct('=');
      return { type: 'Const', name: name.value, value: this.value(), line: tok.line, column: tok.column };
    }
    return this.bad(tok, 'câu lệnh');
  }
  value() {
    const tok = this.cur;
    const at = { line: tok.line, column: tok.column };
    if (tok.type === 'number') { this.p++; return { type: 'Number', value: tok.value, ...at }; }
    if (tok.type === 'string') { this.p++; return { type: 'String', parts: tok.value, ...at }; }
    if (tok.type === 'keyword' && (tok.value === 'true' || tok.value === 'false')) {
      this.p++;
      return { type: 'Bool', value: tok.value === 'true', ...at };
    }
    if (tok.type === 'keyword' && tok.value === 'null') { this.p++; return { type: 'Null', ...at }; }
    if (this.isPunct('[')) {
      this.p++;
      const items = [];
      if (this.isPunct(']')) { this.p++; return { type: 'Array', items, ...at }; }
      while (true) {
        items.push(this.value());
        if (this.isPunct(',')) {
          this.p++;
          if (this.isPunct(']')) { this.p++; break; }
          continue;
        }
        if (this.isPunct(']')) { this.p++; break; }
        this.bad(this.cur, "',' hoặc ']'");
      }
      return { type: 'Array', items, ...at };
    }
    return this.bad(tok, 'giá trị');
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
  const out = {};
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) return { ok: false, error: { ...r.error, file: name } };
    out[name] = r.ast;
    for (const p of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, p) && !Object.hasOwn(out, p)) {
        const sub = visit(p);
        if (!sub.ok) return sub;
      }
    }
    return { ok: true };
  };
  const res = visit(entry);
  if (!res.ok) return res;
  return { ok: true, program: { entry, files: out } };
}
