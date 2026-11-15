// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  const src = String(source);
  const n = src.length;
  let i = src[0] === '﻿' ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  const isNl = (ch) => ch === '\n' || ch === '\r';
  // Tiến một ký tự (hoặc cặp \r\n) và cập nhật vị trí.
  const step = () => {
    const ch = src[i];
    if (ch === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
      line++;
      col = 1;
    } else if (ch === '\n') {
      i++;
      line++;
      col = 1;
    } else {
      i++;
      col++;
    }
  };

  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || isNl(ch)) { step(); continue; }
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) step();
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', line, col);
      while (i < end + 2) step();
      continue;
    }
    const tl = line;
    const tc = col;
    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, line: tl, column: tc });
      step();
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      while (j < n && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      let value = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      if (value === 0) value = 0;
      while (i < j) step();
      tokens.push({ type: 'number', value, line: tl, column: tc });
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      while (i < j) step();
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line: tl, column: tc });
      continue;
    }
    if (ch === '"') {
      step();
      const parts = [];
      let buf = '';
      const flush = () => {
        if (buf !== '') { parts.push({ type: 'Text', value: buf }); buf = ''; }
      };
      for (;;) {
        if (i >= n || isNl(src[i])) {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const c = src[i];
        if (c === '"') { step(); break; }
        if (c === '\\') {
          const el = line;
          const ec = col;
          const e = src[i + 1];
          if (e !== undefined && Object.hasOwn(SIMPLE_ESCAPES, e)) {
            buf += SIMPLE_ESCAPES[e];
            step(); step();
          } else if (e === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
            buf += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) step();
          } else {
            return fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (c === '$' && src[i + 1] === '{') {
          const rl = line;
          const rc = col;
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= n || src[j] !== '}') {
            return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          }
          const inner = src.slice(i + 2, j);
          if (!INTERP_RE.test(inner)) {
            return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          }
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
          while (i <= j) step();
          continue;
        }
        buf += c;
        step();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
