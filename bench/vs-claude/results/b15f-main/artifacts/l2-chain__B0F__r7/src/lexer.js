// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RUN = /[0-9A-Za-z_.+-]/;
const NUMBER_FULL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP = /^(@)?([A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let i = 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // Tiến một ký tự (xử lý xuống dòng \n, \r\n, \r).
  const adv = () => {
    const c = src[i];
    if (c === '\n') { i++; line++; col = 1; }
    else if (c === '\r') {
      i++;
      if (src[i] === '\n') i++;
      line++; col = 1;
    } else { i++; col++; }
  };
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  const isNl = (c) => c === '\n' || c === '\r';

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) adv();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      adv(); adv();
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col;
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < n && NUMBER_RUN.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_FULL.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      col += j - i; i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j])) j++;
      const text = src.slice(i, j);
      col += j - i; i = j;
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line: tl, column: tc });
      continue;
    }
    if (PUNCT.has(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      adv();
      const parts = [];
      let buf = '';
      while (true) {
        if (i >= n || isNl(src[i])) {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const ch = src[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const el = line, ec = col;
          const nx = src[i + 1];
          if (nx === undefined || isNl(nx)) return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          if (nx === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
            buf += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) adv();
            continue;
          }
          if (Object.hasOwn(ESC, nx)) { buf += ESC[nx]; adv(); adv(); continue; }
          return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        }
        if (ch === '$' && src[i + 1] === '{') {
          const pl = line, pc = col;
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= n || src[j] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', pl, pc);
          const m = INTERP.exec(src.slice(i + 2, j));
          if (!m) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', pl, pc);
          if (buf) { parts.push({ type: 'Text', value: buf }); buf = ''; }
          parts.push({ type: 'Ref', path: m[2].split('.'), const: m[1] === '@', line: pl, column: pc });
          col += j + 1 - i; i = j + 1;
          continue;
        }
        buf += ch;
        adv();
      }
      if (buf) parts.push({ type: 'Text', value: buf });
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
