// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUMBER_CHAR_RE = /[0-9A-Za-z_.+-]/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNewline = (c) => c === '\n' || c === '\r';

export function tokenize(source) {
  try {
    return run(String(source));
  } catch (e) {
    return {
      ok: false,
      error: { code: 'LEX_UNEXPECTED_CHAR', message: `Lỗi nội bộ: ${e && e.message}`, line: 1, column: 1 },
    };
  }
}

function run(src) {
  let pos = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  // Tiến một ký tự; \r\n tính một lần xuống dòng.
  const advance = () => {
    const c = src[pos];
    pos++;
    if (c === '\n') { line++; col = 1; }
    else if (c === '\r') {
      if (src[pos] === '\n') pos++;
      line++; col = 1;
    } else col++;
  };

  function readString(sl, sc) {
    const err = (code, message, l, c) => ({ error: { code, message, line: l, column: c } });
    advance(); // dấu nháy mở
    const parts = [];
    let buf = '';
    const flush = () => { if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; } };
    for (;;) {
      if (pos >= src.length) return err('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      const ch = src[pos];
      if (ch === '"') { advance(); break; }
      if (isNewline(ch)) return err('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      if (ch === '\\') {
        const el = line, ec = col;
        advance();
        const e = src[pos];
        if (pos >= src.length || isNewline(e)) return err('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        if (Object.hasOwn(SIMPLE_ESC, e)) { buf += SIMPLE_ESC[e]; advance(); continue; }
        if (e === 'u') {
          const hex = src.slice(pos + 1, pos + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return err('LEX_BAD_ESCAPE', 'Thoát \\u thiếu chữ số hex', el, ec);
          buf += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 5; k++) advance();
          continue;
        }
        return err('LEX_BAD_ESCAPE', `Thoát không hợp lệ: \\${e}`, el, ec);
      }
      if (ch === '$' && src[pos + 1] === '{') {
        const rl = line, rc = col;
        const bad = () => err('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', rl, rc);
        let j = pos + 2;
        while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNewline(src[j])) j++;
        if (j >= src.length || src[j] !== '}') return bad();
        const inner = src.slice(pos + 2, j);
        if (!INTERP_RE.test(inner)) return bad();
        const isConst = inner[0] === '@';
        const path = (isConst ? inner.slice(1) : inner).split('.');
        flush();
        parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
        while (pos <= j) advance();
        continue;
      }
      buf += ch;
      advance();
    }
    flush();
    return { parts };
  }

  while (pos < src.length) {
    const c = src[pos];
    if (c === ' ' || c === '\t' || isNewline(c)) { advance(); continue; }
    if (c === '#') { while (pos < src.length && !isNewline(src[pos])) advance(); continue; }
    if (c === '/') {
      const n = src[pos + 1];
      if (n === '/') { while (pos < src.length && !isNewline(src[pos])) advance(); continue; }
      if (n === '*') {
        const sl = line, sc = col;
        advance(); advance();
        let closed = false;
        while (pos < src.length) {
          if (src[pos] === '*' && src[pos + 1] === '/') { advance(); advance(); closed = true; break; }
          advance();
        }
        if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
        continue;
      }
      return fail('LEX_UNEXPECTED_CHAR', "Ký tự '/' không hợp lệ", line, col);
    }
    const tl = line, tc = col;
    if (isIdentStart(c)) {
      const s = pos;
      while (pos < src.length && isIdentChar(src[pos])) advance();
      const word = src.slice(s, pos);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      const s = pos;
      while (pos < src.length && NUMBER_CHAR_RE.test(src[pos])) advance();
      const text = src.slice(s, pos);
      const value = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      tokens.push({ type: 'number', value: value === 0 ? 0 : value, line: tl, column: tc });
      continue;
    }
    if (PUNCT.has(c)) {
      advance();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      const r = readString(tl, tc);
      if (r.error) return { ok: false, error: r.error };
      tokens.push({ type: 'string', value: r.parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${JSON.stringify(c)}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
