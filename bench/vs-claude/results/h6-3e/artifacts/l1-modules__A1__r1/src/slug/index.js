// slug — xem SPEC.md, mục "Module slug". Không dùng Intl / localeCompare.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function needString(s) {
  if (typeof s !== 'string') throw err('SLUG_INVALID_INPUT');
  return s;
}

export function fold(text) {
  needString(text);
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function slugify(text, options) {
  needString(text);
  let max = Infinity;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    const m = options.maxLength;
    if (!Number.isInteger(m) || m < 1) throw err('SLUG_INVALID_MAXLENGTH');
    max = m;
  }
  const slug = fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const words = slug.split('-');
  if (words[0].length > max) return words[0].slice(0, max);
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    if (out.length + 1 + words[i].length > max) break;
    out += '-' + words[i];
  }
  return out;
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw err('SLUG_INVALID_INPUT');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw err('SLUG_INVALID_INPUT');
  const used = existing instanceof Set ? existing : new Set(existing);
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const cand = `${base}-${k}`;
    if (!used.has(cand)) return cand;
  }
}

function norm(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  needString(a);
  needString(b);
  return norm(a) === norm(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack);
  needString(needle);
  return norm(haystack).includes(norm(needle));
}

// ---- so sánh tiếng Việt ----
const ORDER = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ORDER.map((c, i) => [c, i + 1]));
const TONES = { '\u0300': 1, '\u0309': 2, '\u0303': 3, '\u0301': 4, '\u0323': 5 };
const MODIFIERS = {
  '\u0306': { a: 'ă' },
  '\u0302': { a: 'â', e: 'ê', o: 'ô' },
  '\u031b': { o: 'ơ', u: 'ư' },
};

// -> mảng { rank (0 nếu không phải chữ cái), cp, tone, upper }
function keys(s) {
  const chars = Array.from(s.normalize('NFD'));
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/^[\u0300-\u036f]$/.test(ch)) continue; // dấu mồ côi: bỏ
    const marks = [];
    while (i + 1 < chars.length && /^[\u0300-\u036f]$/.test(chars[i + 1])) marks.push(chars[++i]);
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    let letter = lower;
    let tone = 0;
    if (RANK.has(lower) || lower === 'đ') {
      for (const mk of marks) {
        if (MODIFIERS[mk] && MODIFIERS[mk][letter] && letter.length === 1 && 'aeou'.includes(letter)) {
          letter = MODIFIERS[mk][letter];
        }
      }
      for (const mk of marks) {
        if (TONES[mk]) {
          tone = TONES[mk];
          break;
        }
      }
    }
    if (RANK.has(letter)) out.push({ rank: RANK.get(letter), cp: 0, tone, upper });
    else out.push({ rank: 0, cp: lower.codePointAt(0), tone: 0, upper });
  }
  return out;
}

export function compareVi(a, b) {
  needString(a);
  needString(b);
  const x = keys(a);
  const y = keys(b);
  const len = Math.min(x.length, y.length);
  for (let i = 0; i < len; i++) {
    if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
    if (x[i].rank === 0 && x[i].cp !== y[i].cp) return x[i].cp < y[i].cp ? -1 : 1;
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < len; i++) if (x[i].tone !== y[i].tone) return x[i].tone < y[i].tone ? -1 : 1;
  for (let i = 0; i < len; i++) if (x[i].upper !== y[i].upper) return x[i].upper ? 1 : -1;
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) throw err('SLUG_INVALID_INPUT');
  return [...list].sort(compareVi);
}
