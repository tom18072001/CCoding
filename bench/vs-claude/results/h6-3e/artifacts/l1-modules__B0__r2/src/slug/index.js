// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
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
  let max;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    max = options.maxLength;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const slug = words.join('-');
  if (max === undefined || slug.length <= max) return slug;
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT', 'base không hợp lệ');
  let used;
  if (existing instanceof Set) used = existing;
  else if (Array.isArray(existing)) used = new Set(existing);
  else throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
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
const RANK = new Map(LETTERS.map((c, i) => [c, i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const SHAPE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách thành các đơn vị { rank (>=0 chữ cái, -1 không phải), cp, tone, upper }
function units(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let ch = cur.lower;
    const shapes = SHAPE[ch];
    if (shapes) {
      for (const m of cur.marks) {
        if (shapes[m]) { ch = shapes[m]; break; }
      }
    }
    let tone = 0;
    for (const m of cur.marks) {
      if (TONES[m]) { tone = TONES[m]; break; }
    }
    const rank = RANK.has(ch) ? RANK.get(ch) : -1;
    out.push({ rank, cp: ch.codePointAt(0), tone: rank >= 0 ? tone : 0, upper: cur.upper });
    cur = null;
  };
  for (const c of s.normalize('NFD')) {
    if (c >= '̀' && c <= 'ͯ') {
      if (cur) cur.marks.push(c);
      continue;
    }
    flush();
    const lower = c.toLowerCase();
    cur = { lower, upper: lower !== c, marks: [] };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    const x = ua[i];
    const y = ub[i];
    if (x.rank !== y.rank) {
      if (x.rank < 0 && y.rank < 0) return x.cp < y.cp ? -1 : 1;
      if (x.rank < 0) return -1;
      if (y.rank < 0) return 1;
      return x.rank < y.rank ? -1 : 1;
    }
    if (x.rank < 0 && x.cp !== y.cp) return x.cp < y.cp ? -1 : 1;
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].tone !== ub[i].tone) return ua[i].tone < ub[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].upper !== ub[i].upper) return ua[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
