// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const CURRENCIES = ['VND', 'USD', 'EUR'];
const SYMBOLS = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const SYMBOL_OF = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', after: false },
  'vi-VN': { thousand: '.', decimal: ',', after: true },
  'fr-FR': { thousand: ' ', decimal: ',', after: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function checkCurrency(c) {
  if (typeof c !== 'string' || !CURRENCIES.includes(c)) throw err('MONEY_INVALID_CURRENCY');
  return c;
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
  return m;
}

function make(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency }; // Number(0n) là +0
}

function absBig(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, d != 0 (BigInt)
function divRound(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const an = neg ? -n : n;
  let q = an / d;
  const r = an % d;
  const twice = r * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

const pow10 = (k) => 10n ** BigInt(k);

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getOptions(options) {
  return options === undefined || options === null ? {} : options;
}

function getLocale(options) {
  const loc = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function parseMoney(text, options = {}) {
  options = getOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  const bad = () => err('MONEY_INVALID_AMOUNT');
  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw bad();
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let token = null;
  const head = /^(₫|\$|€|[A-Za-z]{3})\s*/.exec(s);
  if (head) {
    token = head[1];
    s = s.slice(head[0].length);
  }
  const tail = /\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (tail) {
    if (token !== null) throw bad();
    token = tail[1];
    s = s.slice(0, tail.index);
  }

  const T = escRe(loc.thousand);
  const D = escRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?$`);
  const mm = re.exec(s);
  if (!mm) throw bad();

  let cur = null;
  if (token !== null) {
    if (Object.hasOwn(SYMBOLS, token)) cur = SYMBOLS[token];
    else {
      cur = token.toUpperCase();
      if (!CURRENCIES.includes(cur)) throw err('MONEY_INVALID_CURRENCY');
    }
  }
  if (cur === null) {
    if (options.currency === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = options.currency;
  } else if (options.currency !== undefined && options.currency !== cur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const intPart = mm[1].split(loc.thousand).join('');
  const frac = mm[2] || '';
  const dec = DIGITS[cur];
  const all = BigInt(intPart + frac);
  let val;
  if (frac.length <= dec) val = all * pow10(dec - frac.length);
  else val = divRound(all, pow10(frac.length - dec));
  return make(negative ? -val : val, cur);
}

export function formatMoney(m, options = {}) {
  options = getOptions(options);
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DIGITS[m.currency];
  const abs = absBig(BigInt(m.minor)).toString().padStart(dec + 1, '0');
  const intStr = abs.slice(0, abs.length - dec);
  const fracStr = abs.slice(abs.length - dec);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = dec > 0 ? grouped + loc.decimal + fracStr : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const mark = display === 'symbol' ? SYMBOL_OF[m.currency] : m.currency;
    if (loc.after) out = `${num} ${mark}`;
    else out = display === 'symbol' ? `${mark}${num}` : `${mark} ${num}`;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let F = BigInt(i + f);
  if (neg) F = -F;
  return make(divRound(BigInt(m.minor) * F, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) ||
    ratios.length === 0 ||
    !ratios.every((r) => Number.isSafeInteger(r) && r >= 0)
  ) {
    throw err('MONEY_INVALID_RATIO');
  }
  const T = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = absBig(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((s, p) => s + p, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw err('MONEY_MISSING_RATE');
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw err('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const R = BigInt(i + f);
  if (R === 0n) throw err('MONEY_INVALID_RATE');
  const shift = DIGITS[to] - DIGITS[m.currency];
  let num = BigInt(m.minor) * R;
  let den = pow10(f.length);
  if (shift >= 0) num *= pow10(shift);
  else den *= pow10(-shift);
  return make(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
