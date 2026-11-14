// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid() {
  const e = new Error('SLUG_INVALID_INPUT');
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw invalid();
}

function foldRaw(text) {
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function fold(text) {
  needString(text);
  return foldRaw(text);
}

export function slugify(text, options) {
  needString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      const e = new Error('SLUG_INVALID_MAXLENGTH');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
    max = m;
  }
  const slug = foldRaw(text)
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
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (s) => set.has(s);
  } else throw invalid();
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!has(c)) return c;
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

// ---- compareVi ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i + 1]));
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);

// Tách thành các ký tự: { rank, cp, tone, upper }
function tokens(s) {
  const out = [];
  const nfd = s.normalize('NFD');
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let base = cur.base.toLowerCase();
    const upper = base !== cur.base;
    if (cur.mods.has(0x306) && base === 'a') base = 'ă';
    else if (cur.mods.has(0x302) && (base === 'a' || base === 'e' || base === 'o')) {
      base = base === 'a' ? 'â' : base === 'e' ? 'ê' : 'ô';
    } else if (cur.mods.has(0x31b) && (base === 'o' || base === 'u')) {
      base = base === 'o' ? 'ơ' : 'ư';
    }
    const rank = RANK.get(base) || 0;
    const tone = rank ? cur.tone : 0;
    out.push({ rank, cp: base.codePointAt(0), tone, upper });
    cur = null;
  };
  for (const ch of nfd) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!cur) continue;
      if (TONE.has(cp)) {
        if (!cur.tone) cur.tone = TONE.get(cp);
      } else cur.mods.add(cp);
    } else {
      flush();
      cur = { base: ch, mods: new Set(), tone: 0 };
    }
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
    if (x[i].rank === 0 && x[i].cp !== y[i].cp) return x[i].cp < y[i].cp ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) throw invalid();
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
