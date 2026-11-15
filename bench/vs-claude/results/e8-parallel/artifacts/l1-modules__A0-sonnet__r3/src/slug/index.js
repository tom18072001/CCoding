// slug — xem SPEC.md, mục "Module slug".
// Không dùng Intl.Collator / localeCompare.
const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
  return s;
}

export function fold(text) {
  needString(text);
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(COMBINING, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let max;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    max = options.maxLength;
    if (!Number.isInteger(max) || max < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const slug = fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  let has;
  if (existing instanceof Set) has = (x) => existing.has(x);
  else if (Array.isArray(existing)) has = (x) => existing.includes(x);
  else throw err('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let k = 2; ; k++) {
    const c = `${base}-${k}`;
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

// ---- so sánh tiếng Việt ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { 0x300: 1, 0x309: 2, 0x303: 3, 0x301: 4, 0x323: 5 };
const MODIFIER = { 0x306: 'ă', 0x302: 'â', 0x31b: 'ơ' }; // tùy chữ gốc

function modified(base, mark) {
  if (mark === 0x306 && base === 'a') return 'ă';
  if (mark === 0x302 && (base === 'a' || base === 'e' || base === 'o')) {
    return base === 'a' ? 'â' : base === 'e' ? 'ê' : 'ô';
  }
  if (mark === 0x31b && (base === 'o' || base === 'u')) return base === 'o' ? 'ơ' : 'ư';
  return base;
}

function keys(s) {
  const chars = Array.from(s.normalize('NFD'));
  const out = [];
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONE[cp] !== undefined) {
        if (last.isLetter) last.tone = TONE[cp];
      } else if (MODIFIER[cp] !== undefined && last.isLetter) {
        last.letter = modified(last.letter, cp);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    const isLetter = RANK.has(lower);
    out.push({ letter: lower, isLetter, tone: 0, upper, cp: lower.codePointAt(0) });
  }
  for (const k of out) k.rank = k.isLetter && RANK.has(k.letter) ? RANK.get(k.letter) : -1;
  return out;
}

const sign = (x) => (x < 0 ? -1 : x > 0 ? 1 : 0);

function cmpKeys(ka, kb) {
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const a = ka[i];
    const b = kb[i];
    if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
    if (a.rank === -1 && a.cp !== b.cp) return a.cp < b.cp ? -1 : 1;
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ka[i].tone !== kb[i].tone) return sign(ka[i].tone - kb[i].tone);
  }
  for (let i = 0; i < n; i++) {
    if (ka[i].upper !== kb[i].upper) return ka[i].upper ? 1 : -1;
  }
  return 0;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  return cmpKeys(keys(a), keys(b));
}

export function sortVi(list) {
  if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) throw err('SLUG_INVALID_INPUT');
  const dec = list.map((s, i) => ({ s, i, k: keys(s) }));
  dec.sort((x, y) => cmpKeys(x.k, y.k) || x.i - y.i);
  return dec.map((d) => d.s);
}
