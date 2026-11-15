function mkErr(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
function needStr(s) {
  if (typeof s !== 'string') throw mkErr('SLUG_INVALID_INPUT');
}

export function fold(text) {
  needStr(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  needStr(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (!Number.isSafeInteger(m) || m < 1) throw mkErr('SLUG_INVALID_MAXLENGTH');
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
  if (typeof base !== 'string' || base === '') throw mkErr('SLUG_INVALID_INPUT');
  let has;
  if (existing instanceof Set) has = (x) => existing.has(x);
  else if (Array.isArray(existing)) has = (x) => existing.includes(x);
  else throw mkErr('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let i = 2; ; i++) {
    const c = `${base}-${i}`;
    if (!has(c)) return c;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
export function looseEquals(a, b) {
  needStr(a);
  needStr(b);
  return norm(a) === norm(b);
}
export function looseIncludes(haystack, needle) {
  needStr(haystack);
  needStr(needle);
  return norm(haystack).includes(norm(needle));
}

// ---- Vietnamese collation ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

function keyOf(s) {
  const chars = Array.from(s.normalize('NFD'));
  const l1 = [];
  const l2 = [];
  const l3 = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i++];
    const marks = [];
    while (i < chars.length && chars[i] >= '̀' && chars[i] <= 'ͯ') marks.push(chars[i++]);
    const lower = ch.toLowerCase();
    const upper = lower !== ch ? 1 : 0;
    let base = lower;
    let tone = 0;
    for (const m of marks) {
      if (TONES[m]) tone = TONES[m];
      else if (m === '̆' && base === 'a') base = 'ă';
      else if (m === '̂' && (base === 'a' || base === 'e' || base === 'o')) base = { a: 'â', e: 'ê', o: 'ô' }[base];
      else if (m === '̛' && (base === 'o' || base === 'u')) base = base === 'o' ? 'ơ' : 'ư';
    }
    if (RANK.has(base)) {
      l1.push([1, RANK.get(base)]);
      l2.push(tone);
    } else {
      l1.push([0, base.codePointAt(0)]);
      l2.push(0);
    }
    l3.push(upper);
  }
  return { l1, l2, l3 };
}

export function compareVi(a, b) {
  needStr(a);
  needStr(b);
  const x = keyOf(a);
  const y = keyOf(b);
  const n = Math.min(x.l1.length, y.l1.length);
  for (let i = 0; i < n; i++) {
    const [ta, va] = x.l1[i];
    const [tb, vb] = y.l1[i];
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (va !== vb) return va < vb ? -1 : 1;
  }
  if (x.l1.length !== y.l1.length) return x.l1.length < y.l1.length ? -1 : 1;
  for (let i = 0; i < n; i++) if (x.l2[i] !== y.l2[i]) return x.l2[i] < y.l2[i] ? -1 : 1;
  for (let i = 0; i < n; i++) if (x.l3[i] !== y.l3[i]) return x.l3[i] < y.l3[i] ? -1 : 1;
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) throw mkErr('SLUG_INVALID_INPUT');
  return list.slice().sort(compareVi);
}
