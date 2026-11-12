// Module slug — xem mục "Module slug" trong SPEC.md.
// Không dùng Intl.Collator / localeCompare; mọi thứ tự do bảng tự định nghĩa.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function assertString(x) {
  if (typeof x !== 'string') throw err('SLUG_INVALID_INPUT', 'tham số phải là chuỗi');
}

export function fold(text) {
  assertString(text);
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function slugify(text, options) {
  assertString(text);
  let maxLength;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('SLUG_INVALID_MAXLENGTH', 'options sai kiểu');
    maxLength = options.maxLength;
  }
  if (maxLength !== undefined) {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
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
  assertString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base rỗng');
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

function normalizeLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a);
  assertString(b);
  return normalizeLoose(a) === normalizeLoose(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack);
  assertString(needle);
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

// ---- Sắp xếp tiếng Việt ----

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(ORDER.map((ch, i) => [ch, 0x110000 + i]));

// huyền, hỏi, ngã, sắc, nặng
const TONE = new Map([[0x0300, 1], [0x0309, 2], [0x0303, 3], [0x0301, 4], [0x0323, 5]]);
const MODIFIER = new Map([[0x0306, 'ă'], [0x0302, '^'], [0x031b, '+']]);
const COMPOSED = {
  a: { 0x0306: 'ă', 0x0302: 'â' },
  e: { 0x0302: 'ê' },
  o: { 0x0302: 'ô', 0x031b: 'ơ' },
  u: { 0x031b: 'ư' },
};

// Trả về mảng phần tử { r: hạng mức 1, t: thanh, u: có hoa }.
function viKeys(s) {
  const chars = Array.from(s.normalize('NFD'));
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    let cp = c.codePointAt(0);
    if (cp >= 0x0300 && cp <= 0x036f) continue; // dấu kết hợp mồ côi: bỏ qua
    const lower = c.toLowerCase();
    const upper = lower !== c;
    let tone = 0;
    let mod = 0;
    let j = i + 1;
    while (j < chars.length) {
      const m = chars[j].codePointAt(0);
      if (m < 0x0300 || m > 0x036f) break;
      if (TONE.has(m)) tone = TONE.get(m);
      else if (MODIFIER.has(m)) mod = m;
      j++;
    }
    i = j - 1;
    let letter = lower;
    if (mod && COMPOSED[lower] && COMPOSED[lower][mod]) letter = COMPOSED[lower][mod];
    let r;
    if (LETTER_RANK.has(letter)) {
      r = LETTER_RANK.get(letter);
    } else {
      r = lower.codePointAt(0);
      tone = 0;
    }
    out.push({ r, t: tone, u: upper });
  }
  return out;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const ka = viKeys(a);
  const kb = viKeys(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i].r !== kb[i].r) return ka[i].r < kb[i].r ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list.slice().sort(compareVi);
}
