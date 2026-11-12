// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.
//
// HỢP ĐỒNG TOKEN (D4 — cố định, không thêm trường):
//   tokenize(source) -> { ok: true, tokens } | { ok: false, error: { code, message, line, column } }
//   token = { type, value, line, column }
//     ident   : value = tên (string)
//     keyword : value = 'include' | 'const' | 'true' | 'false' | 'null'
//     number  : value = số JS hữu hạn (-0 -> 0)
//     string  : value = Part[]; Part = { type:'Text', value }
//                                    | { type:'Ref', path:string[], const:boolean, line, column }
//     punct   : value = '=' '{' '}' '[' ']' ','
//     eof     : value = null, vị trí ngay sau ký tự cuối
//   line/column bắt đầu từ 1, cột theo đơn vị UTF-16; BOM đầu bị bỏ và không tính cột;
//   \n, \r\n (một dòng), \r đều là xuống dòng. Không bao giờ ném với đầu vào là chuỗi.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const SEG_RE = /^([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*)$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

class LexError {
  constructor(code, line, column) {
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

const MESSAGES = {
  LEX_UNEXPECTED_CHAR: 'Ký tự không thuộc ngôn ngữ',
  LEX_UNTERMINATED_STRING: 'Chuỗi chưa đóng dấu nháy',
  LEX_UNTERMINATED_COMMENT: 'Chú thích khối chưa đóng',
  LEX_BAD_ESCAPE: 'Chuỗi thoát không hợp lệ',
  LEX_BAD_NUMBER: 'Số không hợp lệ',
  LEX_BAD_INTERPOLATION: 'Nội suy ${...} không hợp lệ',
};

export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) {
      return {
        ok: false,
        error: { code: e.code, message: MESSAGES[e.code], line: e.line, column: e.column },
      };
    }
    throw e;
  }
}

function run(src) {
  let i = src[0] === '﻿' ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const isNl = (c) => c === '\n' || c === '\r';
  // Tiến một đơn vị mã; \r\n tính một lần xuống dòng.
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
  const fail = (code, l, c) => {
    throw new LexError(code, l, c);
  };

  function readString() {
    const ql = line;
    const qc = col;
    adv(); // dấu nháy mở
    const parts = [];
    let buf = '';
    const flush = () => {
      if (buf !== '') parts.push({ type: 'Text', value: buf });
      buf = '';
    };
    for (;;) {
      if (i >= src.length || isNl(src[i])) fail('LEX_UNTERMINATED_STRING', ql, qc);
      const ch = src[i];
      if (ch === '"') {
        adv();
        break;
      }
      if (ch === '\\') {
        const el = line;
        const ec = col;
        const n = src[i + 1];
        if (n !== undefined && Object.hasOwn(SIMPLE_ESC, n)) {
          buf += SIMPLE_ESC[n];
          adv();
          adv();
        } else if (n === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!HEX4.test(hex)) fail('LEX_BAD_ESCAPE', el, ec);
          buf += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 6; k++) adv();
        } else {
          fail('LEX_BAD_ESCAPE', el, ec);
        }
        continue;
      }
      if (ch === '$' && src[i + 1] === '{') {
        const dl = line;
        const dc = col;
        let j = i + 2;
        while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
        if (j >= src.length || src[j] !== '}') fail('LEX_BAD_INTERPOLATION', dl, dc);
        let inner = src.slice(i + 2, j);
        const isConst = inner[0] === '@';
        if (isConst) inner = inner.slice(1);
        const segs = inner.split('.');
        if (!IDENT_RE.test(segs[0]) || !segs.every((s) => SEG_RE.test(s))) {
          fail('LEX_BAD_INTERPOLATION', dl, dc);
        }
        flush();
        parts.push({ type: 'Ref', path: segs, const: isConst, line: dl, column: dc });
        while (i <= j) adv();
        continue;
      }
      buf += ch;
      adv();
    }
    flush();
    return parts;
  }

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) {
      adv();
      continue;
    }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && !isNl(src[i])) adv();
      continue;
    }
    const l0 = line;
    const c0 = col;
    if (c === '/' && src[i + 1] === '*') {
      adv();
      adv();
      for (;;) {
        if (i >= src.length) fail('LEX_UNTERMINATED_COMMENT', l0, c0);
        if (src[i] === '*' && src[i + 1] === '/') {
          adv();
          adv();
          break;
        }
        adv();
      }
      continue;
    }
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line: l0, column: c0 });
      adv();
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i;
      while (j < src.length && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', l0, c0);
      while (i < j) adv();
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: l0, column: c0 });
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < src.length && IDENT_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      while (i < j) adv();
      tokens.push({
        type: KEYWORDS.has(text) ? 'keyword' : 'ident',
        value: text,
        line: l0,
        column: c0,
      });
      continue;
    }
    if (c === '"') {
      tokens.push({ type: 'string', value: readString(), line: l0, column: c0 });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', l0, c0);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
