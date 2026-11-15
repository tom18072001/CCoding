// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
  return v;
}

export function fold(text) {
  needString(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

function foldLower(text) {
  return fold(text).toLowerCase();
}

export function slugify(text, options) {
  needString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  const slug = foldLower(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (maxLength === undefined || slug.length <= maxLength) return slug;
  const words = slug.split('-');
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > maxLength) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') {
    throw err('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  }
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) has = (s) => existing.includes(s);
  else throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function loose(text) {
  return foldLower(text).replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return loose(a) === loose(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return loose(haystack).includes(loose(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm',
  'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
// huyền, hỏi, ngã, sắc, nặng
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MODS = {
  a: { 0x306: 'ă', 0x302: 'â' },
  e: { 0x302: 'ê' },
  o: { 0x302: 'ô', 0x31b: 'ơ' },
  u: { 0x31b: 'ư' },
};

function tokens(text) {
  const out = [];
  for (const ch of text.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONE.has(cp)) last.tone = TONE.get(cp);
      else if (MODS[last.base] && MODS[last.base][cp]) last.base = MODS[last.base][cp];
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ base: lower, tone: 0, upper: lower !== ch });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ta = tokens(a);
  const tb = tokens(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const ra = RANK.get(ta[i].base);
    const rb = RANK.get(tb[i].base);
    if (ra === undefined && rb === undefined) {
      if (ta[i].base !== tb[i].base) {
        return ta[i].base.codePointAt(0) < tb[i].base.codePointAt(0) ? -1 : 1;
      }
    } else if (ra === undefined) return -1;
    else if (rb === undefined) return 1;
    else if (ra !== rb) return ra < rb ? -1 : 1;
  }
  if (ta.length !== tb.length) return ta.length < tb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const x = RANK.has(ta[i].base) ? ta[i].tone : 0;
    const y = RANK.has(tb[i].base) ? tb[i].tone : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ta[i].upper !== tb[i].upper) return ta[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => [s, i])
    .sort((x, y) => compareVi(x[0], y[0]) || x[1] - y[1])
    .map((p) => p[0]);
}
