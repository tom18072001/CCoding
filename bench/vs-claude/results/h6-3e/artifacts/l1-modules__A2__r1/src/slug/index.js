// slug — xem SPEC.md, mục "Module slug".

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function str(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
  return s;
}

export function fold(text) {
  str(text);
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  str(text);
  let max;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    max = options.maxLength;
    if (!Number.isInteger(max) || max < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const slug = fold(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (max === undefined || slug.length <= max) return slug;
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!used.has(cand)) return cand;
  }
}

function norm(s) {
  return fold(str(s)).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  const x = norm(a);
  const y = norm(b);
  return x === y;
}

export function looseIncludes(haystack, needle) {
  const h = norm(haystack);
  const n = norm(needle);
  return h.includes(n);
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i + 1]));
const TONES = { 0x300: 1, 0x309: 2, 0x303: 3, 0x301: 4, 0x323: 5 };
const MODS = {
  a: { 0x306: 'ă', 0x302: 'â' },
  e: { 0x302: 'ê' },
  o: { 0x302: 'ô', 0x31b: 'ơ' },
  u: { 0x31b: 'ư' },
};

// Tách thành các phần tử { rank, code, tone, upper }
function keys(s) {
  const out = [];
  const cps = Array.from(s.normalize('NFD'));
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const lower = cp.toLowerCase();
    const upper = lower !== cp;
    let base = lower;
    let tone = 0;
    let j = i + 1;
    for (; j < cps.length; j++) {
      const code = cps[j].codePointAt(0);
      if (code < 0x300 || code > 0x36f) break;
      if (TONES[code] !== undefined) { if (!tone) tone = TONES[code]; }
      else if (MODS[lower] && MODS[lower][code]) base = MODS[lower][code];
    }
    i = j - 1;
    const rank = RANK.get(base) || 0;
    if (/^[̀-ͯ]$/.test(cp)) continue; // dấu kết hợp mồ côi
    out.push({ rank, code: rank ? 0 : base.codePointAt(0), tone: rank ? tone : 0, upper });
  }
  return out;
}

export function compareVi(a, b) {
  const x = keys(str(a));
  const y = keys(str(b));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
    if (x[i].code !== y[i].code) return x[i].code < y[i].code ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].tone !== y[i].tone) return x[i].tone < y[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].upper !== y[i].upper) return x[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw err('SLUG_INVALID_INPUT');
  return [...list].sort(compareVi);
}
