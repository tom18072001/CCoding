const CURRENCIES = {
  VND: { digits: 0, symbol: '₫' },
  USD: { digits: 2, symbol: '$' },
  EUR: { digits: 2, symbol: '€' },
};
const LOCALES = {
  'en-US': { group: ',', dec: '.', before: true },
  'vi-VN': { group: '.', dec: ',', before: false },
  'fr-FR': { group: ' ', dec: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, msg) {
  const e = new Error(msg || code);
  e.code = code;
  return e;
}
const isCurrency = (c) => typeof c === 'string' && Object.hasOwn(CURRENCIES, c);
const isObj = (o) => typeof o === 'object' && o !== null;

function checkMoney(m) {
  if (!isObj(m)) throw err('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}
function fromBig(b, currency) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(b) || 0, currency };
}
const babs = (b) => (b < 0n ? -b : b);

// exact n/d, half-even, BigInt
function divHalfEven(n, d) {
  let neg = false;
  if (n < 0n) { neg = !neg; n = -n; }
  if (d < 0n) { neg = !neg; d = -d; }
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const loc = isObj(options) && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

const TOKEN = '([₫$€]|[A-Za-z]{3})';

export function parseMoney(text, options) {
  const loc = getLocale(options);
  const optCur = isObj(options) ? options.currency : undefined;
  if (optCur !== undefined && !isCurrency(optCur)) throw err('MONEY_INVALID_CURRENCY');
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');
  let s = text.trim();
  let neg = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
    neg = true;
  } else if (/^[+-]/.test(s)) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }
  const esc = (c) => (c === '.' ? '\\.' : c);
  const g = esc(loc.group);
  const d = esc(loc.dec);
  const num = `(\\d{1,3}(?:${g}\\d{3})+|\\d+)(?:${d}(\\d+))?`;
  const re = new RegExp(`^(?:${TOKEN}[ \\t]*)?${num}(?:[ \\t]*${TOKEN})?$`);
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, t1, intRaw, frac = '', t2] = mt;
  if (t1 !== undefined && t2 !== undefined) throw err('MONEY_INVALID_AMOUNT');
  const token = t1 !== undefined ? t1 : t2;
  let cur;
  if (token !== undefined) {
    const sym = Object.keys(CURRENCIES).find((k) => CURRENCIES[k].symbol === token);
    cur = sym || token.toUpperCase();
    if (!isCurrency(cur)) throw err('MONEY_INVALID_CURRENCY');
    if (optCur !== undefined && optCur !== cur) throw err('MONEY_CURRENCY_MISMATCH');
  } else {
    if (optCur === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = optCur;
  }
  const digits = CURRENCIES[cur].digits;
  const ip = intRaw.split(loc.group).join('');
  const keep = frac.slice(0, digits).padEnd(digits, '0');
  const rest = frac.slice(digits);
  let v = BigInt(ip + keep);
  if (rest.length) {
    const f = rest[0];
    const tail = /[1-9]/.test(rest.slice(1));
    if (f > '5' || (f === '5' && tail) || (f === '5' && !tail && v % 2n === 1n)) v += 1n;
  }
  return fromBig(neg ? -v : v, cur);
}

export function formatMoney(m, options) {
  checkMoney(m);
  const loc = getLocale(options);
  const o = isObj(options) ? options : {};
  const display = o.display === undefined ? 'symbol' : o.display;
  const negative = o.negative === undefined ? 'sign' : o.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');
  const { digits, symbol } = CURRENCIES[m.currency];
  const a = babs(BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const ip = a.slice(0, a.length - digits);
  const fp = a.slice(a.length - digits);
  const grouped = ip.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const numStr = digits ? grouped + loc.dec + fp : grouped;
  let out;
  if (display === 'none') out = numStr;
  else if (loc.before) out = display === 'symbol' ? symbol + numStr : `${m.currency} ${numStr}`;
  else out = `${numStr} ${display === 'symbol' ? symbol : m.currency}`;
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}
export function add(a, b) {
  pair(a, b);
  return fromBig(BigInt(a.minor) + BigInt(b.minor), a.currency);
}
export function subtract(a, b) {
  pair(a, b);
  return fromBig(BigInt(a.minor) - BigInt(b.minor), a.currency);
}
export function compare(a, b) {
  pair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divHalfEven(BigInt(n), BigInt(d))) || 0;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divHalfEven(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let T = 0n;
  for (let i = 0; i < ratios.length; i++) {
    const r = ratios[i];
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = babs(BigInt(m.minor));
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
  const sign = m.minor < 0 ? -1n : 1n;
  return parts.map((p) => ({ minor: Number(p * sign) || 0, currency: m.currency }));
}

export function convert(m, to, rates) {
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (!isObj(rates)) throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw err('MONEY_MISSING_RATE');
  if (!isObj(row)) throw err('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw err('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const ri = BigInt(i + f);
  if (ri === 0n) throw err('MONEY_INVALID_RATE');
  const diff = CURRENCIES[to].digits - CURRENCIES[m.currency].digits;
  let num = BigInt(m.minor) * ri;
  let den = 10n ** BigInt(f.length);
  if (diff >= 0) num *= 10n ** BigInt(diff);
  else den *= 10n ** BigInt(-diff);
  return fromBig(divHalfEven(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let acc = { minor: 0, currency: to };
  for (const x of list) acc = add(acc, convert(x, to, rates));
  return acc;
}
