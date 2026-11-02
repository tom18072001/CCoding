// Lời giải tham chiếu module slug (không dùng Intl.Collator / localeCompare).

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function str(v) {
  if (typeof v !== 'string') throw fail('SLUG_INVALID_INPUT', 'Đầu vào phải là chuỗi');
  return v;
}

const MARKS = /[̀-ͯ]/g;

export function fold(text) {
  str(text);
  return text.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(MARKS, '').normalize('NFC');
}

export function slugify(text, options) {
  str(text);
  const max = options && options.maxLength;
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    throw fail('SLUG_INVALID_MAXLENGTH', 'maxLength phải là số nguyên >= 1');
  }
  const slug = fold(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (max === undefined || slug.length <= max) return slug;
  let out = '';
  for (const w of slug.split('-')) {
    const cand = out ? out + '-' + w : w;
    if (cand.length > max) break;
    out = cand;
  }
  return out || slug.split('-')[0].slice(0, max);
}

export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw fail('SLUG_INVALID_INPUT', 'base phải là chuỗi không rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) throw fail('SLUG_INVALID_INPUT', 'existing phải là mảng hoặc Set');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function loose(s) {
  return fold(str(s)).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function looseEquals(a, b) {
  return loose(a) === loose(b);
}

export function looseIncludes(haystack, needle) {
  return loose(haystack).includes(loose(needle));
}

const ORDER = 'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz';
const RANK = new Map([...ORDER].map((c, i) => [c, 0x200000 + i]));
const TONES = new Map([[0x300, 1], [0x309, 2], [0x303, 3], [0x301, 4], [0x323, 5]]);
const COMPOSE = new Map([['ă', 'ă'], ['â', 'â'], ['ê', 'ê'], ['ô', 'ô'], ['ơ', 'ơ'], ['ư', 'ư']]);

// Tách thành dãy {rank, tone, upper}
function keys(s) {
  const nfd = str(s).normalize('NFD');
  const out = [];
  for (const ch of nfd) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (TONES.has(cp)) last.tone = TONES.get(cp);
      else if (COMPOSE.has(last.base + ch)) {
        last.base = COMPOSE.get(last.base + ch);
        last.rank = RANK.get(last.base);
      }
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ base: lower, rank: RANK.has(lower) ? RANK.get(lower) : cp, tone: 0, upper: lower !== ch });
  }
  return out;
}

export function compareVi(a, b) {
  const x = keys(a);
  const y = keys(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i].rank !== y[i].rank) return x[i].rank < y[i].rank ? -1 : 1;
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) if (x[i].tone !== y[i].tone) return x[i].tone < y[i].tone ? -1 : 1;
  for (let i = 0; i < n; i++) if (x[i].upper !== y[i].upper) return x[i].upper ? 1 : -1;
  return 0;
}

export function sortVi(list) {
  if (!Array.isArray(list)) throw fail('SLUG_INVALID_INPUT', 'list phải là mảng');
  for (const s of list) str(s);
  return [...list].sort(compareVi);
}
