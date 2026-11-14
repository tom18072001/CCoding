// slug — xem SPEC.md, mục "Module slug". Không dùng Intl.Collator / localeCompare.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
}

export function fold(text) {
  checkString(text);
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  checkString(text);
  const maxLength = options == null ? undefined : options.maxLength;
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 1)) {
    throw err('SLUG_INVALID_MAXLENGTH');
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  let has;
  if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (x) => set.has(x);
  } else if (existing instanceof Set) {
    has = (x) => existing.has(x);
  } else {
    throw err('SLUG_INVALID_INPUT');
  }
  if (!has(base)) return base;
  for (let i = 2; ; i++) {
    const cand = `${base}-${i}`;
    if (!has(cand)) return cand;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  checkString(a);
  checkString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  checkString(haystack);
  checkString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ORDER = 'a ă â b c d đ e ê g h i k l m n o ô ơ p q r s t u ư v x y f j w z'.split(' ');
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = { '\u0300': 1, '\u0309': 2, '\u0303': 3, '\u0301': 4, '\u0323': 5 };
const MODS = {
  a: { '\u0306': 'ă', '\u0302': 'â' },
  e: { '\u0302': 'ê' },
  o: { '\u0302': 'ô', '\u031b': 'ơ' },
  u: { '\u031b': 'ư' },
};

// Trả về mảng phần tử { rank, key, tone, upper }
function keysOf(s) {
  const items = [];
  const chars = Array.from(s.normalize('NFD'));
  for (const ch of chars) {
    if (/^[\u0300-\u036f]$/.test(ch)) {
      const last = items[items.length - 1];
      if (!last) continue;
      if (TONES[ch] !== undefined) last.tone = TONES[ch];
      else if (last.base in MODS && MODS[last.base][ch] && !last.mod) last.mod = MODS[last.base][ch];
      continue;
    }
    const lower = ch.toLowerCase();
    items.push({ base: lower, mod: null, tone: 0, upper: lower !== ch });
  }
  return items.map((it) => {
    const letter = it.mod || it.base;
    const rank = RANK.has(letter) ? RANK.get(letter) : -1;
    return { rank, key: it.base, tone: it.tone, upper: it.upper ? 1 : 0, letter: rank >= 0 };
  });
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareKeys(x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i];
    const q = y[i];
    if (p.letter && q.letter) {
      if (p.rank !== q.rank) return cmp(p.rank, q.rank);
    } else if (p.letter !== q.letter) {
      return p.letter ? 1 : -1;
    } else {
      const c = cmp(p.key.codePointAt(0), q.key.codePointAt(0));
      if (c !== 0) return c;
      if (p.key !== q.key) return cmp(p.key, q.key);
    }
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const a = x[i].letter ? x[i].tone : 0;
    const b = y[i].letter ? y[i].tone : 0;
    if (a !== b) return cmp(a, b);
  }
  for (let i = 0; i < n; i++) {
    if (x[i].upper !== y[i].upper) return cmp(x[i].upper, y[i].upper);
  }
  return 0;
}

export function compareVi(a, b) {
  checkString(a);
  checkString(b);
  return compareKeys(keysOf(a), keysOf(b));
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list
    .map((s, i) => ({ s, i, k: keysOf(s) }))
    .sort((p, q) => compareKeys(p.k, q.k) || p.i - q.i)
    .map((e) => e.s);
}
