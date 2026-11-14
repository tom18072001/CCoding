// Module slug — xem mục "Module slug" trong SPEC.md.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function assertString(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
}

export function fold(text) {
  assertString(text);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  assertString(text);
  let maxLength;
  if (options != null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw fail('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên ≥ 1');
    }
  }
  const slug = fold(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
  assertString(base);
  if (base === '') throw fail('SLUG_INVALID_INPUT', 'base không được rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw fail('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a);
  assertString(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack);
  assertString(needle);
  return norm(haystack).includes(norm(needle));
}

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, 0x200000 + i]));
// Dấu mũ/trăng/móc hợp lệ theo chữ gốc
const MODS = {
  0x306: { a: 'ă' },
  0x302: { a: 'â', e: 'ê', o: 'ô' },
  0x31b: { o: 'ơ', u: 'ư' },
};
// huyền < hỏi < ngã < sắc < nặng
const TONES = { 0x300: 1, 0x309: 2, 0x303: 3, 0x301: 4, 0x323: 5 };

// Tách chuỗi thành dãy đơn vị {k: khóa mức 1, t: thanh, u: hoa}
function units(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONES[cp]) last.t = TONES[cp];
      else if (MODS[cp] && last.ch && MODS[cp][last.ch]) {
        last.ch = MODS[cp][last.ch];
        last.k = RANK.get(last.ch);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    const u = lower !== ch ? 1 : 0;
    const rank = RANK.get(lower);
    if (rank !== undefined) out.push({ ch: lower, k: rank, t: 0, u });
    else out.push({ ch: null, k: ch.codePointAt(0), t: 0, u: 0 });
  }
  return out;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const x = units(a);
  const y = units(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].k !== y[i].k) return x[i].k < y[i].k ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].t !== y[i].t) return x[i].t < y[i].t ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].u !== y[i].u) return x[i].u < y[i].u ? -1 : 1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
    throw fail('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => ({ s, i }))
    .sort((p, q) => compareVi(p.s, q.s) || p.i - q.i)
    .map((p) => p.s);
}
