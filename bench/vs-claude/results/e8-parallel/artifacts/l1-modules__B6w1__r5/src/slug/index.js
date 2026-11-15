// Module slug — chuẩn hóa, so khớp và sắp xếp tiếng Việt (xem SPEC.md).

function err(code, message) {
  const e = new Error(message || code);
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
    if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên ≥ 1');
    }
  }
  const slug = fold(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT', 'base không hợp lệ');
  let set;
  if (existing instanceof Set) set = existing;
  else if (Array.isArray(existing)) set = new Set(existing);
  else throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!set.has(c)) return c;
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

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const SHAPE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách chuỗi thành các ô: { l: ký tự mức 1, rank, tone, upper }
function cells(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let l = cur.base.toLowerCase();
    const shapes = SHAPE[l];
    if (shapes) {
      for (const m of cur.marks) if (shapes[m]) { l = shapes[m]; break; }
    }
    let tone = 0;
    for (const m of cur.marks) if (TONE[m]) { tone = TONE[m]; break; }
    const rank = RANK.has(l) ? RANK.get(l) : -1;
    out.push({ l, rank, tone: rank >= 0 ? tone : 0, upper: cur.base !== cur.base.toLowerCase() });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      if (cur) cur.marks.push(ch);
      continue;
    }
    flush();
    cur = { base: ch, marks: [] };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = cells(a);
  const y = cells(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i], q = y[i];
    if (p.rank >= 0 || q.rank >= 0) {
      if (p.rank !== q.rank) return p.rank < q.rank ? -1 : 1;
    } else if (p.l !== q.l) {
      return p.l.codePointAt(0) < q.l.codePointAt(0) ? -1 : 1;
    }
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
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => [s, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
