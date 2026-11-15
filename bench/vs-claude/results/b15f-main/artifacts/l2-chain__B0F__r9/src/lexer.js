// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const INTERP_RE = /^(@?)([A-Za-z_][A-Za-z0-9_-]*)((?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;

class LexError extends Error {
  constructor(code, message, line, column) {
    super(message);
    this.info = { code, message, line, column };
  }
}

export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) return { ok: false, error: e.info };
    throw e;
  }
}

function run(src) {
  let i = 0;
  let line = 1;
  let col = 1;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  const n = src.length;
  const tokens = [];

  const isNl = (c) => c === '\n' || c === '\r';
  // Tiến qua một ký tự (xuống dòng \r\n tính một lần).
  const adv = () => {
    const c = src[i];
    if (c === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
      line++;
      col = 1;
    } else if (c === '\n') {
      i++;
      line++;
      col = 1;
    } else {
      i++;
      col++;
    }
  };
  const fail = (code, msg, l, c) => { throw new LexError(code, msg, l, c); };

  const readString = () => {
    const sl = line, sc = col;
    adv(); // dấu nháy mở
    const parts = [];
    let buf = '';
    const flush = () => { if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; } };
    const unterminated = () => fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
    const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
    for (;;) {
      if (i >= n) unterminated();
      const c = src[i];
      if (isNl(c)) unterminated();
      if (c === '"') { adv(); break; }
      if (c === '\\') {
        const el = line, ec = col;
        const d = src[i + 1];
        const bad = () => fail('LEX_BAD_ESCAPE', 'Escape không hợp lệ', el, ec);
        if (d === undefined) bad();
        if (Object.hasOwn(ESC, d)) { buf += ESC[d]; adv(); adv(); continue; }
        if (d === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!HEX4.test(hex)) bad();
          buf += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 6; k++) adv();
          continue;
        }
        bad();
      }
      if (c === '$' && src[i + 1] === '{') {
        const rl = line, rc = col;
        const badInterp = () => fail('LEX_BAD_INTERPOLATION', 'Nội suy sai', rl, rc);
        let j = i + 2;
        while (j < n && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
        if (j >= n || src[j] !== '}') badInterp();
        const m = INTERP_RE.exec(src.slice(i + 2, j));
        if (!m) badInterp();
        const segs = [m[2]];
        if (m[3]) segs.push(...m[3].slice(1).split('.'));
        flush();
        parts.push({ type: 'Ref', path: segs, const: m[1] === '@', line: rl, column: rc });
        while (i <= j) adv();
        continue;
      }
      buf += c;
      adv();
    }
    flush();
    return { type: 'string', value: parts, line: sl, column: sc };
  };

  for (;;) {
    // bỏ khoảng trắng và chú thích
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
      if (c === '#' || (c === '/' && src[i + 1] === '/')) {
        while (i < n && !isNl(src[i])) adv();
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const cl = line, cc = col;
        const end = src.indexOf('*/', i + 2);
        if (end < 0) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', cl, cc);
        while (i < end + 2) adv();
        continue;
      }
      break;
    }
    if (i >= n) {
      tokens.push({ type: 'eof', value: null, line, column: col });
      return tokens;
    }
    const c = src[i];
    const tl = line, tc = col;
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const name = src.slice(i, j);
      while (i < j) adv();
      tokens.push({ type: KEYWORDS.has(name) ? 'keyword' : 'ident', value: name, line: tl, column: tc });
    } else if ((c >= '0' && c <= '9') || c === '-') {
      let j = i + 1;
      while (j < n && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      while (i < j) adv();
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
    } else if (c === '"') {
      tokens.push(readString());
    } else if ('={}[],'.includes(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
    } else {
      fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
    }
  }
}
