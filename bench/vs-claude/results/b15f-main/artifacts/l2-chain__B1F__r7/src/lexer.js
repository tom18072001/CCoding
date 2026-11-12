// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUMBER_CHAR_RE = /[0-9A-Za-z_.+-]/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const IDENT_START_RE = /[A-Za-z_]/;
const IDENT_CHAR_RE = /[A-Za-z0-9_-]/;
const HEX4_RE = /^[0-9A-Fa-f]{4}$/;
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

class LexError {
  constructor(code, message, line, column) {
    this.error = { code, message, line, column };
  }
}

export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) return { ok: false, error: e.error };
    throw e;
  }
}

function run(src) {
  const tokens = [];
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let lineStart = i; // chỉ số đầu dòng hiện tại (BOM không tính cột)
  const col = (idx) => idx - lineStart + 1;
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };

  // Xuống dòng tại vị trí i: \n, \r hoặc \r\n (tính một lần).
  const newline = () => {
    if (src[i] === '\r' && src[i + 1] === '\n') i += 2; else i += 1;
    line += 1;
    lineStart = i;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '\n' || ch === '\r') { newline(); continue; }
    if (ch === '#') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if (ch === '/') {
      if (src[i + 1] === '/') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
      if (src[i + 1] === '*') {
        const sl = line, sc = col(i);
        i += 2;
        let closed = false;
        while (i < n) {
          if (src[i] === '*' && src[i + 1] === '/') { i += 2; closed = true; break; }
          if (src[i] === '\n' || src[i] === '\r') newline(); else i++;
        }
        if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
        continue;
      }
      fail('LEX_UNEXPECTED_CHAR', "Ký tự '/' không hợp lệ", line, col(i));
    }
    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, line, column: col(i) });
      i++;
      continue;
    }
    if (IDENT_START_RE.test(ch)) {
      const s = i;
      while (i < n && IDENT_CHAR_RE.test(src[i])) i++;
      const word = src.slice(s, i);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line, column: col(s) });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      const s = i;
      while (i < n && NUMBER_CHAR_RE.test(src[i])) i++;
      const text = src.slice(s, i);
      let v = NaN;
      if (NUMBER_RE.test(text)) v = Number(text);
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, line, col(s));
      if (v === 0) v = 0; // -0 → 0
      tokens.push({ type: 'number', value: v, line, column: col(s) });
      continue;
    }
    if (ch === '"') {
      const sl = line, sc = col(i);
      i++;
      const parts = [];
      let buf = '';
      while (true) {
        if (i >= n || src[i] === '\n' || src[i] === '\r') {
          fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        }
        const c = src[i];
        if (c === '"') { i++; break; }
        if (c === '\\') {
          const e = src[i + 1];
          if (e !== undefined && Object.hasOwn(ESCAPES, e)) { buf += ESCAPES[e]; i += 2; continue; }
          if (e === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (HEX4_RE.test(hex)) { buf += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
          }
          fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', line, col(i));
        }
        if (c === '$' && src[i + 1] === '{') {
          const rl = line, rc = col(i);
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && src[j] !== '\n' && src[j] !== '\r') j++;
          if (j >= n || src[j] !== '}') fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          const body = src.slice(i + 2, j);
          const isConst = body.startsWith('@');
          const segs = (isConst ? body.slice(1) : body).split('.');
          if (!REF_RE.test(body) || KEYWORDS.has(segs[0])) {
            fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          }
          if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; }
          parts.push({ type: 'Ref', path: segs, const: isConst, line: rl, column: rc });
          i = j + 1;
          continue;
        }
        buf += c;
        i++;
      }
      if (buf !== '') parts.push({ type: 'Text', value: buf });
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, line, col(i));
  }
  tokens.push({ type: 'eof', value: null, line, column: col(i) });
  return tokens;
}
