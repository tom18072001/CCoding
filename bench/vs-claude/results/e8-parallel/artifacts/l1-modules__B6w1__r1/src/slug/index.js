// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function needString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'Tham số phải là chuỗi');
  return v;
}

const MARKS = /[̀-ͯ]/g;

export function fold(text) {
  needString(text);
  return text
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let maxLength;
  if (options != null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
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
  if (typeof base !== 'string' || base === '') {
    throw err('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  }
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
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

const LETTERS = 'a ă â b c d đ e ê g h i k l m n o ô ơ p q r s t u ư v x y f j w z'.split(' ');
const RANK = new Map(LETTERS.map((c, i) => [c, i]));
// thanh điệu: huyền, hỏi, ngã, sắc, nặng
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const SHAPE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách thành các token { cls, key, tone, upper }; cls/key theo thứ tự mức 1.
function tokens(s) {
  const out = [];
  let cur = null;
  for (const ch of s.normalize('NFD')) {
    if (/[̀-ͯ]/.test(ch)) {
      if (!cur) continue;
      if (TONE[ch]) cur.tone = TONE[ch];
      else cur.marks.push(ch);
      continue;
    }
    cur = { ch, tone: 0, marks: [] };
    out.push(cur);
  }
  return out.map((t) => {
    const lower = [...t.ch.toLowerCase()][0];
    let letter = lower;
    const shapes = SHAPE[lower];
    if (shapes) {
      for (const m of t.marks) if (shapes[m]) { letter = shapes[m]; break; }
    }
    const idx = RANK.get(letter);
    const isLetter = idx !== undefined;
    return {
      cls: isLetter ? 1 : 0,
      key: isLetter ? idx : lower.codePointAt(0),
      tone: isLetter ? t.tone : 0,
      upper: t.ch !== t.ch.toLowerCase() ? 1 : 0,
    };
  });
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].cls !== y[i].cls) return x[i].cls < y[i].cls ? -1 : 1;
    if (x[i].key !== y[i].key) return x[i].key < y[i].key ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (x[i].tone !== y[i].tone) return x[i].tone < y[i].tone ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    if (x[i].upper !== y[i].upper) return x[i].upper < y[i].upper ? -1 : 1;
  }
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
