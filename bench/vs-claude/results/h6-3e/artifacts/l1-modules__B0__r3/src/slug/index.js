// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT');
  return v;
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
  let maxLength;
  if (options !== undefined && options !== null && typeof options === 'object') {
    maxLength = options.maxLength;
  }
  if (maxLength !== undefined && !(Number.isInteger(maxLength) && maxLength >= 1)) {
    throw err('SLUG_INVALID_MAXLENGTH');
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const full = words.join('-');
  if (maxLength === undefined || full.length <= maxLength) return full;
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = out + '-' + words[i];
    if (next.length > maxLength) break;
    out = next;
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  let set;
  if (existing instanceof Set) set = existing;
  else if (Array.isArray(existing)) set = new Set(existing);
  else throw err('SLUG_INVALID_INPUT');
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!set.has(cand)) return cand;
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

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);

// Trả mảng cụm { letter, k: khóa mức 1, tone: mức 2, upper: mức 3 }
function clusters(str) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const marks = cur.marks;
    let ch = cur.lower;
    if (ch === 'a' && marks.has(0x306)) ch = 'ă';
    else if (ch === 'a' && marks.has(0x302)) ch = 'â';
    else if (ch === 'e' && marks.has(0x302)) ch = 'ê';
    else if (ch === 'o' && marks.has(0x302)) ch = 'ô';
    else if ((ch === 'o' || ch === 'u') && marks.has(0x31b)) ch = ch === 'o' ? 'ơ' : 'ư';
    let tone = 0;
    for (const m of marks) {
      if (TONE.has(m)) {
        tone = TONE.get(m);
        break;
      }
    }
    if (RANK.has(ch)) out.push({ letter: true, k: RANK.get(ch), tone, upper: cur.upper });
    else out.push({ letter: false, k: ch.codePointAt(0), tone: 0, upper: cur.upper });
    cur = null;
  };
  for (const ch of str.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (cur) cur.marks.add(cp);
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    cur = { lower, upper: lower !== ch, marks: new Set() };
  }
  flush();
  return out;
}

function cmpKeys(ka, kb) {
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i];
    const y = kb[i];
    if (x.letter !== y.letter) return x.letter ? 1 : -1;
    if (x.k !== y.k) return x.k < y.k ? -1 : 1;
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
  return cmpKeys(clusters(a), clusters(b));
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list
    .map((s, i) => ({ s, i, k: clusters(s) }))
    .sort((x, y) => cmpKeys(x.k, y.k) || x.i - y.i)
    .map((x) => x.s);
}
