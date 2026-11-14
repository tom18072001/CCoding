// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_RUN = /[0-9A-Za-z_.+-]*/y;
const NUM_FULL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_FULL = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
const isIdStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdPart = (c) => isIdStart(c) || (c >= '0' && c <= '9') || c === '-';
const isDigit = (c) => c >= '0' && c <= '9';

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let i = 0, line = 1, col = 1;
  const tokens = [];
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  const adv = () => {
    const ch = src[i];
    if (ch === '\r') { if (src[i + 1] === '\n') i++; i++; line++; col = 1; }
    else if (ch === '\n') { i++; line++; col = 1; }
    else { i++; col++; }
  };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { adv(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') adv();
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
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line, column: col });
      i++; col++;
      continue;
    }
    if (isDigit(c) || c === '-') {
      NUM_RUN.lastIndex = i;
      const text = NUM_RUN.exec(src)[0];
      let val = NaN;
      if (NUM_FULL.test(text)) val = Number(text);
      if (!Number.isFinite(val)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, line, col);
      if (val === 0) val = 0;
      tokens.push({ type: 'number', value: val, line, column: col });
      i += text.length; col += text.length;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src[j])) j++;
      const text = src.slice(i, j);
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line, column: col });
      col += j - i; i = j;
      continue;
    }
    if (c === '"') {
      const sc = col;
      let j = i + 1;
      const parts = [];
      let buf = '';
      for (;;) {
        if (j >= n) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', line, sc);
        const d = src[j];
        if (d === '\n' || d === '\r') return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', line, sc);
        if (d === '"') { j++; break; }
        if (d === '\\') {
          const e = src[j + 1];
          const bad = () => fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', line, sc + (j - i));
          if (e === 'u') {
            const hex = src.slice(j + 2, j + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return bad();
            buf += String.fromCharCode(parseInt(hex, 16));
            j += 6;
          } else if (e !== undefined && Object.hasOwn(ESC, e)) {
            buf += ESC[e];
            j += 2;
          } else return bad();
          continue;
        }
        if (d === '$' && src[j + 1] === '{') {
          let k = j + 2;
          while (k < n && src[k] !== '}' && src[k] !== '"' && src[k] !== '\n' && src[k] !== '\r') k++;
          const refCol = sc + (j - i);
          if (src[k] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', line, refCol);
          const content = src.slice(j + 2, k);
          if (!REF_FULL.test(content)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', line, refCol);
          const isConst = content[0] === '@';
          const path = (isConst ? content.slice(1) : content).split('.');
          if (buf) { parts.push({ type: 'Text', value: buf }); buf = ''; }
          parts.push({ type: 'Ref', path, const: isConst, line, column: refCol });
          j = k + 1;
          continue;
        }
        buf += d;
        j++;
      }
      if (buf) parts.push({ type: 'Text', value: buf });
      tokens.push({ type: 'string', value: parts, line, column: sc });
      col += j - i; i = j;
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, line, col);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
