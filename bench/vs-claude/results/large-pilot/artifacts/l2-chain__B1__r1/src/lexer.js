// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUMBER_CHAR_RE = /[0-9A-Za-z_.+-]/;
const IDENT_START_RE = /[A-Za-z_]/;
const IDENT_CHAR_RE = /[A-Za-z0-9_-]/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  src = src.replace(/\r\n?/g, '\n');
  const n = src.length;
  const tokens = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const col = (k) => k - lineStart + 1;
  const fail = (code, message, k) => ({ ok: false, error: { code, message, line, column: col(k) } });

  while (i < n) {
    const c = src[i];
    if (c === '\n') { i++; line++; lineStart = i; continue; }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', i);
      for (let k = i; k < end; k++) {
        if (src[k] === '\n') { line++; lineStart = k + 1; }
      }
      i = end + 2;
      continue;
    }
    if (IDENT_START_RE.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR_RE.test(src[j])) j++;
      const name = src.slice(i, j);
      tokens.push({ type: KEYWORDS.has(name) ? 'keyword' : 'ident', value: name, line, column: col(i) });
      i = j;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let j = i + 1;
      while (j < n && NUMBER_CHAR_RE.test(src[j])) j++;
      const text = src.slice(i, j);
      const value = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, i);
      tokens.push({ type: 'number', value: value === 0 ? 0 : value, line, column: col(i) });
      i = j;
      continue;
    }
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line, column: col(i) });
      i++;
      continue;
    }
    if (c === '"') {
      const r = lexString(i);
      if (r.error) return r.error;
      tokens.push({ type: 'string', value: r.parts, line, column: col(i) });
      i = r.end;
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, i);
  }
  tokens.push({ type: 'eof', value: null, line, column: col(i) });
  return { ok: true, tokens };

  function lexString(start) {
    const parts = [];
    let buf = '';
    let j = start + 1;
    const flush = () => { if (buf) { parts.push({ type: 'Text', value: buf }); buf = ''; } };
    for (;;) {
      if (j >= n || src[j] === '\n') return { error: fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', start) };
      const c = src[j];
      if (c === '"') { flush(); return { parts, end: j + 1 }; }
      if (c === '\\') {
        const d = src[j + 1];
        if (d === 'u') {
          const hex = src.slice(j + 2, j + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return { error: fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', j) };
          buf += String.fromCharCode(parseInt(hex, 16));
          j += 6;
        } else if (d !== undefined && Object.hasOwn(SIMPLE_ESCAPES, d)) {
          buf += SIMPLE_ESCAPES[d];
          j += 2;
        } else {
          return { error: fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', j) };
        }
        continue;
      }
      if (c === '$' && src[j + 1] === '{') {
        let k = j + 2;
        while (k < n && src[k] !== '}' && src[k] !== '"' && src[k] !== '\n') k++;
        if (k >= n || src[k] !== '}') return { error: fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', j) };
        const content = src.slice(j + 2, k);
        // SPEC §1: ident không phải từ khóa → mọi đoạn tên (kể cả sau `@`) không được là từ khóa.
        const badShape = !INTERP_RE.test(content)
          || content.replace(/^@/, '').split('.').some((s) => KEYWORDS.has(s));
        if (badShape) return { error: fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', j) };
        const isConst = content[0] === '@';
        flush();
        parts.push({
          type: 'Ref',
          path: (isConst ? content.slice(1) : content).split('.'),
          const: isConst,
          line,
          column: col(j),
        });
        j = k + 1;
        continue;
      }
      buf += c;
      j++;
    }
  }
}
