// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid(msg = 'đầu vào không hợp lệ') {
  const e = new Error(msg);
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function checkStr(s) {
  if (typeof s !== 'string') throw invalid();
}

export function fold(text) {
  checkStr(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  checkStr(text);
  let max = Infinity;
  if (options != null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      const e = new Error('maxLength không hợp lệ');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
    max = m;
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
  if (typeof base !== 'string' || base === '') throw invalid();
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) has = (s) => existing.includes(s);
  else throw invalid();
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  checkStr(a);
  checkStr(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  checkStr(haystack);
  checkStr(needle);
  return norm(haystack).includes(norm(needle));
}

// ---- sắp xếp ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MODS = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};

// Mảng khóa theo ký tự: r = hạng chữ cái (-1 nếu không phải chữ cái), t = thanh, u = hoa
function keys(s) {
  const out = [];
  const chars = Array.from(s.normalize('NFD'));
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i++];
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) continue; // dấu mồ côi
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    let base = Array.from(lower.normalize('NFD'))[0];
    let tone = 0;
    let mod = null;
    while (i < chars.length) {
      const m = chars[i].codePointAt(0);
      if (m < 0x300 || m > 0x36f) break;
      i++;
      if (TONES.has(m)) {
        if (!tone) tone = TONES.get(m);
      } else if (MODS[m] && MODS[m][base] && !mod) mod = MODS[m][base];
    }
    if (mod) base = mod;
    if (RANK.has(base)) out.push({ r: RANK.get(base), t: tone, u: upper });
    else out.push({ r: -1, c: base.codePointAt(0), t: 0, u: upper });
  }
  return out;
}

export function compareVi(a, b) {
  checkStr(a);
  checkStr(b);
  const ka = keys(a);
  const kb = keys(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i], y = kb[i];
    if (x.r !== y.r) return x.r < y.r ? -1 : 1;
    if (x.r < 0 && x.c !== y.c) return x.c < y.c ? -1 : 1;
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ka[i].t !== kb[i].t) return ka[i].t < kb[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ka[i].u !== kb[i].u) return ka[i].u ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw invalid();
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
