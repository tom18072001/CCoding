// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'Đầu vào phải là chuỗi');
}

function foldRaw(text) {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function fold(text) {
  needString(text);
  return foldRaw(text);
}

export function slugify(text, options) {
  needString(text);
  let maxLength;
  if (options != null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  const slug = foldRaw(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
  needString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base không được rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function normLoose(s) {
  return foldRaw(s).toLowerCase().replace(/\s+/g, ' ').trim();
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

// ---- Sắp xếp tiếng Việt ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
// huyền, hỏi, ngã, sắc, nặng
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MODS = {
  a: new Map([[0x306, 'ă'], [0x302, 'â']]),
  e: new Map([[0x302, 'ê']]),
  o: new Map([[0x302, 'ô'], [0x31b, 'ơ']]),
  u: new Map([[0x31b, 'ư']]),
};

// Tách thành các phần tử { k: khóa mức 1, t: thanh, u: hoa }
function units(s) {
  const out = [];
  let cur = null;
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!cur) continue;
      if (TONE.has(cp)) cur.t = TONE.get(cp);
      else if (cur.mods && cur.mods.has(cp)) cur.letter = cur.mods.get(cp);
      continue;
    }
    const lower = ch.toLowerCase();
    cur = { letter: null, mods: null, t: 0, u: lower !== ch, cp: lower.codePointAt(0) };
    if (RANK.has(lower)) {
      cur.letter = lower;
      cur.mods = MODS[lower] || null;
    }
    out.push(cur);
  }
  for (const x of out) {
    x.k = x.letter !== null ? [1, RANK.get(x.letter)] : [0, x.cp];
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    const x = ua[i].k;
    const y = ub[i].k;
    if (x[0] !== y[0]) return x[0] < y[0] ? -1 : 1;
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].t !== ub[i].t) return ua[i].t < ub[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].u !== ub[i].u) return ua[i].u ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
