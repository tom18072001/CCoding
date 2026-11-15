// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'Đầu vào phải là chuỗi');
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
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  const lower = fold(fold(text).toLowerCase());
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (maxLength === undefined || slug.length <= maxLength) return slug;
  const words = slug.split('-');
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
  if (typeof base !== 'string' || base === '') {
    throw err('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  }
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
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

const ORDER = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const RANK = new Map([...ORDER].map((c, i) => [c, i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

// Tách thành các phần tử { letter, base, rank | cp, tone, upper }.
function keys(str) {
  const out = [];
  for (const ch of str.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    const last = out[out.length - 1];
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!last || !last.letter) continue;
      if (TONES[ch]) last.tone = TONES[ch];
      else if (ch === '̆' && last.base === 'a') last.base = 'ă';
      else if (ch === '̂' && 'aeo'.includes(last.base)) last.base = { a: 'â', e: 'ê', o: 'ô' }[last.base];
      else if (ch === '̛' && 'ou'.includes(last.base)) last.base = { o: 'ơ', u: 'ư' }[last.base];
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ letter: RANK.has(lower), base: lower, tone: 0, upper: lower !== ch });
  }
  for (const k of out) {
    if (k.letter) k.rank = RANK.get(k.base);
    else k.cp = k.base.codePointAt(0);
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ka = keys(a);
  const kb = keys(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i];
    const y = kb[i];
    if (x.letter !== y.letter) return x.letter ? 1 : -1;
    const dx = x.letter ? x.rank : x.cp;
    const dy = y.letter ? y.rank : y.cp;
    if (dx !== dy) return dx < dy ? -1 : 1;
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

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
