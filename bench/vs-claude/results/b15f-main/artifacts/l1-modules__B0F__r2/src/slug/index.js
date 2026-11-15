// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'Đầu vào phải là chuỗi');
}

function foldRaw(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function fold(text) {
  needString(text);
  return foldRaw(text);
}

export function slugify(text, options) {
  needString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  let slug = foldRaw(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (maxLength !== undefined && slug.length > maxLength) {
    const words = slug.split('-');
    if (words[0].length > maxLength) {
      slug = words[0].slice(0, maxLength);
    } else {
      let out = words[0];
      for (let i = 1; i < words.length; i++) {
        if (out.length + 1 + words[i].length <= maxLength) out += '-' + words[i];
        else break;
      }
      slug = out;
    }
  }
  return slug;
}

export function uniqueSlug(base, existing) {
  needString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base không được rỗng');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) has = (s) => existing.includes(s);
  else throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function looseNorm(s) {
  return foldRaw(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return looseNorm(a) === looseNorm(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return looseNorm(haystack).includes(looseNorm(needle));
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);

// Tách chuỗi thành các ký tự: { cls: 0 (không phải chữ cái) | 1 (chữ cái), r, tone, upper }
function tokenize(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let base = cur.base;
    if (base === 'a' && cur.marks.has(0x306)) base = 'ă';
    else if ((base === 'a' || base === 'e' || base === 'o') && cur.marks.has(0x302)) {
      base = { a: 'â', e: 'ê', o: 'ô' }[base];
    } else if ((base === 'o' || base === 'u') && cur.marks.has(0x31b)) {
      base = base === 'o' ? 'ơ' : 'ư';
    }
    let tone = 0;
    for (const m of cur.marks) if (TONES.has(m)) { tone = TONES.get(m); break; }
    if (RANK.has(base)) out.push({ cls: 1, r: RANK.get(base), tone, upper: cur.upper });
    else out.push({ cls: 0, r: base.codePointAt(0), tone: 0, upper: cur.upper });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (cur) cur.marks.add(cp);
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    cur = { base: lower, upper: lower !== ch, marks: new Set() };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokenize(a);
  const y = tokenize(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].cls !== y[i].cls) return x[i].cls < y[i].cls ? -1 : 1;
    if (x[i].r !== y[i].r) return x[i].r < y[i].r ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
