// slug — xem SPEC.md, mục "Module slug".
// Không dùng Intl.Collator / localeCompare.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function str(x) {
  if (typeof x !== 'string') throw err('SLUG_INVALID_INPUT');
  return x;
}

export function fold(text) {
  str(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  str(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const slug = words.join('-');
  if (maxLength === undefined || slug.length <= maxLength) return slug;
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let k = 1; k < words.length; k++) {
    if (out.length + 1 + words[k].length > maxLength) break;
    out += '-' + words[k];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) has = (s) => existing.includes(s);
  else throw err('SLUG_INVALID_INPUT');
  if (!has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!has(cand)) return cand;
  }
}

function normalizeLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  str(a);
  str(b);
  return normalizeLoose(a) === normalizeLoose(b);
}

export function looseIncludes(haystack, needle) {
  str(haystack);
  str(needle);
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i + 1]));
const TONES = new Map([
  [0x300, 1], // huyền
  [0x309, 2], // hỏi
  [0x303, 3], // ngã
  [0x301, 4], // sắc
  [0x323, 5], // nặng
]);
const MODIFIERS = {
  a: { 0x306: 'ă', 0x302: 'â' },
  e: { 0x302: 'ê' },
  o: { 0x302: 'ô', 0x31b: 'ơ' },
  u: { 0x31b: 'ư' },
};

// Tách thành dãy { cp, rank, tone, upper }.
function keys(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    let ch = cur.ch;
    if (cur.mod !== null && MODIFIERS[ch]?.[cur.mod]) ch = MODIFIERS[ch][cur.mod];
    const rank = RANK.get(ch) ?? 0;
    out.push({
      rank,
      cp: rank ? 0 : ch.codePointAt(0),
      tone: rank ? cur.tone : 0,
      upper: cur.upper,
    });
    cur = null;
  };
  for (const c of s.normalize('NFD')) {
    const cp = c.codePointAt(0);
    if (/^\p{M}$/u.test(c)) {
      if (!cur) continue;
      if (TONES.has(cp)) cur.tone = TONES.get(cp);
      else if (cp === 0x306 || cp === 0x302 || cp === 0x31b) cur.mod = cp;
      continue;
    }
    flush();
    const lc = c.toLowerCase();
    cur = { ch: Array.from(lc)[0], upper: lc !== c, tone: 0, mod: null };
  }
  flush();
  return out;
}

const sign = (x) => (x < 0 ? -1 : x > 0 ? 1 : 0);

export function compareVi(a, b) {
  const ka = keys(str(a));
  const kb = keys(str(b));
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i];
    const y = kb[i];
    if (x.rank !== y.rank) return sign(x.rank - y.rank);
    if (x.rank === 0 && x.cp !== y.cp) return sign(x.cp - y.cp);
  }
  if (ka.length !== kb.length) return sign(ka.length - kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i].tone !== kb[i].tone) return sign(ka[i].tone - kb[i].tone);
  }
  for (let i = 0; i < n; i++) {
    if (ka[i].upper !== kb[i].upper) return ka[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return [...list].sort(compareVi);
}
