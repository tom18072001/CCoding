// Module slug — xem mục "Module slug" trong SPEC.md.

function invalid(msg = 'đầu vào không hợp lệ') {
  const err = new Error(msg);
  err.code = 'SLUG_INVALID_INPUT';
  return err;
}

function needString(v) {
  if (typeof v !== 'string') throw invalid();
  return v;
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
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      const err = new Error('maxLength không hợp lệ');
      err.code = 'SLUG_INVALID_MAXLENGTH';
      throw err;
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
    if (out.length + 1 + words[i].length > maxLength) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw invalid();
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw invalid();
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
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

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const MODS = new Map([
  ['ă', 'ă'], ['â', 'â'], ['ê', 'ê'],
  ['ô', 'ô'], ['ơ', 'ơ'], ['ư', 'ư'],
]);

// Tách thành ký tự: { rank (-1 nếu không phải chữ cái), cp, tone, upper }
function tokens(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x31b) {
      const prev = out[out.length - 1];
      if (!prev) continue;
      if (TONES.has(cp)) { prev.tone = TONES.get(cp); continue; }
      const m = MODS.get(prev.ch + String.fromCodePoint(cp));
      if (m) { prev.ch = m; prev.rank = RANK.get(m); prev.cp = m.codePointAt(0); }
      continue;
    }
    const lower = ch.toLowerCase();
    const r = RANK.get(lower);
    out.push({
      ch: lower,
      rank: r === undefined ? -1 : r,
      cp: lower.codePointAt(0),
      tone: 0,
      upper: lower !== ch,
    });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i], q = y[i];
    if (p.rank === -1 && q.rank === -1) {
      if (p.cp !== q.cp) return p.cp < q.cp ? -1 : 1;
    } else if (p.rank === -1) return -1;
    else if (q.rank === -1) return 1;
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
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw invalid();
  return list
    .map((s, i) => ({ s, i }))
    .sort((p, q) => compareVi(p.s, q.s) || p.i - q.i)
    .map((e) => e.s);
}
