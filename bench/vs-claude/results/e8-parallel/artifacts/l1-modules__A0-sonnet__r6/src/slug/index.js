// Module slug — xem mục "Module slug" trong SPEC.md.
// Không dùng Intl.Collator / localeCompare.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function needString(x) {
  if (typeof x !== 'string') throw err('SLUG_INVALID_INPUT');
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
    if (!Number.isInteger(m) || m < 1) throw err('SLUG_INVALID_MAXLENGTH');
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!used.has(cand)) return cand;
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

// ---------- so sánh tiếng Việt ----------

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const LETTER_BASE = 0x110000;
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const MODIFIERS = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};
const TONE_BASES = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

function tokenize(s) {
  const toks = [];
  let cur = null;
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      if (cur) cur.marks.push(ch);
      continue;
    }
    const lower = Array.from(ch.toLowerCase())[0];
    cur = { lower, upper: lower !== ch, marks: [] };
    toks.push(cur);
  }
  return toks.map((t) => {
    let letter = t.lower;
    let tone = 0;
    if (RANK.has(letter) || MODIFIERS[letter]) {
      const mods = MODIFIERS[letter];
      for (const mk of t.marks) {
        if (mods && mods[mk] && letter === t.lower) letter = mods[mk];
      }
      for (const mk of t.marks) {
        if (TONES[mk] && TONE_BASES.has(t.lower)) {
          tone = TONES[mk];
          break;
        }
      }
    }
    const key = RANK.has(letter) ? LETTER_BASE + RANK.get(letter) : letter.codePointAt(0);
    return { key, tone, upper: t.upper ? 1 : 0 };
  });
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokenize(a);
  const y = tokenize(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].key !== y[i].key) return x[i].key < y[i].key ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].tone !== y[i].tone) return x[i].tone < y[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].upper !== y[i].upper) return x[i].upper < y[i].upper ? -1 : 1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) throw err('SLUG_INVALID_INPUT');
  return list.slice().sort(compareVi);
}
