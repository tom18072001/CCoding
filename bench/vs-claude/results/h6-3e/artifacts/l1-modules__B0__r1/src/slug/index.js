// Module slug — xem mục "Module slug" trong SPEC.md.

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function needString(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT');
  return v;
}

const MARKS = /[̀-ͯ]/g;

function foldRaw(text) {
  return text.normalize('NFD').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(MARKS, '').normalize('NFC');
}

export function fold(text) {
  return foldRaw(needString(text));
}

export function slugify(text, options) {
  needString(text);
  let max;
  if (options != null && options.maxLength !== undefined) {
    max = options.maxLength;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) {
      throw fail('SLUG_INVALID_MAXLENGTH');
    }
  }
  const words = foldRaw(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const full = words.join('-');
  if (max === undefined || full.length <= max) return full;
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
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw fail('SLUG_INVALID_INPUT');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

function norm(s) {
  return foldRaw(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return norm(haystack).includes(norm(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

// Tách thành các đơn vị { rank (>=0 chữ cái) | cp (không phải chữ cái), tone, upper }
function units(s) {
  const chars = Array.from(s.normalize('NFD'));
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    let tone = 0;
    let mod = '';
    let j = i + 1;
    while (j < chars.length && /[̀-ͯ]/.test(chars[j])) {
      const m = chars[j];
      if (TONE[m]) tone = TONE[m];
      else if (m === '̆' || m === '̂' || m === '̛') mod = m;
      j++;
    }
    i = j - 1;
    let letter = lower;
    if (lower === 'a') letter = mod === '̆' ? 'ă' : mod === '̂' ? 'â' : 'a';
    else if (lower === 'e') letter = mod === '̂' ? 'ê' : 'e';
    else if (lower === 'o') letter = mod === '̂' ? 'ô' : mod === '̛' ? 'ơ' : 'o';
    else if (lower === 'u') letter = mod === '̛' ? 'ư' : 'u';
    if (RANK.has(letter)) out.push({ rank: RANK.get(letter), tone, upper });
    else out.push({ rank: -1, cp: lower.codePointAt(0), tone: 0, upper });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = units(a);
  const y = units(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i], q = y[i];
    if (p.rank < 0 && q.rank < 0) {
      if (p.cp !== q.cp) return p.cp < q.cp ? -1 : 1;
    } else if (p.rank < 0) return -1;
    else if (q.rank < 0) return 1;
    else if (p.rank !== q.rank) return p.rank < q.rank ? -1 : 1;
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
    .map((s, i) => [s, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
