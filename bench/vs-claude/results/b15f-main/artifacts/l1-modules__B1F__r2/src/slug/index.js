// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT', 'cần chuỗi');
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

export function slugify(text, options) {
  needString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength không hợp lệ');
    }
    max = m;
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
  let slug = words.join('-');
  if (slug.length <= max) return slug;
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (s) => set.has(s);
  } else throw err('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return norm(haystack).includes(norm(needle));
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i]));
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MOD = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};

// Tách thành các cụm: { key, tone, upper }
function clusters(s) {
  const out = [];
  let cur = null;
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!cur) continue;
      if (TONE.has(cp)) cur.tone = TONE.get(cp);
      else if (MOD[cp] && MOD[cp][cur.base]) cur.base = MOD[cp][cur.base];
      continue;
    }
    const lower = ch.toLowerCase();
    cur = { base: lower, upper: lower !== ch, tone: 0 };
    out.push(cur);
  }
  return out.map((c) => {
    const r = RANK.get(c.base);
    return {
      key: r === undefined ? -1 : r,
      cp: c.base.codePointAt(0),
      tone: r === undefined ? 0 : c.tone,
      upper: r === undefined ? false : c.upper,
    };
  });
}

function cmp(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const A = clusters(a);
  const B = clusters(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    if (A[i].key !== B[i].key) {
      if (A[i].key === -1 && B[i].key === -1) return cmp(A[i].cp, B[i].cp);
      return cmp(A[i].key, B[i].key);
    }
    if (A[i].key === -1 && A[i].cp !== B[i].cp) return cmp(A[i].cp, B[i].cp);
  }
  if (A.length !== B.length) return cmp(A.length, B.length);
  for (let i = 0; i < n; i++) {
    if (A[i].tone !== B[i].tone) return cmp(A[i].tone, B[i].tone);
  }
  for (let i = 0; i < n; i++) {
    if (A[i].upper !== B[i].upper) return A[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
