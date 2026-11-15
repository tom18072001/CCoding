// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT');
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
  checkString(text);
  return foldRaw(text);
}

export function slugify(text, options) {
  checkString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const words = foldRaw(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const slug = words.join('-');
  if (maxLength === undefined || slug.length <= maxLength) return slug;
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > maxLength) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function normLoose(s) {
  return foldRaw(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  checkString(a);
  checkString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  checkString(haystack);
  checkString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const LETTER_BASE = 0x110000;

// Tách chuỗi thành các token { key, tone, upper }.
function tokenize(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let base = cur.ch.toLowerCase();
    const upper = cur.ch !== base;
    if (cur.mods.has(0x306) && base === 'a') base = 'ă';
    else if (cur.mods.has(0x302) && (base === 'a' || base === 'e' || base === 'o')) {
      base = base === 'a' ? 'â' : base === 'e' ? 'ê' : 'ô';
    } else if (cur.mods.has(0x31b) && (base === 'o' || base === 'u')) base = base === 'o' ? 'ơ' : 'ư';
    const rank = RANK.get(base);
    if (rank !== undefined) out.push({ key: LETTER_BASE + rank, tone: cur.tone, upper });
    else out.push({ key: base.codePointAt(0), tone: 0, upper });
    cur = null;
  };
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!cur) continue;
      if (TONES.has(cp)) cur.tone = TONES.get(cp);
      else cur.mods.add(cp);
    } else {
      flush();
      cur = { ch, mods: new Set(), tone: 0 };
    }
  }
  flush();
  return out;
}

export function compareVi(a, b) {
  checkString(a);
  checkString(b);
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    if (ta[i].key !== tb[i].key) return ta[i].key < tb[i].key ? -1 : 1;
  }
  if (ta.length !== tb.length) return ta.length < tb.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ta[i].tone !== tb[i].tone) return ta[i].tone < tb[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ta[i].upper !== tb[i].upper) return ta[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list
    .map((v, i) => ({ v, i }))
    .sort((x, y) => compareVi(x.v, y.v) || x.i - y.i)
    .map((x) => x.v);
}
