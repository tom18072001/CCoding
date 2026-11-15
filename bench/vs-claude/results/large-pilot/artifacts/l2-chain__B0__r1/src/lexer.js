// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';

export function tokenize(source) {
  let s = String(source);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/\r\n?/g, '\n');
  const n = s.length;

  const lines = new Array(n + 1);
  const cols = new Array(n + 1);
  {
    let l = 1;
    let c = 1;
    for (let k = 0; k < n; k++) {
      lines[k] = l;
      cols[k] = c;
      if (s[k] === '\n') { l++; c = 1; } else c++;
    }
    lines[n] = l;
    cols[n] = c;
  }

  const fail = (code, message, at) => ({ ok: false, error: { code, message, line: lines[at], column: cols[at] } });
  const tokens = [];
  let i = 0;

  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === '#' || (c === '/' && s[i + 1] === '/')) {
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', i);
      i = end + 2;
      continue;
    }
    const start = i;
    const tok = (type, value) => tokens.push({ type, value, line: lines[start], column: cols[start] });

    if (isIdentStart(c)) {
      while (i < n && isIdentChar(s[i])) i++;
      const word = s.slice(start, i);
      tok(KEYWORDS.has(word) ? 'keyword' : 'ident', word);
      continue;
    }
    if (isDigit(c) || c === '-') {
      while (i < n && isNumChar(s[i])) i++;
      const text = s.slice(start, i);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, start);
      tok('number', v === 0 ? 0 : v);
      continue;
    }
    if ('={}[],'.includes(c)) {
      i++;
      tok('punct', c);
      continue;
    }
    if (c === '"') {
      const parts = [];
      let text = '';
      let j = i + 1;
      for (;;) {
        if (j >= n || s[j] === '\n') return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', start);
        const ch = s[j];
        if (ch === '"') { j++; break; }
        if (ch === '\\') {
          const d = s[j + 1];
          if (d === 'u') {
            const hex = s.slice(j + 2, j + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', j);
            text += String.fromCharCode(parseInt(hex, 16));
            j += 6;
          } else if (d !== undefined && Object.hasOwn(ESCAPES, d)) {
            text += ESCAPES[d];
            j += 2;
          } else {
            return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', j);
          }
          continue;
        }
        if (ch === '$' && s[j + 1] === '{') {
          let k = j + 2;
          while (k < n && s[k] !== '}' && s[k] !== '"' && s[k] !== '\n') k++;
          if (k >= n || s[k] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', j);
          const content = s.slice(j + 2, k);
          if (!REF_RE.test(content)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', j);
          if (text) { parts.push({ type: 'Text', value: text }); text = ''; }
          const isConst = content[0] === '@';
          parts.push({
            type: 'Ref',
            path: (isConst ? content.slice(1) : content).split('.'),
            const: isConst,
            line: lines[j],
            column: cols[j],
          });
          j = k + 1;
          continue;
        }
        text += ch;
        j++;
      }
      if (text) parts.push({ type: 'Text', value: text });
      i = j;
      tok('string', parts);
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, i);
  }
  tokens.push({ type: 'eof', value: null, line: lines[n], column: cols[n] });
  return { ok: true, tokens };
}
