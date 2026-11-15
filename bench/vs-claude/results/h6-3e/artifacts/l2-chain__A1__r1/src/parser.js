// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

import { tokenize } from './lexer.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function perr(code, message, t) {
  return { code, message, line: t.line, column: t.column };
}

function unexpected(t) {
  return t.type === 'eof'
    ? perr('PARSE_UNEXPECTED_EOF', 'Hết tệp đột ngột', t)
    : perr('PARSE_UNEXPECTED_TOKEN', 'Token không mong đợi', t);
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  const toks = lx.tokens;
  let p = 0;
  const isP = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = toks[p];
    if (t.type === 'number') {
      p++;
      return { type: 'Number', value: t.value, line: t.line, column: t.column };
    }
    if (t.type === 'string') {
      p++;
      return { type: 'String', parts: t.value, line: t.line, column: t.column };
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        p++;
        return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
      }
      if (t.value === 'null') {
        p++;
        return { type: 'Null', line: t.line, column: t.column };
      }
      throw unexpected(t);
    }
    if (isP(t, '[')) {
      p++;
      const items = [];
      if (isP(toks[p], ']')) {
        p++;
        return { type: 'Array', items, line: t.line, column: t.column };
      }
      for (;;) {
        items.push(value());
        const n = toks[p];
        if (isP(n, ',')) {
          p++;
          if (isP(toks[p], ']')) {
            p++;
            break;
          }
        } else if (isP(n, ']')) {
          p++;
          break;
        } else throw unexpected(n);
      }
      return { type: 'Array', items, line: t.line, column: t.column };
    }
    throw unexpected(t);
  }

  function stmts(depth) {
    const body = [];
    for (;;) {
      const t = toks[p];
      if (depth > 0 && isP(t, '}')) break;
      if (t.type === 'eof') {
        if (depth > 0) throw unexpected(t);
        break;
      }
      body.push(stmt(t, depth));
    }
    return body;
  }

  function stmt(t, depth) {
    if (t.type === 'ident') {
      p++;
      const n = toks[p];
      if (isP(n, '=')) {
        p++;
        const v = value();
        return { type: 'Assign', key: t.value, value: v, line: t.line, column: t.column };
      }
      if (isP(n, '{')) {
        p++;
        const body = stmts(depth + 1);
        p++; // '}'
        return { type: 'Block', key: t.value, body, line: t.line, column: t.column };
      }
      throw unexpected(n);
    }
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = toks[p];
      if (s.type !== 'string') throw unexpected(s);
      if (s.value.some((x) => x.type === 'Ref')) {
        throw perr('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      p++;
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), line: t.line, column: t.column };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (depth > 0) throw perr('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      p++;
      const name = toks[p];
      if (name.type !== 'ident') throw unexpected(name);
      p++;
      if (!isP(toks[p], '=')) throw unexpected(toks[p]);
      p++;
      const v = value();
      return { type: 'Const', name: name.value, value: v, line: t.line, column: t.column };
    }
    throw unexpected(t);
  }

  try {
    const body = stmts(0);
    return { ok: true, ast: { type: 'File', body, line: 1, column: 1 } };
  } catch (e) {
    if (e && typeof e.code === 'string') return { ok: false, error: e };
    throw e;
  }
}

function includesOf(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!has(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) return { ...r.error, file: name };
    Object.defineProperty(out, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const inc of includesOf(r.ast.body)) {
      if (has(files, inc) && !has(out, inc)) {
        const e = visit(inc);
        if (e) return e;
      }
    }
    return null;
  };
  const err = visit(entry);
  if (err) {
    const { code, message, line, column } = err;
    return { ok: false, error: { code, message, file: err.file, line, column } };
  }
  return { ok: true, program: { entry, files: out } };
}
