// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; làm tròn half-even đúng một lần ở cuối.

const CURRENCIES = ['VND', 'USD', 'EUR'];
const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isCurrency(c) {
  return typeof c === 'string' && CURRENCIES.includes(c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

// m: đối tượng → currency → minor
function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt → money mới (kiểm an toàn, không -0)
function fromBig(big, currency) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

// n / d half-even trên BigInt (d khác 0)
function divBig(n, d) {
  let neg = false;
  if (n < 0n) { n = -n; neg = !neg; }
  if (d < 0n) { d = -d; neg = !neg; }
  let q = n / d;
  const twice = (n % d) * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NUMBER_RES = {};
for (const [name, l] of Object.entries(LOCALES)) {
  const t = escapeRe(l.thousands);
  const d = escapeRe(l.decimal);
  NUMBER_RES[name] = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
}

const TOKEN = '(?:₫|\\$|€|[A-Za-z]{3})';
const LEAD_TOKEN = new RegExp(`^(${TOKEN})\\s*`);
const TRAIL_TOKEN = new RegExp(`\\s*(${TOKEN})$`);

export function parseMoney(text, options = {}) {
  const opts = options === null || options === undefined ? {} : options;
  const localeName = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof localeName !== 'string' || !Object.hasOwn(LOCALES, localeName)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = LEAD_TOKEN.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = TRAIL_TOKEN.exec(s);
  if (trail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, trail.index);
  }

  const match = NUMBER_RES[localeName].exec(s);
  if (!match) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency;
  if (token !== null) {
    const found = Object.keys(SYMBOLS).find((c) => SYMBOLS[c] === token);
    tokenCurrency = found || token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCurrency !== undefined) {
    currency = tokenCurrency;
    if (opts.currency !== undefined && opts.currency !== currency) throw fail('MONEY_CURRENCY_MISMATCH');
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const sep = LOCALES[localeName].thousands;
  const intPart = match[1].split(sep).join('');
  const frac = match[2] || '';
  const dec = DECIMALS[currency];
  let big;
  if (frac.length <= dec) {
    big = BigInt(intPart + frac.padEnd(dec, '0'));
  } else {
    big = divBig(BigInt(intPart + frac), 10n ** BigInt(frac.length - dec));
  }
  return fromBig(negative ? -big : big, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options === null || options === undefined ? {} : options;
  const localeName = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof localeName !== 'string' || !Object.hasOwn(LOCALES, localeName)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const l = LOCALES[localeName];
  const dec = DECIMALS[m.currency];
  const abs = (m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor)).toString().padStart(dec + 1, '0');
  const intDigits = dec ? abs.slice(0, -dec) : abs;
  const fracDigits = dec ? abs.slice(-dec) : '';
  const grouped = intDigits.replace(/\B(?=(\d{3})+$)/g, l.thousands);
  const num = dec ? grouped + l.decimal + fracDigits : grouped;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (l.symbolAfter) body = `${num} ${label}`;
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
  return fromBig(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return fromBig(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divBig(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let scaled = BigInt(i + f);
  if (neg) scaled = -scaled;
  return fromBig(divBig(BigInt(m.minor) * scaled, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const total = ratios.reduce((acc, r) => acc + BigInt(r), 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((acc, p) => acc + p, 0n);
  const order = ratios
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r > 0)
    .sort((x, y) => (y.r - x.r) || (x.idx - y.idx));
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k].idx] += 1n;

  return parts.map((p) => ({
    minor: p === 0n ? 0 : Number(m.minor < 0 ? -p : p),
    currency: m.currency,
  }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw fail('MONEY_MISSING_RATE');
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw fail('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const scaled = BigInt(i + f);
  if (scaled === 0n) throw fail('MONEY_INVALID_RATE');

  let num = BigInt(m.minor) * scaled;
  let den = 10n ** BigInt(f.length);
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  if (shift >= 0) num *= 10n ** BigInt(shift);
  else den *= 10n ** BigInt(-shift);
  return fromBig(divBig(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let total = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    total = total === null ? c : add(total, c);
  }
  return total;
}
