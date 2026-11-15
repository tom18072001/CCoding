// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid() {
  const e = new Error('Đầu vào không hợp lệ');
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
  const maxLength = options == null ? undefined : options.maxLength;
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 1)) {
    const e = new Error('maxLength không hợp lệ');
    e.code = 'SLUG_INVALID_MAXLENGTH';
    throw e;
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
  let has;
  if (existing instanceof Set) has = (x) => existing.has(x);
  else if (Array.isArray(existing)) has = (x) => existing.includes(x);
  else throw invalid();
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
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

const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(LETTERS.map((c, i) => [c, i]));
const TONE_RANK = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const MODS = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách thành các đơn vị {letter, rank, tone, upper}.
function units(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    if (/[̀-ͯ]/.test(ch)) {
      const u = out[out.length - 1];
      if (!u) continue;
      if (ch in TONE_RANK) u.tone = TONE_RANK[ch];
      else if (MODS[u.base] && MODS[u.base][ch]) u.base = MODS[u.base][ch];
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ base: lower, upper: lower !== ch, tone: 0 });
  }
  for (const u of out) {
    const r = LETTER_RANK.get(u.base);
    u.letter = r !== undefined;
    u.rank = r !== undefined ? r : u.base.codePointAt(0);
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = units(a);
  const y = units(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].letter !== y[i].letter) return x[i].letter ? 1 : -1;
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw invalid();
  return list
    .map((s, i) => [s, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
