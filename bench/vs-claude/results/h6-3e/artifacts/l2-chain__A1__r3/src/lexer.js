// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUMCHAR_RE = /[0-9A-Za-z_.+-]/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const DIGIT = /[0-9]/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;

  // bảng vị trí theo chỉ số (kể cả vị trí ngay sau ký tự cuối)
  const lines = new Array(n + 1);
  const cols = new Array(n + 1);
  {
    let line = 1;
    let col = 1;
    for (let i = 0; i < n; i++) {
      lines[i] = line;
      cols[i] = col;
      const c = src[i];
      if (c === '\n') { line++; col = 1; }
      else if (c === '\r') {
        if (src[i + 1] === '\n') col++;
        else { line++; col = 1; }
      } else col++;
    }
    lines[n] = line;
    cols[n] = col;
  }

  const fail = (code, pos, message) => ({
    ok: false,
    error: { code, message, line: lines[pos], column: cols[pos] },
  });
  const tokens = [];
  const push = (type, value, pos) =>
    tokens.push({ type, value, line: lines[pos], column: cols[pos] });
  const isEol = (c) => c === '\n' || c === '\r';

  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < n && !isEol(src[i])) i++; continue; }
    if (c === '/') {
      if (src[i + 1] === '/') { while (i < n && !isEol(src[i])) i++; continue; }
      if (src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', i, 'Chú thích khối chưa đóng');
        i = end + 2;
        continue;
      }
      return fail('LEX_UNEXPECTED_CHAR', i, 'Ký tự "/" không hợp lệ');
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? 'keyword' : 'ident', word, i);
      i = j;
      continue;
    }
    if (DIGIT.test(c) || c === '-') {
      let j = i;
      while (j < n && NUMCHAR_RE.test(src[j])) j++;
      const text = src.slice(i, j);
      let value = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) return fail('LEX_BAD_NUMBER', i, `Số không hợp lệ: ${text}`);
      if (value === 0) value = 0;
      push('number', value, i);
      i = j;
      continue;
    }
    if (c === '"') {
      const open = i;
      const parts = [];
      let text = '';
      i++;
      for (;;) {
        if (i >= n) return fail('LEX_UNTERMINATED_STRING', open, 'Chuỗi chưa đóng');
        const ch = src[i];
        if (ch === '"') { i++; break; }
        if (isEol(ch)) return fail('LEX_UNTERMINATED_STRING', open, 'Chuỗi chưa đóng');
        if (ch === '\\') {
          const nx = src[i + 1];
          if (nx === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', i, 'Thoát \\u không hợp lệ');
            text += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else if (nx !== undefined && Object.prototype.hasOwnProperty.call(ESCAPES, nx)) {
            text += ESCAPES[nx];
            i += 2;
          } else return fail('LEX_BAD_ESCAPE', i, 'Thoát không hợp lệ');
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          let k = i + 2;
          while (k < n && src[k] !== '}' && src[k] !== '"' && !isEol(src[k])) k++;
          if (k >= n || src[k] !== '}') return fail('LEX_BAD_INTERPOLATION', i, 'Nội suy chưa đóng');
          const content = src.slice(i + 2, k);
          if (!REF_RE.test(content)) return fail('LEX_BAD_INTERPOLATION', i, 'Nội suy sai dạng');
          const isConst = content[0] === '@';
          if (text) { parts.push({ type: 'Text', value: text }); text = ''; }
          parts.push({
            type: 'Ref',
            path: (isConst ? content.slice(1) : content).split('.'),
            const: isConst,
            line: lines[i],
            column: cols[i],
          });
          i = k + 1;
          continue;
        }
        text += ch;
        i++;
      }
      if (text) parts.push({ type: 'Text', value: text });
      push('string', parts, open);
      continue;
    }
    if ('={}[],'.includes(c)) { push('punct', c, i); i++; continue; }
    return fail('LEX_UNEXPECTED_CHAR', i, `Ký tự không hợp lệ: ${c}`);
  }
  push('eof', null, n);
  return { ok: true, tokens };
}
