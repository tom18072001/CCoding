// Module slug — chuẩn hóa, so khớp và sắp xếp tiếng Việt (xem SPEC.md).

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
  const maxLength = options == null ? undefined : options.maxLength;
  if (maxLength !== undefined && !(Number.isInteger(maxLength) && maxLength >= 1)) {
    throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
  }
  const slug = foldRaw(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  if (typeof base !== 'string' || base === '') {
    throw err('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  }
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
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

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const isMark = (ch) => /^[̀-ͯ]$/.test(ch);

// Tách thành các cụm: k = hạng chữ cái (-1 nếu không phải chữ cái), tone, upper.
function clusters(s) {
  const out = [];
  const chars = Array.from(s.normalize('NFD'));
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isMark(ch)) continue; // dấu mồ côi
    const marks = [];
    while (i + 1 < chars.length && isMark(chars[i + 1])) marks.push(chars[++i]);
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    let letter = lower;
    if (marks.includes('̆') && lower === 'a') letter = 'ă';
    else if (marks.includes('̂') && (lower === 'a' || lower === 'e' || lower === 'o')) {
      letter = { a: 'â', e: 'ê', o: 'ô' }[lower];
    } else if (marks.includes('̛') && (lower === 'o' || lower === 'u')) {
      letter = lower === 'o' ? 'ơ' : 'ư';
    }
    let tone = 0;
    for (const m of marks) {
      if (TONE[m]) { tone = TONE[m]; break; }
    }
    if (RANK.has(letter)) out.push({ k: RANK.get(letter), tone, upper });
    else out.push({ k: -1, cp: lower.codePointAt(0), tone: 0, upper: false });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = clusters(a);
  const y = clusters(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i];
    const q = y[i];
    if (p.k !== q.k) return p.k < q.k ? -1 : 1;
    if (p.k === -1 && p.cp !== q.cp) return p.cp < q.cp ? -1 : 1;
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
