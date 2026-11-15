// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const NUM_CHARS = /^[0-9A-Za-z_.+-]$/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isIdStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdPart = (c) => isIdStart(c) || (c >= '0' && c <= '9') || c === '-';
const isDigit = (c) => c >= '0' && c <= '9';

export function tokenize(source) {
  const str = String(source);
  const s = str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
  const n = s.length;
  const tokens = [];
  let i = 0;
  let line = 1;
  let ls = 0; // vị trí đầu dòng hiện tại
  const fail = (code, message, ln, col) => ({ ok: false, error: { code, message, line: ln, column: col } });

  while (i < n) {
    const c = s[i];
    const col = i - ls + 1;
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '\n') { i++; line++; ls = i; continue; }
    if (c === '\r') { i++; if (s[i] === '\n') i++; line++; ls = i; continue; }
    if (c === '#' || (c === '/' && s[i + 1] === '/')) {
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', line, col);
      const stop = end + 2;
      while (i < stop) {
        const d = s[i];
        if (d === '\n') { i++; line++; ls = i; }
        else if (d === '\r') { i++; if (s[i] === '\n' && i < stop) i++; line++; ls = i; }
        else i++;
      }
      continue;
    }
    if (PUNCT.has(c)) {
      tokens.push({ type: 'punct', value: c, line, column: col });
      i++;
      continue;
    }
    if (c === '"') {
      const startLine = line;
      const startCol = col;
      const unterminated = () => fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', startLine, startCol);
      const parts = [];
      let buf = '';
      i++;
      for (;;) {
        if (i >= n) return unterminated();
        const d = s[i];
        if (d === '"') { i++; break; }
        if (d === '\n' || d === '\r') return unterminated();
        if (d === '\\') {
          const bad = () => fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', line, i - ls + 1);
          if (i + 1 >= n) return bad();
          const e = s[i + 1];
          if (e === 'u') {
            const hex = s.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return bad();
            buf += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else if (Object.hasOwn(ESC, e)) {
            buf += ESC[e];
            i += 2;
          } else return bad();
          continue;
        }
        if (d === '$' && s[i + 1] === '{') {
          const bad = () => fail('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', line, i - ls + 1);
          let j = i + 2;
          while (j < n && s[j] !== '}' && s[j] !== '"' && s[j] !== '\n' && s[j] !== '\r') j++;
          if (j >= n || s[j] !== '}') return bad();
          const content = s.slice(i + 2, j);
          if (!REF_RE.test(content)) return bad();
          if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; }
          const isConst = content[0] === '@';
          parts.push({
            type: 'Ref',
            path: (isConst ? content.slice(1) : content).split('.'),
            const: isConst,
            line,
            column: i - ls + 1,
          });
          i = j + 1;
          continue;
        }
        buf += d;
        i++;
      }
      if (buf !== '') parts.push({ type: 'Text', value: buf });
      tokens.push({ type: 'string', value: parts, line: startLine, column: startCol });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < n && NUM_CHARS.test(s[j])) j++;
      const text = s.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', 'Số không hợp lệ', line, col);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line, column: col });
      i = j;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(s[j])) j++;
      const text = s.slice(i, j);
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line, column: col });
      i = j;
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', 'Ký tự không hợp lệ', line, col);
  }
  tokens.push({ type: 'eof', value: null, line, column: i - ls + 1 });
  return { ok: true, tokens };
}
