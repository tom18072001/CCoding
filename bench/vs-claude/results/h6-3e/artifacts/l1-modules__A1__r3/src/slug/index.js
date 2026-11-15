// Module slug — xem mục "Module slug" trong SPEC.md.
// Không dùng Intl.Collator / localeCompare.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function need(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
  return s;
}

export function fold(text) {
  need(text);
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  need(text);
  let max;
  if (options !== null && options !== undefined && options.maxLength !== undefined) {
    max = options.maxLength;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) throw err('SLUG_INVALID_MAXLENGTH');
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
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  need(a);
  need(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  need(haystack);
  need(needle);
  return norm(haystack).includes(norm(needle));
}

// ---- compareVi ----
const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((ch, i) => [ch, i]));
const MODIFIERS = { '\u0306': 'ă', '\u0302': '^', '\u031b': '*' };
// base + modifier -> chữ cái tiếng Việt
const COMBINE = {
  'a\u0306': 'ă',
  'a\u0302': 'â',
  'e\u0302': 'ê',
  'o\u0302': 'ô',
  'o\u031b': 'ơ',
  'u\u031b': 'ư',
};
const TONES = { '\u0300': 1, '\u0309': 2, '\u0303': 3, '\u0301': 4, '\u0323': 5 };

function isMark(ch) {
  return ch >= '\u0300' && ch <= '\u036f';
}

// Tách chuỗi thành các đơn vị { rank|cp, letter, tone, upper }.
function units(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let ch = cur.base;
    if (cur.mod !== null && COMBINE[ch + cur.mod]) ch = COMBINE[ch + cur.mod];
    if (RANK.has(ch)) out.push({ letter: true, key: RANK.get(ch), tone: cur.tone, upper: cur.upper });
    else out.push({ letter: false, key: ch.codePointAt(0), tone: 0, upper: cur.upper });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    if (isMark(ch)) {
      if (!cur) continue;
      if (TONES[ch]) cur.tone = TONES[ch];
      else if (MODIFIERS[ch]) cur.mod = ch;
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    const base = Array.from(lower)[0];
    cur = { base, mod: null, tone: 0, upper: lower !== ch };
  }
  flush();
  return out;
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareVi(a, b) {
  need(a);
  need(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    const x = ua[i];
    const y = ub[i];
    if (x.letter !== y.letter) return x.letter ? 1 : -1;
    if (x.key !== y.key) return cmp(x.key, y.key);
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].tone !== ub[i].tone) return cmp(ua[i].tone, ub[i].tone);
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
