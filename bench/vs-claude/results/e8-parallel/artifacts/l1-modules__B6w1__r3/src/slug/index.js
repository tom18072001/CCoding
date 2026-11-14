// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'tham số phải là chuỗi');
  return v;
}

export function fold(text) {
  needString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên ≥ 1');
    }
    max = m;
  }
  const slug = fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const words = slug.split('-');
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT', 'base không hợp lệ');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (s) => set.has(s);
  } else throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function loose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
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

// ---- Sắp xếp tiếng Việt ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MODS = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};

// Mỗi đơn vị: { letter, rank (-1 nếu không phải chữ cái), cp, tone, upper }
function units(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const u = out[out.length - 1];
      if (!u) continue;
      if (TONE.has(cp)) u.tone = TONE.get(cp);
      else if (MODS[cp] && u.letter && MODS[cp][u.letter]) {
        u.letter = MODS[cp][u.letter];
        u.rank = RANK.get(u.letter);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    if (RANK.has(lower)) out.push({ letter: lower, rank: RANK.get(lower), cp, tone: 0, upper: lower !== ch });
    else out.push({ letter: null, rank: -1, cp: lower.codePointAt(0), tone: 0, upper: false });
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
    const x = ua[i], y = ub[i];
    if (x.rank !== y.rank) return x.rank < y.rank ? -1 : 1;
    if (x.rank === -1 && x.cp !== y.cp) return x.cp < y.cp ? -1 : 1;
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].tone !== ub[i].tone) return ua[i].tone < ub[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].upper !== ub[i].upper) return ua[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list.map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
