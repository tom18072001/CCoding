// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';

export function tokenize(source) {
  let s = String(source);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const n = s.length;
  const tokens = [];
  let i = 0;
  let line = 1;
  let ls = 0; // chỉ số đầu dòng hiện tại
  const col = (idx) => idx - ls + 1;
  const fail = (code, message, ln, column) => ({ ok: false, error: { code, message, line: ln, column } });
  const newline = () => {
    if (s[i] === '\r' && s[i + 1] === '\n') i++;
    i++;
    line++;
    ls = i;
  };

  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '\n' || c === '\r') { newline(); continue; }
    if (c === '#' || (c === '/' && s[i + 1] === '/')) {
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const sl = line, sc = col(i);
      i += 2;
      let closed = false;
      while (i < n) {
        if (s[i] === '*' && s[i + 1] === '/') { i += 2; closed = true; break; }
        if (s[i] === '\n' || s[i] === '\r') newline();
        else i++;
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col(i);
    if (c === '=' || c === '{' || c === '}' || c === '[' || c === ']' || c === ',') {
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      i++;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(s[j])) j++;
      const word = s.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      i = j;
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i + 1;
      while (j < n && isNumChar(s[j])) j++;
      const word = s.slice(i, j);
      const v = NUM_RE.test(word) ? Number(word) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${word}`, tl, tc);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      i = j;
      continue;
    }
    if (c === '"') {
      i++;
      const parts = [];
      let text = '';
      const flush = () => { if (text) { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= n || s[i] === '\n' || s[i] === '\r') {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const ch = s[i];
        if (ch === '"') { i++; break; }
        if (ch === '\\') {
          const e = s[i + 1];
          if (e !== undefined && Object.hasOwn(ESC, e)) { text += ESC[e]; i += 2; continue; }
          if (e === 'u') {
            const hex = s.slice(i + 2, i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) { text += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
          }
          return fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', line, col(i));
        }
        if (ch === '$' && s[i + 1] === '{') {
          let j = i + 2;
          while (j < n && s[j] !== '}' && s[j] !== '"' && s[j] !== '\n' && s[j] !== '\r') j++;
          if (j >= n || s[j] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', line, col(i));
          let content = s.slice(i + 2, j);
          if (!REF_RE.test(content)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', line, col(i));
          const isConst = content[0] === '@';
          if (isConst) content = content.slice(1);
          flush();
          parts.push({ type: 'Ref', path: content.split('.'), const: isConst, line, column: col(i) });
          i = j + 1;
          continue;
        }
        text += ch;
        i++;
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col(n) });
  return { ok: true, tokens };
}
