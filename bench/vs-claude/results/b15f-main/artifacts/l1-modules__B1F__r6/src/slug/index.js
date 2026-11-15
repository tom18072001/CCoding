// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid(msg) {
  const e = new Error(msg);
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function checkStr(s) {
  if (typeof s !== 'string') throw invalid('đầu vào phải là chuỗi');
}

export function fold(text) {
  checkStr(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function slugify(text, options) {
  checkStr(text);
  const opts = options == null ? {} : options;
  let max = Infinity;
  if (opts.maxLength !== undefined) {
    if (!Number.isInteger(opts.maxLength) || opts.maxLength < 1) {
      const e = new Error('maxLength không hợp lệ');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
    max = opts.maxLength;
  }
  const words = fold(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const full = words.join('-');
  if (full.length <= max) return full;
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw invalid('base không hợp lệ');
  let set;
  if (existing instanceof Set) set = existing;
  else if (Array.isArray(existing)) set = new Set(existing);
  else throw invalid('existing không hợp lệ');
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!set.has(c)) return c;
  }
}

export function looseEquals(a, b) {
  checkStr(a);
  checkStr(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  checkStr(haystack);
  checkStr(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_KEY = new Map(ALPHABET.map((c, i) => [c, 0x110000 + i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

// Tách chuỗi thành các đơn vị { key, tone, upper }.
function units(s) {
  const out = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    let ch = cur.ch;
    if (cur.breve && ch === 'a') ch = 'ă';
    else if (cur.circ && (ch === 'a' || ch === 'e' || ch === 'o')) ch = { a: 'â', e: 'ê', o: 'ô' }[ch];
    else if (cur.horn && (ch === 'o' || ch === 'u')) ch = ch === 'o' ? 'ơ' : 'ư';
    const isLetter = LETTER_KEY.has(ch);
    out.push({
      key: isLetter ? LETTER_KEY.get(ch) : ch.codePointAt(0),
      tone: isLetter ? cur.tone : 0,
      upper: cur.upper,
    });
    cur = null;
  };
  for (const c of s.normalize('NFD')) {
    if (c >= '̀' && c <= 'ͯ') {
      if (!cur) continue;
      if (TONE[c]) cur.tone = TONE[c];
      else if (c === '̆') cur.breve = true;
      else if (c === '̂') cur.circ = true;
      else if (c === '̛') cur.horn = true;
      continue;
    }
    finish();
    const lower = c.toLowerCase();
    cur = { ch: lower, upper: lower !== c, tone: 0 };
  }
  finish();
  return out;
}

export function compareVi(a, b) {
  checkStr(a);
  checkStr(b);
  const ua = units(a);
  const ub = units(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    if (ua[i].key !== ub[i].key) return ua[i].key < ub[i].key ? -1 : 1;
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
    throw invalid('list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => ({ s, i }))
    .sort((x, y) => compareVi(x.s, y.s) || x.i - y.i)
    .map((x) => x.s);
}
