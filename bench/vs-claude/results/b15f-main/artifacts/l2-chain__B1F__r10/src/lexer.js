// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const NUMBER_CHARS = /[0-9A-Za-z_.+-]/;
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^(@)?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isIdentStart = (c) => /^[A-Za-z_]$/.test(c);
const isIdentChar = (c) => /^[A-Za-z0-9_-]$/.test(c);
const isDigit = (c) => /^[0-9]$/.test(c);

class LexError {
  constructor(code, message, line, column) {
    this.code = code;
    this.message = message;
    this.line = line;
    this.column = column;
  }
}

export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

function run(src) {
  let i = src[0] === '﻿' ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };

  // Tiến một ký tự (hoặc \r\n), cập nhật dòng/cột.
  const adv = () => {
    const c = src[i];
    if (c === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
      line++; col = 1;
    } else if (c === '\n') {
      i++; line++; col = 1;
    } else {
      i++; col++;
    }
  };
  const isNl = (c) => c === '\n' || c === '\r';

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && !isNl(src[i])) adv();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      adv(); adv();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col;
    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      col += j - i; i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < src.length && NUMBER_CHARS.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      col += j - i; i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if (PUNCT.has(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      adv();
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= src.length || isNl(src[i])) {
          fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const ch = src[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const el = line, ec = col;
          const n = src[i + 1];
          if (n !== undefined && Object.prototype.hasOwnProperty.call(SIMPLE_ESC, n)) {
            text += SIMPLE_ESC[n]; adv(); adv();
          } else if (n === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) fail('LEX_BAD_ESCAPE', 'Thoát \\u thiếu chữ số hex', el, ec);
            text += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) adv();
          } else {
            fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          const rl = line, rc = col;
          let j = i + 2;
          while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= src.length || src[j] !== '}') {
            fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          }
          const inner = src.slice(i + 2, j);
          if (!INTERP_RE.test(inner)) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          flush();
          const isConst = inner[0] === '@';
          parts.push({
            type: 'Ref',
            path: (isConst ? inner.slice(1) : inner).split('.'),
            const: isConst,
            line: rl,
            column: rc,
          });
          col += j + 1 - i; i = j + 1;
          continue;
        }
        text += ch; adv();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${JSON.stringify(c)}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
