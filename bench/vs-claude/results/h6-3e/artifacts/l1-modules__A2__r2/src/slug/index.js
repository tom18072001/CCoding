// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
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
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) throw err('SLUG_INVALID_MAXLENGTH');
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
  if (existing instanceof Set) has = (x) => existing.has(x);
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (x) => set.has(x);
  } else throw err('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let i = 2; ; i++) {
    const cand = `${base}-${i}`;
    if (!has(cand)) return cand;
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
const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(LETTERS.map((c, i) => [c, i]));
const TONES = { 0x300: 1, 0x309: 2, 0x303: 3, 0x301: 4, 0x323: 5 };
const MODS = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};

function units(s) {
  const out = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    let ch = cur.base;
    if (cur.mod !== null && MODS[cur.mod][ch]) ch = MODS[cur.mod][ch];
    const rank = RANK.has(ch) ? RANK.get(ch) : -1;
    out.push({ rank, cp: ch.codePointAt(0), tone: cur.tone, upper: cur.upper });
  };
  for (const c of s.normalize('NFD')) {
    const cp = c.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!cur) continue;
      if (TONES[cp] !== undefined) {
        if (cur.tone === 0) cur.tone = TONES[cp];
      } else if (MODS[cp] !== undefined && cur.mod === null) cur.mod = cp;
      continue;
    }
    finish();
    const lower = c.toLowerCase();
    cur = { base: lower.normalize('NFD').charAt(0) === lower ? lower : [...lower.normalize('NFD')][0], mod: null, tone: 0, upper: c !== lower };
  }
  finish();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    const x = ua[i];
    const y = ub[i];
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
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list.slice().sort(compareVi);
}
