// Module slug — xem mục "Module slug" trong SPEC.md.

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function requireString(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
  return v;
}

const COMBINING = /[̀-ͯ]/g;

export function fold(text) {
  requireString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(COMBINING, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  requireString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw fail('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên ≥ 1');
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
  if (typeof base !== 'string' || base === '') throw fail('SLUG_INVALID_INPUT', 'base không hợp lệ');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (s) => set.has(s);
  } else throw fail('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!has(cand)) return cand;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  requireString(a);
  requireString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  requireString(haystack);
  requireString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(LETTERS.map((l, i) => [l, i]));
const TONE_RANK = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const MODIFIER = { '̆': 'ă', '̂': 'â', '̛': 'ơ' };
// Chữ gốc + dấu phụ → chữ cái tiếng Việt
const COMPOSE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách chuỗi thành các ký tự: { rank, tone, upper }
function units(str) {
  const out = [];
  let cur = null;
  for (const ch of str.normalize('NFD')) {
    if (/[̀-ͯ]/.test(ch)) {
      if (!cur) continue;
      if (TONE_RANK[ch]) cur.tone = TONE_RANK[ch];
      else if (MODIFIER[ch] !== undefined) cur.mod = ch;
      continue;
    }
    const lower = ch.toLowerCase();
    cur = { base: lower, upper: lower !== ch, tone: 0, mod: null };
    out.push(cur);
  }
  for (const u of out) {
    let letter = u.base;
    if (u.mod && COMPOSE[u.base] && COMPOSE[u.base][u.mod]) letter = COMPOSE[u.base][u.mod];
    if (LETTER_RANK.has(letter)) {
      u.group = 1;
      u.rank = LETTER_RANK.get(letter);
    } else {
      u.group = 0;
      u.rank = u.base.codePointAt(0);
      u.tone = 0;
    }
  }
  return out;
}

function sign(x) {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

export function compareVi(a, b) {
  requireString(a);
  requireString(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    if (ua[i].group !== ub[i].group) return sign(ua[i].group - ub[i].group);
    if (ua[i].rank !== ub[i].rank) return sign(ua[i].rank - ub[i].rank);
  }
  if (ua.length !== ub.length) return sign(ua.length - ub.length);
  for (let i = 0; i < n; i++) {
    if (ua[i].tone !== ub[i].tone) return sign(ua[i].tone - ub[i].tone);
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].upper !== ub[i].upper) return ua[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw fail('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => ({ v, i }))
    .sort((x, y) => compareVi(x.v, y.v) || x.i - y.i)
    .map((x) => x.v);
}
