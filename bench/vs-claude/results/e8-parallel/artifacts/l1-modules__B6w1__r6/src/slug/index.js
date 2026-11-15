// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function assertString(v, name = 'tham số') {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', `${name} phải là chuỗi`);
}

const MARKS = /[̀-ͯ]/g;

export function fold(text) {
  assertString(text, 'text');
  return text.normalize('NFD').replace(MARKS, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
}

function foldLower(text) {
  return fold(text).toLowerCase().normalize('NFD').replace(MARKS, '').normalize('NFC');
}

export function slugify(text, options) {
  assertString(text, 'text');
  const maxLength = options == null ? undefined : options.maxLength;
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 1)) {
    throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
  }
  const slug = foldLower(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
  assertString(base, 'base');
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base không được rỗng');
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
  return foldLower(s).replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a, 'a');
  assertString(b, 'b');
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack, 'haystack');
  assertString(needle, 'needle');
  return normLoose(haystack).includes(normLoose(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const LETTER_BASE = 0x110000;

// Tách chuỗi thành các phần tử { k: khóa mức 1, t: thanh, u: hoa }
function tokens(s) {
  const chars = Array.from(s.normalize('NFD'));
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    const marks = [];
    while (i + 1 < chars.length && /[̀-ͯ]/.test(chars[i + 1])) marks.push(chars[++i]);
    let base = lower;
    let tone = 0;
    for (const m of marks) if (TONES[m] && !tone) tone = TONES[m];
    if (base === 'a' && marks.includes('̆')) base = 'ă';
    else if (base === 'a' && marks.includes('̂')) base = 'â';
    else if (base === 'e' && marks.includes('̂')) base = 'ê';
    else if (base === 'o' && marks.includes('̂')) base = 'ô';
    else if ((base === 'o' || base === 'u') && marks.includes('̛')) base = base === 'o' ? 'ơ' : 'ư';
    const r = RANK.get(base);
    if (r === undefined) out.push({ k: base.codePointAt(0), t: 0, u: upper });
    else out.push({ k: LETTER_BASE + r, t: tone, u: upper });
  }
  return out;
}

export function compareVi(a, b) {
  assertString(a, 'a');
  assertString(b, 'b');
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].k !== y[i].k) return x[i].k < y[i].k ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].t !== y[i].t) return x[i].t < y[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].u !== y[i].u) return x[i].u ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => ({ s, i }))
    .sort((p, q) => compareVi(p.s, q.s) || p.i - q.i)
    .map((p) => p.s);
}
