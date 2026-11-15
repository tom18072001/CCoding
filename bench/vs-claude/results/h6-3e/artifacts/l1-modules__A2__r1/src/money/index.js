// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const CURRENCIES = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', symbolBefore: true },
  'vi-VN': { group: '.', dec: ',', symbolBefore: false },
  'fr-FR': { group: ' ', dec: ',', symbolBefore: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(CURRENCIES, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

function pow10(n) {
  return 10n ** BigInt(n);
}

// n / d làm tròn half-even, n và d là BigInt, d != 0
function divBig(n, d) {
  let neg = false;
  if (n < 0n) { n = -n; neg = !neg; }
  if (d < 0n) { d = -d; neg = !neg; }
  let q = n / d;
  const r = n % d;
  const twice = 2n * r;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function fromBig(v, currency) {
  if (v > MAX || v < -MAX) throw err('MONEY_INVALID_AMOUNT');
  const minor = Number(v);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const g = escRe(loc.group);
  const d = escRe(loc.dec);
  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const num = `((?:[0-9]+|[0-9]{1,3}(?:${g}[0-9]{3})+)(?:${d}[0-9]+)?)`;
  const re = new RegExp(`^(?:${tok}\\s*)?${num}(?:\\s*${tok})?$`);
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, t1, numStr, t2] = mt;
  if (t1 !== undefined && t2 !== undefined) throw err('MONEY_INVALID_AMOUNT');
  const token = t1 !== undefined ? t1 : t2;

  let cur;
  if (token !== undefined) {
    if (token === '₫') cur = 'VND';
    else if (token === '$') cur = 'USD';
    else if (token === '€') cur = 'EUR';
    else {
      cur = token.toUpperCase();
      if (!isCurrency(cur)) throw err('MONEY_INVALID_CURRENCY');
    }
    if (options.currency !== undefined && options.currency !== cur) throw err('MONEY_CURRENCY_MISMATCH');
  } else if (options.currency !== undefined) {
    cur = options.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const di = numStr.indexOf(loc.dec);
  const intPart = (di < 0 ? numStr : numStr.slice(0, di)).split(loc.group).join('');
  const frac = di < 0 ? '' : numStr.slice(di + 1);
  const all = BigInt(intPart + frac);
  const digits = CURRENCIES[cur];
  let v;
  if (frac.length <= digits) v = all * pow10(digits - frac.length);
  else v = divBig(all, pow10(frac.length - digits));
  return fromBig(neg ? -v : v, cur);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const digits = CURRENCIES[m.currency];
  const abs = (m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const intStr = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  const grouped = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, loc.group);
  const numStr = digits > 0 ? grouped + loc.dec + frac : grouped;

  let out;
  if (display === 'none') out = numStr;
  else if (display === 'symbol') {
    const sym = SYMBOLS[m.currency];
    out = loc.symbolBefore ? sym + numStr : `${numStr} ${sym}`;
  } else {
    out = loc.symbolBefore ? `${m.currency} ${numStr}` : `${numStr} ${m.currency}`;
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  const q = Number(divBig(BigInt(n), BigInt(d)));
  return q === 0 ? 0 : q;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const dot = body.indexOf('.');
  const scale = dot < 0 ? 0 : body.length - dot - 1;
  let f = BigInt(body.replace('.', ''));
  if (neg) f = -f;
  return fromBig(divBig(BigInt(m.minor) * f, pow10(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return parts.map((p) => fromBig(m.minor < 0 ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw err('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to) || row[to] === undefined) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const dot = rate.indexOf('.');
  const scale = dot < 0 ? 0 : rate.length - dot - 1;
  const r = BigInt(rate.replace('.', ''));
  if (r === 0n) throw err('MONEY_INVALID_RATE');
  const diff = CURRENCIES[to] - CURRENCIES[m.currency];
  const num = BigInt(m.minor) * r * pow10(Math.max(0, diff));
  const den = pow10(scale) * pow10(Math.max(0, -diff));
  return fromBig(divBig(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = money(0, to);
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
