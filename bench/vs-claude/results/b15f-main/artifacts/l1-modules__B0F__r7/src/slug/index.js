// Module slug — xem mục "Module slug" trong SPEC.md.

function slugError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function requireString(v) {
  if (typeof v !== 'string') throw slugError('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
}

export function fold(text) {
  requireString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  requireString(text);
  let maxLength;
  if (options !== undefined && options !== null && typeof options === 'object' && 'maxLength' in options && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw slugError('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
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
  requireString(base);
  if (base === '') throw slugError('SLUG_INVALID_INPUT', 'base không được rỗng');
  let has;
  if (existing instanceof Set) has = (s) => existing.has(s);
  else if (Array.isArray(existing)) {
    const set = new Set(existing);
    has = (s) => set.has(s);
  } else throw slugError('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  if (!has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!has(cand)) return cand;
  }
}

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  requireString(a);
  requireString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  requireString(haystack);
  requireString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i]));
// huyền, hỏi, ngã, sắc, nặng
const TONE = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);

// Tách chuỗi thành dãy {rank, cp, tone, upper}. rank = -1 cho ký tự không phải chữ cái.
function tokenize(s) {
  const tokens = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const t = tokens[tokens.length - 1];
      if (!t) continue;
      if (TONE.has(cp)) t.tone = TONE.get(cp);
      else if (cp === 0x306) t.breve = true;
      else if (cp === 0x302) t.circ = true;
      else if (cp === 0x31b) t.horn = true;
      continue;
    }
    let lower = ch.toLowerCase();
    if ([...lower].length !== 1) lower = ch;
    tokens.push({ base: lower, upper: lower !== ch, tone: 0 });
  }
  for (const t of tokens) {
    let letter = t.base;
    if (t.breve && letter === 'a') letter = 'ă';
    else if (t.circ && (letter === 'a' || letter === 'e' || letter === 'o')) letter = { a: 'â', e: 'ê', o: 'ô' }[letter];
    else if (t.horn && (letter === 'o' || letter === 'u')) letter = letter === 'o' ? 'ơ' : 'ư';
    if (RANK.has(letter)) {
      t.rank = RANK.get(letter);
    } else {
      t.rank = -1;
      t.cp = t.base.codePointAt(0);
      t.tone = 0;
    }
  }
  return tokens;
}

function sign(x) {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

export function compareVi(a, b) {
  requireString(a);
  requireString(b);
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i];
    const y = tb[i];
    if (x.rank !== y.rank) return sign(x.rank - y.rank);
    if (x.rank === -1 && x.cp !== y.cp) return sign(x.cp - y.cp);
  }
  if (ta.length !== tb.length) return sign(ta.length - tb.length);
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
    throw slugError('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => ({ v, i }))
    .sort((p, q) => compareVi(p.v, q.v) || p.i - q.i)
    .map((p) => p.v);
}
