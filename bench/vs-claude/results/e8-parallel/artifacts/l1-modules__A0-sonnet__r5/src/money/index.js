// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { th: ',', dc: '.', before: true },
  'vi-VN': { th: '.', dc: ',', before: false },
  'fr-FR': { th: ' ', dc: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

function mk(minor, currency) {
  return { minor: minor === 0 ? 0 : minor, currency };
}

function fromBig(b, currency) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return mk(Number(b), currency);
}

// n / d làm tròn half-even, trên BigInt (d != 0)
function divHE(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function pow10(k) {
  return 10n ** BigInt(k);
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return mk(minor, currency);
}

const TOKEN_LEAD = /^(₫|\$|€|[A-Za-z]{3})\s*/;
const TOKEN_TRAIL = /\s*(₫|\$|€|[A-Za-z]{3})$/;
const TOKEN_MAP = { '₫': 'VND', $: 'USD', '€': 'EUR' };

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');
  const bad = () => err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw bad();
  } else if (/^[+-]/.test(s)) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = TOKEN_LEAD.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = TOKEN_TRAIL.exec(s);
  if (trail) {
    if (token !== null) throw bad();
    token = trail[1];
    s = s.slice(0, trail.index);
  }

  const th = esc(loc.th);
  const dc = esc(loc.dc);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?$`);
  const mt = re.exec(s);
  if (!mt) throw bad();
  const intPart = mt[1].split(loc.th).join('');
  const frac = mt[2] || '';

  let cur = null;
  if (token !== null) {
    cur = TOKEN_MAP[token] || token.toUpperCase();
    if (!isCurrency(cur)) throw err('MONEY_INVALID_CURRENCY');
  }
  if (cur === null) {
    if (options.currency === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = options.currency;
  } else if (options.currency !== undefined && options.currency !== cur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const dec = DECIMALS[cur];
  let value;
  if (frac.length <= dec) {
    value = BigInt(intPart + frac.padEnd(dec, '0'));
  } else {
    value = BigInt(intPart + frac.slice(0, dec));
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && value % 2n === 1n)) value += 1n;
  }
  if (value > MAX) throw bad();
  return fromBig(negative ? -value : value, cur);
}

export function formatMoney(m, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const abs = BigInt(Math.abs(m.minor));
  const p = pow10(dec);
  const ip = (abs / p).toString().replace(/\B(?=(\d{3})+$)/g, loc.th);
  let num = ip;
  if (dec > 0) num += loc.dc + (abs % p).toString().padStart(dec, '0');

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
  }
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
  const r = Number(divHE(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divHE(BigInt(m.minor) * num, pow10(f.length)), m.currency);
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
  const left = Number(A - parts.reduce((x, y) => x + y, 0n));
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; k < left; k++) parts[order[k]] += 1n;
  return parts.map((p) => mk(m.minor < 0 ? -Number(p) : Number(p), m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return mk(m.minor, m.currency);
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw err('MONEY_MISSING_RATE');
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw err('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate) || !/[1-9]/.test(rate)) {
    throw err('MONEY_INVALID_RATE');
  }
  const [i, f = ''] = rate.split('.');
  const ds = DECIMALS[m.currency];
  const dd = DECIMALS[to];
  const num = BigInt(m.minor) * BigInt(i + f) * pow10(Math.max(0, dd - ds));
  const den = pow10(f.length) * pow10(Math.max(0, ds - dd));
  return fromBig(divHE(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
