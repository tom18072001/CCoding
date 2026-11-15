// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid() {
  const e = new Error('SLUG_INVALID_INPUT');
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw invalid();
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
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1) {
      const e = new Error('SLUG_INVALID_MAXLENGTH');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
  }
  const slug = fold(text)
    .toLowerCase()
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
  if (typeof base !== 'string' || base === '') throw invalid();
  let set;
  if (existing instanceof Set) set = existing;
  else if (Array.isArray(existing)) set = new Set(existing);
  else throw invalid();
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!set.has(cand)) return cand;
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

const ORDER = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const LETTER = new Map([...ORDER].map((c, i) => [c, i]));
const LETTER_BASE = 0x200000;
const TONES = new Map([
  [0x300, 1], // huyền
  [0x309, 2], // hỏi
  [0x303, 3], // ngã
  [0x301, 4], // sắc
  [0x323, 5], // nặng
]);
const MODS = {
  a: { 0x306: 'ă', 0x302: 'â' },
  e: { 0x302: 'ê' },
  o: { 0x302: 'ô', 0x31b: 'ơ' },
  u: { 0x31b: 'ư' },
};

// Mỗi ký tự -> { k: khóa mức 1, t: thanh, u: hoa (1) / thường (0) }
function tokens(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const prev = out[out.length - 1];
      if (!prev || !prev.letter) continue;
      if (TONES.has(cp)) prev.t = TONES.get(cp);
      else if (prev.mods && prev.mods[cp]) {
        prev.k = LETTER_BASE + LETTER.get(prev.mods[cp]);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    const u = lower !== ch ? 1 : 0;
    if (LETTER.has(lower)) {
      out.push({ k: LETTER_BASE + LETTER.get(lower), t: 0, u, letter: true, mods: MODS[lower] });
    } else {
      out.push({ k: lower.codePointAt(0), t: 0, u, letter: false });
    }
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].k !== y[i].k) return x[i].k < y[i].k ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].t !== y[i].t) return x[i].t < y[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].u !== y[i].u) return x[i].u < y[i].u ? -1 : 1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw invalid();
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
