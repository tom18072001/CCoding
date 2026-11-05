// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid(msg) {
  const e = new Error(msg);
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function requireString(v, name = 'tham số') {
  if (typeof v !== 'string') throw invalid(`${name} phải là chuỗi`);
}

export function fold(text) {
  requireString(text, 'text');
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  requireString(text, 'text');
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      const e = new Error('maxLength phải là số nguyên >= 1');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
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
    const next = out + '-' + words[i];
    if (next.length > maxLength) break;
    out = next;
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw invalid('base phải là chuỗi không rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw invalid('existing phải là mảng hoặc Set');
  }
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function normalizeLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  requireString(a, 'a');
  requireString(b, 'b');
  return normalizeLoose(a) === normalizeLoose(b);
}

export function looseIncludes(haystack, needle) {
  requireString(haystack, 'haystack');
  requireString(needle, 'needle');
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

// ---- Sắp xếp tiếng Việt ----
const LETTERS = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(LETTERS.map((c, i) => [c, i]));
// dấu phụ tạo chữ cái: breve, circumflex, horn
const MODIFIERS = { '̆': 'ă', '̂': null, '̛': null };
const TONES = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };

// Tách chuỗi thành dãy {nonLetter, key, tone, upper}
function tokenize(s) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) { out.push(finish(cur)); cur = null; } };
  const finish = (t) => {
    if (t.base === null) return t;
    let letter = t.base;
    if (t.mod) {
      const m = t.base + t.mod;
      const composed = { 'ă': 'ă', 'â': 'â', 'ê': 'ê', 'ô': 'ô',
        'ơ': 'ơ', 'ư': 'ư' }[m];
      if (composed) letter = composed;
    }
    return { rank: RANK.get(letter), cp: 0, letter: true, tone: t.tone, upper: t.upper };
  };
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      if (!cur || cur.base === null) continue;
      if (TONES[ch] && !cur.tone) cur.tone = TONES[ch];
      else if (ch in MODIFIERS && !cur.mod) cur.mod = ch;
      continue;
    }
    flush();
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    const first = String.fromCodePoint(lower.codePointAt(0));
    if (first === 'đ' || RANK.has(first)) {
      cur = { base: first, mod: null, tone: 0, upper };
    } else {
      out.push({ rank: -1, cp: first.codePointAt(0), letter: false, tone: 0, upper });
    }
  }
  flush();
  return out;
}

function sign(n) { return n < 0 ? -1 : n > 0 ? 1 : 0; }

export function compareVi(a, b) {
  requireString(a, 'a');
  requireString(b, 'b');
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i], y = tb[i];
    if (x.letter !== y.letter) return x.letter ? 1 : -1;
    if (x.letter) {
      if (x.rank !== y.rank) return sign(x.rank - y.rank);
    } else if (x.cp !== y.cp) {
      return sign(x.cp - y.cp);
    }
  }
  if (ta.length !== tb.length) return ta.length < tb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ta[i].tone !== tb[i].tone) return sign(ta[i].tone - tb[i].tone);
  }
  for (let i = 0; i < n; i++) {
    if (ta[i].upper !== tb[i].upper) return ta[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw invalid('list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
