// Module slug — xem mục "Module slug" trong SPEC.md.

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function assertString(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT', 'đầu vào phải là chuỗi');
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
      throw fail('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
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

function normLoose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  assertString(a);
  assertString(b);
  return normLoose(a) === normLoose(b);
}

export function looseIncludes(haystack, needle) {
  assertString(haystack);
  assertString(needle);
  return normLoose(haystack).includes(normLoose(needle));
}

const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i]));
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const COMPOSE = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách chuỗi thành dãy phần tử { rank, cp, tone, upper }.
function tokens(s) {
  const out = [];
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ') {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONE[ch]) last.tone = TONE[ch];
      else if (last.base !== undefined && COMPOSE[last.base] && COMPOSE[last.base][ch] && !last.mod) {
        last.mod = COMPOSE[last.base][ch];
      }
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ base: lower, mod: null, tone: 0, upper: ch !== lower, cp: ch.codePointAt(0) });
  }
  for (const t of out) {
    const letter = t.mod || t.base;
    if (RANK.has(letter)) {
      t.cls = 1;
      t.rank = RANK.get(letter);
    } else {
      t.cls = 0;
      t.rank = t.cp;
      t.tone = 0;
    }
  }
  return out;
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const x = tokens(a);
  const y = tokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].cls !== y[i].cls) return x[i].cls < y[i].cls ? -1 : 1;
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
    throw fail('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((s, i) => [s, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
