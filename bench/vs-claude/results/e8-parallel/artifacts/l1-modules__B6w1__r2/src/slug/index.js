// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
}

export function fold(text) {
  needString(text);
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) throw err('SLUG_INVALID_MAXLENGTH');
  }
  const words = fold(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const full = words.join('-');
  if (maxLength === undefined || full.length <= maxLength) return full;
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > maxLength) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  needString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ORDER = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const RANK = new Map([...ORDER].map((c, i) => [c, i]));
const TONES = new Map([
  [0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5],
]);
const MODS = new Map([[0x302, '̂'], [0x306, '̆'], [0x31b, '̛']]);

// Tách chuỗi thành các đơn vị {k: khóa mức 1, t: thanh, u: hoa}.
function units(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    const last = out[out.length - 1];
    if (cp >= 0x300 && cp <= 0x36f) {
      if (!last || last.letter === null) continue;
      if (TONES.has(cp)) last.t = TONES.get(cp);
      else if (MODS.has(cp)) {
        const r = RANK.get((last.letter + MODS.get(cp)).normalize('NFC'));
        if (r !== undefined && !last.modded) {
          last.k = r;
          last.modded = true;
        }
      }
      continue;
    }
    const lower = ch.toLowerCase();
    const r = RANK.get(lower);
    out.push({
      letter: r === undefined ? null : lower,
      k: r === undefined ? lower.codePointAt(0) : r,
      isLetter: r !== undefined,
      t: 0,
      u: lower !== ch,
      modded: false,
    });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const A = units(a);
  const B = units(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i], y = B[i];
    if (x.isLetter !== y.isLetter) return x.isLetter ? 1 : -1;
    if (x.k !== y.k) return x.k < y.k ? -1 : 1;
  }
  if (A.length !== B.length) return A.length < B.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (A[i].t !== B[i].t) return A[i].t < B[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (A[i].u !== B[i].u) return A[i].u ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw err('SLUG_INVALID_INPUT');
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
