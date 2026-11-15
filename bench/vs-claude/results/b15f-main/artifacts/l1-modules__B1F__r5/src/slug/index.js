// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function assertString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
}

const MARKS_RE = /[̀-ͯ]/g;

export function fold(text) {
  assertString(text);
  return text
    .normalize('NFD')
    .replace(MARKS_RE, '')
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
  } else if (options !== undefined && options !== null && typeof options === 'object') {
    // không có maxLength
  }
  let slug = fold(text)
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT', 'base không hợp lệ');
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
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a);
  assertString(b);
  return looseNorm(a) === looseNorm(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack);
  assertString(needle);
  return looseNorm(haystack).includes(looseNorm(needle));
}

// ---- Sắp xếp tiếng Việt ----

const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(LETTERS.map((ch, i) => [ch.normalize('NFC'), i]));
const LETTER_BASE = 0x110000;

const COMPOSE = new Map([
  ['ă', 'ă'], ['â', 'â'], ['ê', 'ê'],
  ['ô', 'ô'], ['ơ', 'ơ'], ['ư', 'ư'],
]);
const TONES = new Map([['̀', 1], ['̉', 2], ['̃', 3], ['́', 4], ['̣', 5]]);

// Tách chuỗi thành các đơn vị { k: khóa mức 1, t: thanh điệu, u: 1 nếu chữ hoa }
function units(str) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let ch = cur.lower;
    for (const m of cur.marks) {
      const c = COMPOSE.get(ch + m);
      if (c && ch.length === 1) { ch = c; break; }
    }
    const rank = LETTER_RANK.get(ch);
    if (rank !== undefined) {
      let tone = 0;
      for (const m of cur.marks) {
        if (TONES.has(m)) { tone = TONES.get(m); break; }
      }
      out.push({ k: LETTER_BASE + rank, t: tone, u: cur.upper ? 1 : 0 });
    } else {
      out.push({ k: cur.lower.codePointAt(0), t: 0, u: cur.upper ? 1 : 0 });
    }
    cur = null;
  };
  for (const cp of str.normalize('NFD')) {
    if (cp >= '̀' && cp <= 'ͯ') {
      if (cur) cur.marks.push(cp);
      continue;
    }
    flush();
    const lower = cp.toLowerCase();
    cur = { lower, upper: lower !== cp, marks: [] };
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    if (ua[i].k !== ub[i].k) return ua[i].k < ub[i].k ? -1 : 1;
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].t !== ub[i].t) return ua[i].t < ub[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].u !== ub[i].u) return ua[i].u < ub[i].u ? -1 : 1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list)) throw err('SLUG_INVALID_INPUT', 'list phải là mảng');
  for (let i = 0; i < list.length; i++) assertString(list[i]);
  return list.slice().sort(compareVi);
}
