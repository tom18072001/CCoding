// slug — xem SPEC.md, mục "Module slug". Không dùng Intl.Collator / localeCompare.

function err(code, message) {
  const e = new Error(message || code);
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
  const opts = options === null || options === undefined ? {} : options;
  const max = opts.maxLength;
  if (max !== undefined && !(Number.isInteger(max) && max >= 1)) throw err('SLUG_INVALID_MAXLENGTH');

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
  let used;
  if (existing instanceof Set) used = existing;
  else if (Array.isArray(existing)) used = new Set(existing);
  else throw err('SLUG_INVALID_INPUT');
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

function normalizeLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return normalizeLoose(a) === normalizeLoose(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

// ---- compareVi ----

const LETTERS = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const RANK = new Map(Array.from(LETTERS).map((c, i) => [c, i]));
const LETTER_BASE = 0x110000; // lớn hơn mọi mã Unicode: chữ cái đứng sau ký tự khác
// 0300 huyền, 0309 hỏi, 0303 ngã, 0301 sắc, 0323 nặng
const TONES = new Map([
  [0x300, 1],
  [0x309, 2],
  [0x303, 3],
  [0x301, 4],
  [0x323, 5],
]);
const CIRC = { a: 'â', e: 'ê', o: 'ô' };

// Trả mảng { k, tone, upper } cho từng ký tự.
function viKey(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur === null) return;
    let k;
    if (RANK.has(cur.letter)) k = LETTER_BASE + RANK.get(cur.letter);
    else k = cur.letter.codePointAt(0);
    out.push({ k, tone: cur.tone, upper: cur.upper });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (cur === null) continue;
      if (TONES.has(cp)) {
        if (cur.tone === 0) cur.tone = TONES.get(cp);
      } else if (cp === 0x302 && CIRC[cur.letter]) cur.letter = CIRC[cur.letter];
      else if (cp === 0x306 && cur.letter === 'a') cur.letter = 'ă';
      else if (cp === 0x31b && cur.letter === 'o') cur.letter = 'ơ';
      else if (cp === 0x31b && cur.letter === 'u') cur.letter = 'ư';
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    cur = { letter: lower, tone: 0, upper: lower !== ch };
  }
  flush();
  return out;
}

function compareKeys(ka, kb) {
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i].k !== kb[i].k) return ka[i].k < kb[i].k ? -1 : 1;
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ka[i].tone !== kb[i].tone) return ka[i].tone < kb[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ka[i].upper !== kb[i].upper) return ka[i].upper ? 1 : -1;
  }
  return 0;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  return compareKeys(viKey(a), viKey(b));
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  const items = list.map((s, i) => ({ s, i, key: viKey(s) }));
  items.sort((x, y) => compareKeys(x.key, y.key) || x.i - y.i);
  return items.map((x) => x.s);
}
