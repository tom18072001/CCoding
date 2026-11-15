// Module slug — xem mục "Module slug" trong SPEC.md.

function invalidInput() {
  const e = new Error('SLUG_INVALID_INPUT');
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function str(x) {
  if (typeof x !== 'string') throw invalidInput();
  return x;
}

export function fold(text) {
  str(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  str(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    max = options.maxLength;
    if (!Number.isInteger(max) || max < 1) {
      const e = new Error('SLUG_INVALID_MAXLENGTH');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
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
  if (typeof base !== 'string' || base === '') throw invalidInput();
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw invalidInput();
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  str(a);
  str(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  str(haystack);
  str(needle);
  return norm(haystack).includes(norm(needle));
}

const ORDER = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const RANK = new Map([...ORDER].map((c, i) => [c, i]));
const TONES = new Map([
  [0x300, 1],
  [0x309, 2],
  [0x303, 3],
  [0x301, 4],
  [0x323, 5],
]);
const MODS = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};

// Tách thành các phần tử { rank, code, tone, upper }
function parse(s) {
  const cps = [...s.normalize('NFD')];
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    const raw = cps[i];
    const lower = raw.toLowerCase();
    const upper = lower !== raw;
    let ch = lower;
    let tone = 0;
    let j = i + 1;
    while (j < cps.length && /^[̀-ͯ]$/.test(cps[j])) {
      const m = cps[j].codePointAt(0);
      if (TONES.has(m)) tone = TONES.get(m);
      else if (MODS[m] && MODS[m][ch]) ch = MODS[m][ch];
      j++;
    }
    i = j - 1;
    if (RANK.has(ch)) out.push({ rank: RANK.get(ch), code: 0, tone, upper });
    else out.push({ rank: -1, code: ch.codePointAt(0), tone: 0, upper });
  }
  return out;
}

function cmpNum(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function compareVi(a, b) {
  str(a);
  str(b);
  const x = parse(a);
  const y = parse(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const c = cmpNum(x[i].rank, y[i].rank) || (x[i].rank === -1 ? cmpNum(x[i].code, y[i].code) : 0);
    if (c) return c;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const c = cmpNum(x[i].tone, y[i].tone);
    if (c) return c;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].upper !== y[i].upper) return x[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw invalidInput();
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
