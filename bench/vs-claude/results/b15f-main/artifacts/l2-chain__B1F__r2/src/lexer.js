// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumberChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';
const isHex = (c) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  const src = typeof source === 'string' ? (source.charCodeAt(0) === 0xfeff ? source.slice(1) : source) : '';
  const n = src.length;
  let i = 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // Tiến một ký tự (hoặc một cặp \r\n) và cập nhật vị trí.
  const advance = () => {
    const c = src[i];
    if (c === '\n') { i++; line++; col = 1; }
    else if (c === '\r') { i += src[i + 1] === '\n' ? 2 : 1; line++; col = 1; }
    else { i++; col++; }
  };
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { advance(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') advance();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const l0 = line, c0 = col;
      advance(); advance();
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { advance(); advance(); closed = true; break; }
        advance();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', l0, c0);
      continue;
    }
    const tl = line, tc = col;
    if (isIdentStart(c)) {
      let s = '';
      while (i < n && isIdentPart(src[i])) { s += src[i]; advance(); }
      tokens.push({ type: KEYWORDS.has(s) ? 'keyword' : 'ident', value: s, line: tl, column: tc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let s = '';
      while (i < n && isNumberChar(src[i])) { s += src[i]; advance(); }
      const v = NUMBER_RE.test(s) ? Number(s) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${s}`, tl, tc);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      advance();
      continue;
    }
    if (c === '"') {
      advance();
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      while (true) {
        if (i >= n || src[i] === '\n' || src[i] === '\r') {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const d = src[i];
        if (d === '"') { advance(); break; }
        if (d === '\\') {
          const el = line, ec = col;
          advance();
          const e = src[i];
          if (e === undefined || e === '\n' || e === '\r') return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          if (e === 'u') {
            const hex = src.slice(i + 1, i + 5);
            if (hex.length !== 4 || ![...hex].every(isHex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
            text += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 5; k++) advance();
          } else if (Object.hasOwn(ESCAPES, e)) {
            text += ESCAPES[e];
            advance();
          } else {
            return fail('LEX_BAD_ESCAPE', `Thoát không hợp lệ: \\${e}`, el, ec);
          }
          continue;
        }
        if (d === '$' && src[i + 1] === '{') {
          const rl = line, rc = col;
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && src[j] !== '\n' && src[j] !== '\r') j++;
          if (j >= n || src[j] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          let body = src.slice(i + 2, j);
          if (!INTERP_RE.test(body)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          const isConst = body[0] === '@';
          if (isConst) body = body.slice(1);
          flush();
          parts.push({ type: 'Ref', path: body.split('.'), const: isConst, line: rl, column: rc });
          while (i <= j) advance();
          continue;
        }
        text += d;
        advance();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
