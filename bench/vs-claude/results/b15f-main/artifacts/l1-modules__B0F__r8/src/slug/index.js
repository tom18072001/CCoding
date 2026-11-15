// Module slug — xem mục "Module slug" trong SPEC.md (dòng 393–447).

function invalidInput(msg) {
  const e = new Error(msg);
  e.code = 'SLUG_INVALID_INPUT';
  return e;
}

function needString(v, name) {
  if (typeof v !== 'string') throw invalidInput(`${name} phải là chuỗi`);
}

// SPEC.md:399-401
export function fold(text) {
  needString(text, 'text');
  return text
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

// SPEC.md:403-411
export function slugify(text, options) {
  needString(text, 'text');
  let maxLength;
  if (options !== undefined && options !== null && options.maxLength !== undefined) {
    maxLength = options.maxLength;
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      const e = new Error('maxLength phải là số nguyên >= 1');
      e.code = 'SLUG_INVALID_MAXLENGTH';
      throw e;
    }
  }
  const words = fold(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== '');
  let slug = words.join('-');
  if (maxLength !== undefined && slug.length > maxLength) {
    if (words[0].length > maxLength) return words[0].slice(0, maxLength);
    let out = words[0];
    for (let i = 1; i < words.length; i++) {
      if (out.length + 1 + words[i].length > maxLength) break;
      out += '-' + words[i];
    }
    slug = out;
  }
  return slug;
}

// SPEC.md:413-415
export function uniqueSlug(base, existing) {
  if (typeof base !== 'string' || base === '') throw invalidInput('base phải là chuỗi không rỗng');
  if (!Array.isArray(existing) && !(existing instanceof Set)) {
    throw invalidInput('existing phải là mảng hoặc Set');
  }
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!used.has(c)) return c;
  }
}

function loose(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// SPEC.md:417-419
export function looseEquals(a, b) {
  needString(a, 'a');
  needString(b, 'b');
  return loose(a) === loose(b);
}

export function looseIncludes(haystack, needle) {
  needString(haystack, 'haystack');
  needString(needle, 'needle');
  return loose(haystack).includes(loose(needle));
}

// SPEC.md:425-427
const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
const RANK = new Map(ALPHABET.map((c, i) => [c, i]));

// SPEC.md:431: không dấu < huyền < hỏi < ngã < sắc < nặng
const TONE = { '̀': 1, '̉': 2, '̃': 3, '́': 4, '̣': 5 };
const MODS = {
  a: { '̆': 'ă', '̂': 'â' },
  e: { '̂': 'ê' },
  o: { '̂': 'ô', '̛': 'ơ' },
  u: { '̛': 'ư' },
};

// Tách thành token { rank (-1 nếu không phải chữ cái), cp, tone, upper }
function tokenize(s) {
  const tokens = [];
  let cur = null;
  let marks = [];
  const flush = () => {
    if (cur === null) return;
    const lower = cur.toLowerCase();
    let rank = -1;
    let tone = 0;
    let key = lower;
    const mods = MODS[lower];
    if (mods) {
      for (const m of marks) {
        if (mods[m]) { key = mods[m]; break; }
      }
    }
    if (RANK.has(key)) {
      rank = RANK.get(key);
      for (const m of marks) {
        if (TONE[m]) { tone = TONE[m]; break; }
      }
    }
    tokens.push({
      rank,
      cp: rank >= 0 ? 0 : lower.codePointAt(0),
      tone,
      upper: cur !== lower,
    });
    cur = null;
    marks = [];
  };
  for (const ch of s.normalize('NFD')) {
    if (ch >= '̀' && ch <= 'ͯ' && cur !== null) {
      marks.push(ch);
    } else {
      flush();
      cur = ch;
    }
  }
  flush();
  return tokens;
}

function sign(n) {
  return n < 0 ? -1 : n > 0 ? 1 : 0;
}

// SPEC.md:421-437
export function compareVi(a, b) {
  needString(a, 'a');
  needString(b, 'b');
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i];
    const y = tb[i];
    if (x.rank >= 0 && y.rank >= 0) {
      if (x.rank !== y.rank) return sign(x.rank - y.rank);
    } else if (x.rank >= 0) {
      return 1;
    } else if (y.rank >= 0) {
      return -1;
    } else if (x.cp !== y.cp) {
      return sign(x.cp - y.cp);
    }
  }
  if (ta.length !== tb.length) return ta.length < tb.length ? -1 : 1;
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
    throw invalidInput('list phải là mảng chuỗi');
  }
  return list
    .map((v, i) => [v, i])
    .sort((p, q) => compareVi(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[0]);
}
