// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function assertString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
}

function foldRaw(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function fold(text) {
  assertString(text);
  return foldRaw(text);
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
  const slug = foldRaw(text)
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
  if (typeof base !== 'string' || base === '') {
    throw err('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  }
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
  return foldRaw(s).toLowerCase().replace(/\s+/g, ' ').trim();
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

// --- compareVi ---
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const MODIFIED = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách chuỗi thành dãy { rank, cp, tone, upper }.
function keyOf(s) {
  const cps = Array.from(s.normalize('NFD'));
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    if (/^[̀-ͯ]$/.test(ch)) continue; // dấu mồ côi
    const marks = [];
    while (i + 1 < cps.length && /^[̀-ͯ]$/.test(cps[i + 1])) marks.push(cps[++i]);
    const lower = ch.toLowerCase();
    const upper = lower !== ch;
    let letter = lower;
    let tone = 0;
    if (RANK.has(lower) || MODIFIED[lower]) {
      for (const m of marks) {
        if (TONE[m] !== undefined) tone = TONE[m];
        else if (MODIFIED[lower] && MODIFIED[lower][m] && letter === lower) letter = MODIFIED[lower][m];
      }
    }
    if (RANK.has(letter)) out.push({ rank: RANK.get(letter), cp: 0, tone, upper });
    else out.push({ rank: -1, cp: lower.codePointAt(0), tone: 0, upper });
  }
  return out;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const ka = keyOf(a);
  const kb = keyOf(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i];
    const y = kb[i];
    if (x.rank !== y.rank) return x.rank < y.rank ? -1 : 1;
    if (x.rank === -1 && x.cp !== y.cp) return x.cp < y.cp ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
