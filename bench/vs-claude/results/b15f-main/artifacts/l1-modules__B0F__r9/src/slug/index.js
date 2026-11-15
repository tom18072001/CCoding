// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid(msg) {
  const e = new Error(msg);
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw invalid('Đầu vào phải là chuỗi');
  return s;
}

const MARKS = /[̀-ͯ]/g;

export function fold(text) {
  needString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(MARKS, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      const e = new Error('maxLength phải là số nguyên >= 1');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
    max = m;
  }
  const words = fold(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return '';
  const full = words.join('-');
  if (full.length <= max) return full;
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = out + '-' + words[i];
    if (next.length > max) break;
    out = next;
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw invalid('base không hợp lệ');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw invalid('existing không hợp lệ');
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(LETTERS.map((c, i) => [c, i]));
const MODS = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const LETTER_BASE = 0x200000; // chữ cái luôn lớn hơn mọi mã Unicode

// Tách chuỗi thành phần tử { r: hạng mức 1, t: thanh điệu, u: 1 nếu chữ hoa }.
function elements(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      const last = out[out.length - 1];
      if (!last || !last.letter) continue; // dấu lạ hoặc dấu trên ký tự không phải chữ cái
      if (ch in TONES) {
        if (last.t === 0) last.t = TONES[ch];
      } else if (last.mod === null && MODS[last.base] && MODS[last.base][ch]) {
        last.mod = MODS[last.base][ch];
        last.r = LETTER_BASE + RANK.get(last.mod);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    const first = String.fromCodePoint(lower.codePointAt(0));
    const u = lower !== ch ? 1 : 0;
    if (RANK.has(first)) {
      out.push({ letter: true, base: first, mod: null, r: LETTER_BASE + RANK.get(first), t: 0, u });
    } else {
      out.push({ letter: false, base: first, mod: null, r: first.codePointAt(0), t: 0, u });
    }
  }
  return out;
}

function cmpNum(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ea = elements(a);
  const eb = elements(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i++) {
    const c = cmpNum(ea[i].r, eb[i].r);
    if (c) return c;
  }
  if (ea.length !== eb.length) return ea.length < eb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const c = cmpNum(ea[i].t, eb[i].t);
    if (c) return c;
  }
  for (let i = 0; i < n; i++) {
    const c = cmpNum(ea[i].u, eb[i].u);
    if (c) return c;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw invalid('list phải là mảng chuỗi');
  return list
    .map((v, i) => ({ v, i }))
    .sort((x, y) => compareVi(x.v, y.v) || x.i - y.i)
    .map((x) => x.v);
}
