// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const IDENT_SEG_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';
const HEX_RE = /^[0-9A-Fa-f]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

class LexError {
  constructor(code, message, line, column) {
    this.code = code; this.message = message; this.line = line; this.column = column;
  }
}

function validInterpolation(body) {
  if (!INTERP_RE.test(body)) return false;
  for (const seg of body.replace(/^@/, '').split('.')) {
    if (IDENT_SEG_RE.test(seg) && KEYWORDS.has(seg)) return false;
  }
  return true;
}

function lex(s) {
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const isNl = (c) => c === '\n' || c === '\r';
  const adv = () => {
    const c = s[i];
    if (c === '\r') {
      i += s[i + 1] === '\n' ? 2 : 1;
      line++; col = 1;
    } else if (c === '\n') {
      i++; line++; col = 1;
    } else { i++; col++; }
  };
  const err = (code, message, l, c) => { throw new LexError(code, message, l, c); };

  const readString = () => {
    const sl = line, sc = col;
    adv(); // dấu nháy mở
    const parts = [];
    let text = '';
    const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
    for (;;) {
      if (i >= s.length) err('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      const c = s[i];
      if (c === '"') { adv(); break; }
      if (isNl(c)) err('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      if (c === '\\') {
        const el = line, ec = col;
        adv();
        if (i >= s.length) err('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        const e = s[i];
        if (Object.hasOwn(SIMPLE_ESC, e)) { text += SIMPLE_ESC[e]; adv(); }
        else if (e === 'u') {
          const hex = s.slice(i + 1, i + 5);
          if (!HEX_RE.test(hex)) err('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
          text += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 5; k++) adv();
        } else err('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        continue;
      }
      if (c === '$' && s[i + 1] === '{') {
        const rl = line, rc = col;
        adv(); adv();
        let body = '';
        for (;;) {
          if (i >= s.length || s[i] === '"' || isNl(s[i])) {
            err('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          }
          if (s[i] === '}') { adv(); break; }
          body += s[i]; adv();
        }
        if (!validInterpolation(body)) err('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
        flush();
        const isConst = body[0] === '@';
        const path = (isConst ? body.slice(1) : body).split('.');
        parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
        continue;
      }
      text += c; adv();
    }
    flush();
    tokens.push({ type: 'string', value: parts, line: sl, column: sc });
  };

  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
    if (c === '#' || (c === '/' && s[i + 1] === '/')) {
      while (i < s.length && !isNl(s[i])) adv();
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const cl = line, cc = col;
      adv(); adv();
      for (;;) {
        if (i >= s.length) err('LEX_UNTERMINATED_COMMENT', 'Chú thích chưa đóng', cl, cc);
        if (s[i] === '*' && s[i + 1] === '/') { adv(); adv(); break; }
        adv();
      }
      continue;
    }
    const tl = line, tc = col;
    if (c === '"') { readString(); continue; }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < s.length && isNumChar(s[j])) j++;
      const raw = s.slice(i, j);
      const v = NUMBER_RE.test(raw) ? Number(raw) : NaN;
      if (!Number.isFinite(v)) err('LEX_BAD_NUMBER', `Số không hợp lệ: ${raw}`, tl, tc);
      while (i < j) adv();
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < s.length && isIdentPart(s[j])) j++;
      const name = s.slice(i, j);
      while (i < j) adv();
      tokens.push({ type: KEYWORDS.has(name) ? 'keyword' : 'ident', value: name, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    err('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}

export function tokenize(source) {
  try {
    return { ok: true, tokens: lex(String(source)) };
  } catch (e) {
    if (e instanceof LexError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    return { ok: false, error: { code: 'LEX_UNEXPECTED_CHAR', message: String(e && e.message), line: 1, column: 1 } };
  }
}
