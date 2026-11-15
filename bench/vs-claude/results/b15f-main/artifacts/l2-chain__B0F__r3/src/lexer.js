// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const SEG_RE = /^([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*)$/;

const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

function parseRefBody(body) {
  let constant = false;
  if (body.startsWith('@')) { constant = true; body = body.slice(1); }
  const segs = body.split('.');
  if (!IDENT_RE.test(segs[0])) return null;
  for (const s of segs) if (!SEG_RE.test(s)) return null;
  return { path: segs, const: constant };
}

export function tokenize(source) {
  try {
    return run(String(source));
  } catch (e) {
    if (e && e.__lex) return { ok: false, error: e.error };
    throw e;
  }
}

function run(src) {
  let i = 0, line = 1, col = 1;
  if (src.charCodeAt(0) === 0xFEFF) i = 1;
  const n = src.length;
  const tokens = [];

  const fail = (code, message, l, c) => {
    throw { __lex: true, error: { code, message, line: l, column: c } };
  };
  // Tiến qua ký tự hiện tại (đã biết không phải xuống dòng, hoặc xử lý xuống dòng).
  const step = () => {
    const c = src[i];
    if (c === '\r') {
      i += (src[i + 1] === '\n') ? 2 : 1;
      line++; col = 1;
    } else if (c === '\n') {
      i++; line++; col = 1;
    } else { i++; col++; }
  };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { step(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') step();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      step(); step();
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { step(); step(); closed = true; break; }
        step();
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col;
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < n && isNumChar(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      col += j - i; i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentChar(src[j])) j++;
      const text = src.slice(i, j);
      col += j - i; i = j;
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      step();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      step();
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= n || src[i] === '\n' || src[i] === '\r') {
          fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const d = src[i];
        if (d === '"') { step(); break; }
        if (d === '\\') {
          const el = line, ec = col;
          const e = src[i + 1];
          if (e === undefined || e === '\n' || e === '\r') fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          if (e === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('LEX_BAD_ESCAPE', 'Thoát \\u thiếu hex', el, ec);
            text += String.fromCharCode(parseInt(hex, 16));
            i += 6; col += 6;
            continue;
          }
          if (Object.hasOwn(ESC, e)) { text += ESC[e]; i += 2; col += 2; continue; }
          fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        }
        if (d === '$' && src[i + 1] === '{') {
          const rl = line, rc = col;
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && src[j] !== '\n' && src[j] !== '\r') j++;
          if (j >= n || src[j] !== '}') fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          const ref = parseRefBody(src.slice(i + 2, j));
          if (!ref) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          flush();
          parts.push({ type: 'Ref', path: ref.path, const: ref.const, line: rl, column: rc });
          col += j + 1 - i; i = j + 1;
          continue;
        }
        text += d; i++; col++;
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', 'Ký tự không hợp lệ', tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
