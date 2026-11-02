const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const fail = (code, message, line, column) => ({ ok: false, error: { code, message, line, column } });
const isIdStart = (c) => /[A-Za-z_]/.test(c);
const isIdPart = (c) => /[A-Za-z0-9_-]/.test(c);

export function tokenize(source) {
  const n = source.length;
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];
  const adv = () => {
    const c = source[i++];
    if (c === '\r') {
      if (source[i] === '\n') i++;
      line++;
      col = 1;
    } else if (c === '\n') {
      line++;
      col = 1;
    } else col++;
    return c;
  };
  while (i < n) {
    const c = source[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { adv(); continue; }
    if (c === '#' || (c === '/' && source[i + 1] === '/')) {
      while (i < n && source[i] !== '\n' && source[i] !== '\r') adv();
      continue;
    }
    const sl = line;
    const sc = col;
    if (c === '/' && source[i + 1] === '*') {
      adv(); adv();
      let closed = false;
      while (i < n) {
        if (source[i] === '*' && source[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
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
      let text = '';
      for (;;) {
        if (i >= n || source[i] === '\n' || source[i] === '\r') return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        const ch = source[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const bl = line;
          const bc = col;
          adv();
          if (i >= n) return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
          const e = source[i];
          if (e === 'u') {
            const hex = source.slice(i + 1, i + 5);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', 'Escape \\u không hợp lệ', bl, bc);
            for (let k = 0; k < 5; k++) adv();
            text += String.fromCharCode(parseInt(hex, 16));
          } else if (Object.hasOwn(ESC, e)) {
            adv();
            text += ESC[e];
          } else return fail('LEX_BAD_ESCAPE', 'Escape không hợp lệ', bl, bc);
          continue;
        }
        if (ch === '$' && source[i + 1] === '{') {
          const rl = line;
          const rc = col;
          adv(); adv();
          let body = '';
          while (i < n && source[i] !== '}' && source[i] !== '"' && source[i] !== '\n' && source[i] !== '\r') body += adv();
          if (i >= n || source[i] !== '}' || !REF_RE.test(body)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', rl, rc);
          adv();
          if (text) { parts.push({ type: 'Text', value: text }); text = ''; }
          const isConst = body[0] === '@';
          parts.push({ type: 'Ref', path: (isConst ? body.slice(1) : body).split('.'), const: isConst, line: rl, column: rc });
          continue;
        }
        text += adv();
      }
      if (text) parts.push({ type: 'Text', value: text });
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let run = '';
      while (i < n && /[0-9A-Za-z_.+-]/.test(source[i])) run += adv();
      const v = NUM_RE.test(run) ? Number(run) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${run}`, sl, sc);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: sl, column: sc });
      continue;
    }
    if (isIdStart(c)) {
      let word = '';
      while (i < n && isIdPart(source[i])) word += adv();
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: sl, column: sc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, sl, sc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
