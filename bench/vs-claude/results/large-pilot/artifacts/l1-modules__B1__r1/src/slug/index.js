// Module slug — xem mục "Module slug" trong SPEC.md.

function invalidInput() {
  const err = new Error('Đầu vào không hợp lệ');
  err.code = 'SLUG_INVALID_INPUT';
  return err;
}

function assertString(value) {
  if (typeof value !== 'string') throw invalidInput();
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
  if (typeof base !== 'string' || base === '') throw invalidInput();
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw invalidInput();
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

function normalizeLoose(text) {
  return fold(text).toLowerCase().replace(/\s+/g, ' ').trim();
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

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const LETTER_RANK = new Map(ALPHABET.map((ch, i) => [ch, i]));

// Thứ tự thanh điệu: không dấu < huyền < hỏi < ngã < sắc < nặng.
const TONE_RANK = new Map([[0x0300, 1], [0x0309, 2], [0x0303, 3], [0x0301, 4], [0x0323, 5]]);

// Tách chuỗi thành các đơn vị { letter, rank, tone, upper }.
function toUnits(text) {
  const units = [];
  const chars = Array.from(text.normalize('NFD'));
  for (let i = 0; i < chars.length; ) {
    const ch = chars[i++];
    let base = ch.toLowerCase();
    const upper = base !== ch;
    let tone = 0;
    let mark = '';
    while (i < chars.length && /[̀-ͯ]/.test(chars[i])) {
      const cp = chars[i].codePointAt(0);
      if (TONE_RANK.has(cp)) tone = TONE_RANK.get(cp);
      else if (cp === 0x0306 || cp === 0x0302 || cp === 0x031b) mark = chars[i];
      i++;
    }
    if (mark) {
      const composed = (base + mark).normalize('NFC');
      if (LETTER_RANK.has(composed)) base = composed;
    }
    if (LETTER_RANK.has(base)) {
      units.push({ letter: true, rank: LETTER_RANK.get(base), tone, upper });
    } else {
      units.push({ letter: false, rank: base.codePointAt(0), tone: 0, upper });
    }
  }
  return units;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const ua = toUnits(a);
  const ub = toUnits(b);
  const n = Math.min(ua.length, ub.length);
  for (let i = 0; i < n; i++) {
    const x = ua[i];
    const y = ub[i];
    if (x.letter !== y.letter) return x.letter ? 1 : -1;
    if (x.rank !== y.rank) return x.rank < y.rank ? -1 : 1;
  }
  if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (ua[i].tone !== ub[i].tone) return ua[i].tone < ub[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (ua[i].upper !== ub[i].upper) return ua[i].upper ? 1 : -1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) throw invalidInput();
  return list
    .map((value, index) => ({ value, index }))
    .sort((x, y) => compareVi(x.value, y.value) || x.index - y.index)
    .map((e) => e.value);
}
