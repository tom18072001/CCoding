// Module slug — xem mục "Module slug" trong SPEC.md.

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT');
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
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) throw fail('SLUG_INVALID_MAXLENGTH');
    max = m;
  }
  const slug = fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '' || slug.length <= max) return slug;
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
  if (typeof base !== 'string' || base === '') throw fail('SLUG_INVALID_INPUT');
  let set;
  if (Array.isArray(existing)) set = new Set(existing);
  else if (existing instanceof Set) set = existing;
  else throw fail('SLUG_INVALID_INPUT');
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!set.has(c)) return c;
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

// ---- compareVi ----
const ORDER = [...'aăâbcdđeêghiklmnoôơpqrstuưvxy', ...'fjwz'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

// Tách thành các cụm: { cls, key, tone, upper }
function clusters(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const b = cur.base;
    const m = cur.mods;
    let letter = null;
    if (RANK.has(b)) {
      letter = b;
      if (b === 'a') letter = m.has('̆') ? 'ă' : m.has('̂') ? 'â' : 'a';
      else if (b === 'e') letter = m.has('̂') ? 'ê' : 'e';
      else if (b === 'o') letter = m.has('̂') ? 'ô' : m.has('̛') ? 'ơ' : 'o';
      else if (b === 'u') letter = m.has('̛') ? 'ư' : 'u';
    }
    if (letter !== null) {
      out.push({ cls: 1, key: RANK.get(letter), tone: cur.tone, upper: cur.upper });
    } else {
      out.push({ cls: 0, key: b.codePointAt(0), tone: 0, upper: cur.upper });
    }
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    if (/[̀-ͯ]/.test(ch)) {
      if (cur) {
        if (TONES[ch]) cur.tone = TONES[ch];
        else cur.mods.add(ch);
      }
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    cur = { base: [...lower][0], upper: lower !== ch, tone: 0, mods: new Set() };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = clusters(a);
  const y = clusters(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].cls !== y[i].cls) return x[i].cls < y[i].cls ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw fail('SLUG_INVALID_INPUT');
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
