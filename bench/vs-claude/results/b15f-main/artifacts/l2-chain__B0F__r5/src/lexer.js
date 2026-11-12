// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_FULL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_FULL = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const tokens = [];
  const col = (idx) => idx - lineStart + 1;
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  // Nếu tại i là xuống dòng thì tiêu thụ và trả true.
  const newline = () => {
    const ch = src[i];
    if (ch === '\n') {
      i++;
    } else if (ch === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
    } else {
      return false;
    }
    line++;
    lineStart = i;
    return true;
  };
  const isNl = (ch) => ch === '\n' || ch === '\r';

  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (newline()) continue;
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const sl = line, sc = col(i);
      i += 2;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { i += 2; closed = true; break; }
        if (!newline()) i++;
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col(i);
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      let j = i + 1;
      while (j < n && NUM_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      const v = NUM_FULL.test(word) ? Number(word) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${word}`, tl, tc);
      i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(ch)) {
      i++;
      tokens.push({ type: 'punct', value: ch, line: tl, column: tc });
      continue;
    }
    if (ch === '"') {
      const parts = [];
      let text = '';
      const flush = () => {
        if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; }
      };
      let j = i + 1;
      while (true) {
        if (j >= n || isNl(src[j])) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        const c = src[j];
        if (c === '"') { j++; break; }
        if (c === '\\') {
          const e = src[j + 1];
          const ecol = tc + (j - i);
          if (e === undefined || isNl(e)) return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', tl, ecol);
          if (e === 'u') {
            const hex = src.slice(j + 2, j + 6);
            if (!HEX4.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', tl, ecol);
            text += String.fromCharCode(parseInt(hex, 16));
            j += 6;
            continue;
          }
          if (Object.prototype.hasOwnProperty.call(ESC, e)) { text += ESC[e]; j += 2; continue; }
          return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', tl, ecol);
        }
        if (c === '$' && src[j + 1] === '{') {
          const dcol = tc + (j - i);
          let k = j + 2;
          while (k < n && src[k] !== '}' && src[k] !== '"' && !isNl(src[k])) k++;
          if (k >= n || src[k] !== '}') {
            return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', tl, dcol);
          }
          const inner = src.slice(j + 2, k);
          if (!REF_FULL.test(inner)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', tl, dcol);
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: tl, column: dcol });
          j = k + 1;
          continue;
        }
        text += c;
        j++;
      }
      flush();
      i = j;
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col(i) });
  return { ok: true, tokens };
}
