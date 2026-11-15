// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  let src = String(source);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;

  const lineStarts = [0];
  for (let i = 0; i < n; i++) {
    const c = src[i];
    if (c === '\n') lineStarts.push(i + 1);
    else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      lineStarts.push(i + 1);
    }
  }
  const posAt = (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: idx - lineStarts[lo] + 1 };
  };
  const fail = (code, message, idx) => ({ ok: false, error: { code, message, ...posAt(idx) } });

  const tokens = [];
  const push = (type, value, idx) => tokens.push({ type, value, ...posAt(idx) });
  const isNl = (c) => c === '\n' || c === '\r';

  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '#') {
      while (i < n && !isNl(src[i])) i++;
      continue;
    }
    if (c === '/') {
      const d = src[i + 1];
      if (d === '/') {
        while (i < n && !isNl(src[i])) i++;
        continue;
      }
      if (d === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối không đóng', i);
        i = end + 2;
        continue;
      }
      return fail('LEX_UNEXPECTED_CHAR', 'Ký tự không hợp lệ "/"', i);
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let j = i;
      while (j < n && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, i);
      push('number', v === 0 ? 0 : v, i);
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      push(KEYWORDS.has(text) ? 'keyword' : 'ident', text, i);
      i = j;
      continue;
    }
    if ('={}[],'.includes(c)) {
      push('punct', c, i);
      i++;
      continue;
    }
    if (c === '"') {
      const parts = [];
      let text = '';
      let j = i + 1;
      const flush = () => {
        if (text !== '') parts.push({ type: 'Text', value: text });
        text = '';
      };
      for (;;) {
        if (j >= n) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi không đóng', i);
        const ch = src[j];
        if (ch === '"') { j++; break; }
        if (isNl(ch)) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi không đóng', i);
        if (ch === '\\') {
          const e = src[j + 1];
          if (Object.hasOwn(ESCAPES, e)) { text += ESCAPES[e]; j += 2; continue; }
          if (e === 'u') {
            const hex = src.slice(j + 2, j + 6);
            if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
              text += String.fromCharCode(parseInt(hex, 16));
              j += 6;
              continue;
            }
          }
          return fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', j);
        }
        if (ch === '$' && src[j + 1] === '{') {
          let k = j + 2;
          while (k < n && src[k] !== '}' && src[k] !== '"' && !isNl(src[k])) k++;
          if (k >= n || src[k] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy không đóng', j);
          const content = src.slice(j + 2, k);
          if (!INTERP_RE.test(content)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', j);
          flush();
          const isConst = content[0] === '@';
          parts.push({
            type: 'Ref',
            path: (isConst ? content.slice(1) : content).split('.'),
            const: isConst,
            ...posAt(j),
          });
          j = k + 1;
          continue;
        }
        text += ch;
        j++;
      }
      flush();
      push('string', parts, i);
      i = j;
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ "${c}"`, i);
  }
  push('eof', null, n);
  return { ok: true, tokens };
}
