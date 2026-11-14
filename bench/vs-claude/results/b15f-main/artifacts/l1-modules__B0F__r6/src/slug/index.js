// Module slug — xem mục "Module slug" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function assertString(v) {
  if (typeof v !== 'string') throw err('SLUG_INVALID_INPUT', 'Đầu vào phải là chuỗi');
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
  let maxLength = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1) {
      throw err('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
    }
    maxLength = m;
  } else if (options !== undefined && options !== null && 'maxLength' in options && options.maxLength === undefined) {
    maxLength = Infinity;
  }
  const words = fold(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const slug = words.join('-');
  if (slug.length <= maxLength) return slug;
  if (words[0].length > maxLength) return words[0].slice(0, maxLength);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = out + '-' + words[i];
    if (next.length > maxLength) break;
    out = next;
  }
  return out;
}

export function uniqueSlug(base, existing) {
  assertString(base);
  if (base === '') throw err('SLUG_INVALID_INPUT', 'base không được rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw err('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  }
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
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

const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i + 1]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);

// Tách chuỗi thành các ký tự: { rank, cp, tone, upper }
function collate(s) {
  const nfd = s.normalize('NFD');
  const out = [];
  for (const ch of nfd) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONES.has(cp)) {
        if (last.tone === 0) last.tone = TONES.get(cp);
      } else if (last.vowel) {
        if (cp === 0x306 && last.base === 'a') last.base = 'ă';
        else if (cp === 0x302 && 'aeo'.includes(last.base)) last.base = last.base === 'a' ? 'â' : last.base === 'e' ? 'ê' : 'ô';
        else if (cp === 0x31b && 'ou'.includes(last.base)) last.base = last.base === 'o' ? 'ơ' : 'ư';
      }
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({
      base: lower,
      upper: lower !== ch,
      tone: 0,
      vowel: lower.length === 1 && 'aeou'.includes(lower),
    });
  }
  return out.map((o) => {
    const rank = RANK.get(o.base) || 0;
    return { rank, cp: o.base.codePointAt(0), tone: o.tone, upper: o.upper };
  });
}

export function compareVi(a, b) {
  assertString(a);
  assertString(b);
  const x = collate(a);
  const y = collate(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
    if (x[i].rank === 0 && x[i].cp !== y[i].cp) return x[i].cp < y[i].cp ? -1 : 1;
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
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) {
    throw err('SLUG_INVALID_INPUT', 'list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
