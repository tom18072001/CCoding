// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const INTERP_RE = /^(@?)([A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let s = String(source);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const n = s.length;
  let i = 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const adv = () => {
    const c = s[i];
    if (c === '\n') { line++; col = 1; i++; }
    else if (c === '\r') {
      i++;
      if (s[i] === '\n') i++;
      line++; col = 1;
    } else { i++; col++; }
  };
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  const isNl = (c) => c === '\n' || c === '\r';

  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { adv(); continue; }
    if (c === '#' || (c === '/' && s[i + 1] === '/')) {
      while (i < n && !isNl(s[i])) adv();
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const sl = line, sc = col;
      adv(); adv();
      let closed = false;
      while (i < n) {
        if (s[i] === '*' && s[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const sl = line, sc = col;
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(s[j])) j++;
      const word = s.slice(i, j);
      const len = j - i;
      for (let k = 0; k < len; k++) adv();
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: sl, column: sc });
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let j = i + 1;
      while (j < n && NUM_CHAR.test(s[j])) j++;
      const text = s.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, sl, sc);
      for (let k = 0; k < text.length; k++) adv();
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: sl, column: sc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: sl, column: sc });
      continue;
    }
    if (c === '"') {
      adv();
      const parts = [];
      let buf = '';
      const flush = () => { if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; } };
      for (;;) {
        if (i >= n || isNl(s[i])) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        const ch = s[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const d = s[i + 1];
          if (d === undefined || isNl(d)) return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', line, col);
          if (d === 'u') {
            const hex = s.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', line, col);
            buf += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) adv();
          } else if (Object.hasOwn(ESCAPES, d)) {
            buf += ESCAPES[d];
            adv(); adv();
          } else return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', line, col);
          continue;
        }
        if (ch === '$' && s[i + 1] === '{') {
          const rl = line, rc = col;
          let j = i + 2;
          while (j < n && s[j] !== '}' && s[j] !== '"' && !isNl(s[j])) j++;
          if (j >= n || s[j] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          const m = INTERP_RE.exec(s.slice(i + 2, j));
          if (!m) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          flush();
          parts.push({ type: 'Ref', path: m[2].split('.'), const: m[1] === '@', line: rl, column: rc });
          const len = j + 1 - i;
          for (let k = 0; k < len; k++) adv();
          continue;
        }
        buf += ch;
        adv();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, sl, sc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
