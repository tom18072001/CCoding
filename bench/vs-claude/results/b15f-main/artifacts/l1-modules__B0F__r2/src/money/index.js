// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOL = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', after: false },
  'vi-VN': { group: '.', dec: ',', after: true },
  'fr-FR': { group: ' ', dec: ',', after: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function isObj(x) {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function checkMoney(m) {
  if (!isObj(m)) throw fail('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
  return m;
}

// BigInt -> Number an toàn, không -0.
function toSafe(big) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return Number(big);
}

function make(big, currency) {
  return { minor: toSafe(big), currency };
}

// n / d half-even trên BigInt (d != 0).
function divRound(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  const twice = (a % b) * 2n;
  if (twice > b || (twice === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const opts = options === undefined || options === null ? {} : options;
  const name = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return { opts, loc: LOCALES[name], name };
}

export function parseMoney(text, options = {}) {
  const { opts, loc } = getLocale(options);
  if (opts.currency !== undefined && !isCurrency(opts.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
    neg = true;
  } else if (s.startsWith('-') || s.startsWith('+')) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = s.match(/^(₫|\$|€|[A-Za-z]+)\s*/);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = s.match(/\s*(₫|\$|€|[A-Za-z]+)$/);
  if (trail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, s.length - trail[0].length);
  }
  if (token !== null && !/^(₫|\$|€|[A-Za-z]{3})$/.test(token)) throw fail('MONEY_INVALID_AMOUNT');

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${esc(loc.group)}\\d{3})+)(?:${esc(loc.dec)}(\\d+))?$`);
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const intPart = mt[1].split(loc.group).join('');
  const fracPart = mt[2] || '';

  let tokenCur = null;
  if (token !== null) {
    tokenCur = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  const optCur = opts.currency;
  let cur;
  if (tokenCur === null && optCur === undefined) throw fail('MONEY_INVALID_CURRENCY');
  if (tokenCur !== null && optCur !== undefined && tokenCur !== optCur) throw fail('MONEY_CURRENCY_MISMATCH');
  cur = tokenCur !== null ? tokenCur : optCur;

  const d = DIGITS[cur];
  let big;
  if (fracPart.length <= d) {
    big = BigInt(intPart + fracPart.padEnd(d, '0'));
  } else {
    big = BigInt(intPart + fracPart.slice(0, d));
    const rest = fracPart.slice(d);
    const first = Number(rest[0]);
    const more = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && more) || (first === 5 && !more && big % 2n === 1n)) big += 1n;
  }
  return make(neg ? -big : big, cur);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const { opts, loc, name } = getLocale(options);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const d = DIGITS[m.currency];
  const abs = String(Math.abs(m.minor)).padStart(d + 1, '0');
  const intRaw = abs.slice(0, abs.length - d);
  const frac = abs.slice(abs.length - d);
  const grouped = intRaw.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = d > 0 ? grouped + loc.dec + frac : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOL[m.currency] : m.currency;
    if (name === 'en-US') out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return make(divRound(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let T = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
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

function rateOf(from, to, rates) {
  if (!isObj(rates)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, from)) throw fail('MONEY_MISSING_RATE');
  const row = rates[from];
  if (!isObj(row)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const r = row[to];
  if (typeof r !== 'string' || !/^\d+(\.\d+)?$/.test(r) || /^0+(\.0+)?$/.test(r)) throw fail('MONEY_INVALID_RATE');
  return r;
}

export function convert(m, to, rates) {
  if (!isCurrency(to)) throw fail('MONEY_INVALID_CURRENCY');
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  const r = rateOf(m.currency, to, rates);
  const [i, f = ''] = r.split('.');
  const num = BigInt(i + f);
  const exp = DIGITS[to] - DIGITS[m.currency];
  let n = BigInt(m.minor) * num;
  let d = 10n ** BigInt(f.length);
  if (exp >= 0) n *= 10n ** BigInt(exp);
  else d *= 10n ** BigInt(-exp);
  return make(divRound(n, d), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  if (!isCurrency(to)) throw fail('MONEY_INVALID_CURRENCY');
  let acc = { minor: 0, currency: to };
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
