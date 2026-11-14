// Module slug — chuẩn hóa, so khớp và sắp xếp tiếng Việt. Xem SPEC.md.

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkString(s) {
  if (typeof s !== 'string') throw fail('SLUG_INVALID_INPUT');
}

export function fold(text) {
  checkString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  checkString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (!Number.isInteger(m) || m < 1) throw fail('SLUG_INVALID_MAXLENGTH');
    max = m;
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
  const slug = words.join('-');
  if (slug.length <= max) return slug;
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw fail('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw fail('SLUG_INVALID_INPUT');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!used.has(cand)) return cand;
  }
}

function normalizeLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  checkString(a);
  checkString(b);
  return normalizeLoose(a) === normalizeLoose(b);
}

export function looseIncludes(haystack, needle) {
  checkString(haystack);
  checkString(needle);
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

// ---- So sánh tiếng Việt ----
const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(ALPHABET.map((c, i) => [c, 0x110000 + i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const BREVE = '̆';
const CIRC = '̂';
const HORN = '̛';

// Tách chuỗi thành các đơn vị { key, tone, upper }.
function units(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let key;
    if (cur.letter) {
      let l = cur.lower;
      if (cur.mods.has(BREVE) && l === 'a') l = 'ă';
      else if (cur.mods.has(CIRC) && (l === 'a' || l === 'e' || l === 'o')) {
        l = { a: 'â', e: 'ê', o: 'ô' }[l];
      } else if (cur.mods.has(HORN) && (l === 'o' || l === 'u')) l = l === 'o' ? 'ơ' : 'ư';
      key = LETTER_RANK.get(l);
    } else key = cur.lower.codePointAt(0);
    out.push({ key, tone: cur.letter ? cur.tone : 0, upper: cur.upper });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      if (!cur) continue;
      if (Object.hasOwn(TONES, ch)) cur.tone = TONES[ch];
      else cur.mods.add(ch);
      continue;
    }
    flush();
    let lower = ch.toLowerCase();
    let upper = lower !== ch;
    if (ch === 'Đ') {
      lower = 'đ';
      upper = true;
    }
    cur = { lower, upper, letter: LETTER_RANK.has(lower), tone: 0, mods: new Set() };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  checkString(a);
  checkString(b);
  const x = units(a);
  const y = units(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].key !== y[i].key) return x[i].key < y[i].key ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
    throw fail('SLUG_INVALID_INPUT');
  }
  return list.slice().sort(compareVi);
}
