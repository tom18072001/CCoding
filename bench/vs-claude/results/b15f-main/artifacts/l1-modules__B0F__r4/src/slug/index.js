// Module slug — xem mục "Module slug" trong SPEC.md.
// Không dùng Intl.Collator / localeCompare; bảng chữ cái và thanh điệu tự viết.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function assertString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
}

const COMBINING = /[̀-ͯ]/g;

export function fold(text) {
  assertString(text);
  return text
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  assertString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
  }
  const slug = fold(text)
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
  assertString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a);
  assertString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack);
  assertString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

// ---- Sắp xếp tiếng Việt ----

const ALPHABET = [
  'a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z',
];
const RANK = new Map(ALPHABET.map((c, i) => [c, i]));

// không dấu < huyền < hỏi < ngã < sắc < nặng
const TONE = new Map([
  [0x0300, 1], [0x0309, 2], [0x0303, 3], [0x0301, 4], [0x0323, 5],
]);

// Tách thành danh sách {rank, cp, tone, upper}. rank = -1 nếu không phải chữ cái.
function tokenize(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let letter = cur.lower;
    if (cur.mod === 0x0306 && letter === 'a') letter = 'ă';
    else if (cur.mod === 0x0302 && (letter === 'a' || letter === 'e' || letter === 'o')) {
      letter = { a: 'â', e: 'ê', o: 'ô' }[letter];
    } else if (cur.mod === 0x031b && (letter === 'o' || letter === 'u')) {
      letter = letter === 'o' ? 'ơ' : 'ư';
    }
    const rank = RANK.has(letter) ? RANK.get(letter) : -1;
    out.push({
      rank,
      cp: rank === -1 ? cur.lower : '',
      tone: rank === -1 ? 0 : cur.tone,
      upper: cur.upper,
    });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0300 && cp <= 0x036f) {
      if (!cur) continue;
      if (TONE.has(cp)) cur.tone = TONE.get(cp);
      else if (cp === 0x0306 || cp === 0x0302 || cp === 0x031b) cur.mod = cp;
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    cur = { lower, upper: lower !== ch, tone: 0, mod: 0 };
  }
  flush();
  return out;
}

function cmpCodePoints(a, b) {
  const x = Array.from(a, (c) => c.codePointAt(0));
  const y = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

function cmpLevel1(p, q) {
  if (p.rank === -1 && q.rank === -1) return cmpCodePoints(p.cp, q.cp);
  if (p.rank === -1) return -1;
  if (q.rank === -1) return 1;
  return p.rank === q.rank ? 0 : p.rank < q.rank ? -1 : 1;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const x = tokenize(a);
  const y = tokenize(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const c = cmpLevel1(x[i], y[i]);
    if (c !== 0) return c;
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
  return list.slice().sort(compareVi);
}
