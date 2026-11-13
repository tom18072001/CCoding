// slug — xem SPEC.md, mục "Module slug".

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
  return s;
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
    max = options.maxLength;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const slug = fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
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
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  let has;
  if (existing instanceof Set) has = (x) => existing.has(x);
  else if (Array.isArray(existing)) has = (x) => existing.includes(x);
  else throw err('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!has(cand)) return cand;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
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

// --- sắp xếp tiếng Việt ---
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i + 1]));
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const COMPOSE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// → [{ ch (chữ thường, đã ghép), tone, upper }]
function keyOf(s) {
  const out = [];
  for (const c of s.normalize('NFD')) {
    if (c >= '̀' && c <= 'ͯ') {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONES[c]) last.tone = TONES[c];
      else if (COMPOSE[last.ch] && COMPOSE[last.ch][c] && !last.mod) {
        last.ch = COMPOSE[last.ch][c];
        last.mod = true;
      }
      continue;
    }
    const lower = c.toLowerCase();
    out.push({ ch: lower, tone: 0, upper: lower !== c, mod: false });
  }
  return out;
}

function cmpChar(x, y) {
  const rx = RANK.get(x) || 0;
  const ry = RANK.get(y) || 0;
  if (rx && ry) return rx - ry;
  if (rx) return 1;
  if (ry) return -1;
  const cx = x.codePointAt(0);
  const cy = y.codePointAt(0);
  return cx - cy;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const ka = keyOf(a);
  const kb = keyOf(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const d = cmpChar(ka[i].ch, kb[i].ch);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ka[i].tone !== kb[i].tone) return ka[i].tone < kb[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ka[i].upper !== kb[i].upper) return ka[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list.slice().sort(compareVi);
}
