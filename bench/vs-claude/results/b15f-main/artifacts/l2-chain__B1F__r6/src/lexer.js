// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHARS = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const PUNCT = '={}[],';
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;

  // Bảng vị trí cho mọi chỉ số 0..n.
  const lineAt = new Array(n + 1);
  const colAt = new Array(n + 1);
  {
    let line = 1;
    let col = 1;
    for (let i = 0; i < n; i++) {
      lineAt[i] = line;
      colAt[i] = col;
      const c = src[i];
      if (c === '\n') {
        line++;
        col = 1;
      } else if (c === '\r') {
        if (src[i + 1] === '\n') {
          col++; // \r của \r\n: dòng mới bắt đầu sau \n
        } else {
          line++;
          col = 1;
        }
      } else {
        col++;
      }
    }
    lineAt[n] = line;
    colAt[n] = col;
  }

  const err = (code, message, i) => ({
    ok: false,
    error: { code, message, line: lineAt[i], column: colAt[i] },
  });
  const isNl = (c) => c === '\n' || c === '\r';

  const tokens = [];
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) return err('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', i);
      i = end + 2;
      continue;
    }
    const start = i;
    if (PUNCT.includes(c)) {
      tokens.push({ type: 'punct', value: c, line: lineAt[i], column: colAt[i] });
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let j = i;
      while (j < n && NUM_CHARS.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return err('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, i);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: lineAt[i], column: colAt[i] });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      tokens.push({
        type: KEYWORDS.has(text) ? 'keyword' : 'ident',
        value: text,
        line: lineAt[i],
        column: colAt[i],
      });
      i = j;
      continue;
    }
    if (c === '"') {
      const parts = [];
      let text = '';
      const flush = () => {
        if (text !== '') parts.push({ type: 'Text', value: text });
        text = '';
      };
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const d = src[j];
        if (d === '"') {
          closed = true;
          j++;
          break;
        }
        if (isNl(d)) break;
        if (d === '\\') {
          const e = src[j + 1];
          if (e === undefined || isNl(e)) return err('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', j);
          if (Object.prototype.hasOwnProperty.call(ESC, e)) {
            text += ESC[e];
            j += 2;
          } else if (e === 'u') {
            const hex = src.slice(j + 2, j + 6);
            if (!HEX4.test(hex)) return err('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', j);
            text += String.fromCharCode(parseInt(hex, 16));
            j += 6;
          } else {
            return err('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', j);
          }
          continue;
        }
        if (d === '$' && src[j + 1] === '{') {
          let k = j + 2;
          while (k < n && src[k] !== '}' && src[k] !== '"' && !isNl(src[k])) k++;
          if (k >= n || src[k] !== '}') {
            return err('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', j);
          }
          const inner = src.slice(j + 2, k);
          if (!INTERP_RE.test(inner)) {
            return err('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', j);
          }
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: lineAt[j], column: colAt[j] });
          j = k + 1;
          continue;
        }
        text += d;
        j++;
      }
      if (!closed) return err('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', start);
      flush();
      tokens.push({ type: 'string', value: parts, line: lineAt[start], column: colAt[start] });
      i = j;
      continue;
    }
    return err('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, i);
  }
  tokens.push({ type: 'eof', value: null, line: lineAt[n], column: colAt[n] });
  return { ok: true, tokens };
}
