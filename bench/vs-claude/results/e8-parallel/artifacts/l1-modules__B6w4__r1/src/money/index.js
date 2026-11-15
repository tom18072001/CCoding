// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousand: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousand: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function isCurrency(c) {
  return typeof c === 'string' && has(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function isPlainObject(o) {
  return o !== null && typeof o === 'object' && !Array.isArray(o);
}

function checkMoney(m) {
  if (!isPlainObject(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function make(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency }; // BigInt 0n -> +0
}

function absBig(x) {
  return x < 0n ? -x : x;
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function normOptions(options) {
  return options === undefined || options === null ? {} : options;
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !has(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  // Tách đúng một token loại tiền (đứng đầu hoặc cuối).
  const lead = s.match(/^(?:(₫|\$|€)|([A-Za-z]+))\s*/);
  const trail = s.match(/\s*(?:(₫|\$|€)|([A-Za-z]+))$/);
  const tokOf = (m) => (m[1] !== undefined ? m[1] : m[2]);
  if (lead && trail && lead[0].length < s.length) throw fail('MONEY_INVALID_AMOUNT');
  let token = null;
  let body = s;
  if (lead) {
    token = tokOf(lead);
    body = s.slice(lead[0].length);
  } else if (trail) {
    token = tokOf(trail);
    body = s.slice(0, s.length - trail[0].length);
  }
  if (token !== null && /^[A-Za-z]+$/.test(token) && token.length !== 3) throw fail('MONEY_INVALID_AMOUNT');

  const t = escapeRe(loc.thousand);
  const d = escapeRe(loc.decimal);
  const mm = body.match(new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`));
  if (!mm) throw fail('MONEY_INVALID_AMOUNT');
  const intDigits = mm[1].split(loc.thousand).join('');
  const frac = mm[2] || '';

  let tokenCurrency = null;
  if (token !== null) {
    if (has(SYMBOL_TO_CODE, token)) tokenCurrency = SYMBOL_TO_CODE[token];
    else {
      tokenCurrency = token.toUpperCase();
      if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
    }
  }
  let currency;
  if (tokenCurrency === null) {
    if (options.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    currency = options.currency;
  } else {
    if (options.currency !== undefined && options.currency !== tokenCurrency) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCurrency;
  }

  const all = BigInt(intDigits + frac);
  const scale = frac.length - DECIMALS[currency];
  let minor = scale > 0 ? divRound(all, 10n ** BigInt(scale)) : all * 10n ** BigInt(-scale);
  if (negative) minor = -minor;
  return make(minor, currency);
}

function groupDigits(str, sep) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  options = normOptions(options);
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  let digits = absBig(BigInt(m.minor)).toString();
  let num;
  if (dec > 0) {
    digits = digits.padStart(dec + 1, '0');
    num = groupDigits(digits.slice(0, -dec), loc.thousand) + loc.decimal + digits.slice(-dec);
  } else {
    num = groupDigits(digits, loc.thousand);
  }
  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) body = `${num} ${label}`;
    else body = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

// Chuỗi thập phân -> { int: BigInt không dấu, scale, neg }
function decimalParts(str) {
  const [i, f = ''] = str.replace('-', '').split('.');
  return { int: BigInt(i + f), scale: f.length, neg: str.startsWith('-') };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const p = decimalParts(factor);
  let num = BigInt(m.minor) * p.int;
  if (p.neg) num = -num;
  return make(divRound(num, 10n ** BigInt(p.scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = absBig(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: Number(neg ? -p : p), currency: m.currency }));
}

function convertChecked(m, to, rates) {
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (!isPlainObject(rates)) throw fail('MONEY_INVALID_RATE');
  if (!has(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isPlainObject(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const p = decimalParts(rate);
  if (p.int === 0n) throw fail('MONEY_INVALID_RATE');
  const diff = DECIMALS[to] - DECIMALS[m.currency];
  let num = BigInt(m.minor) * p.int;
  let den = 10n ** BigInt(p.scale);
  if (diff >= 0) num *= 10n ** BigInt(diff);
  else den *= 10n ** BigInt(-diff);
  return make(divRound(num, den), to);
}

export function convert(m, to, rates) {
  checkCurrency(to);
  return convertChecked(m, to, rates);
}

export function convertSum(list, to, rates) {
  checkCurrency(to);
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let acc = null;
  for (const item of list) {
    const c = convertChecked(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
