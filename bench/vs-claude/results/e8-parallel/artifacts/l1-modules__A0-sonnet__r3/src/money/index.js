// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.', after: false },
  'vi-VN': { ts: '.', ds: ',', after: true },
  'fr-FR': { ts: ' ', ds: ',', after: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isCurrency = (c) => typeof c === 'string' && Object.hasOwn(DECIMALS, c);
const pow10 = (n) => 10n ** BigInt(n);
const norm = (n) => (n === 0 ? 0 : n); // tránh -0

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}
function checkMinor(x) {
  if (!Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
}
function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}
function fromBig(b, currency) {
  if (b > MAX_SAFE || b < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return { minor: norm(Number(b)), currency };
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: norm(minor), currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');
  const bad = () => err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw bad();
    neg = true;
  } else if (/^[+-]/.test(s)) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = /^(₫|\$|€|[A-Za-z]{3})\s*/.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = /\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (trail) {
    if (token !== null) throw bad();
    token = trail[1];
    s = s.slice(0, trail.index);
  }

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${esc(loc.ts)}\\d{3})+)(?:${esc(loc.ds)}(\\d+))?$`);
  const mt = re.exec(s);
  if (!mt) throw bad();
  const intPart = mt[1].split(loc.ts).join('');
  const frac = mt[2] || '';

  let cur = null;
  if (token !== null) {
    if (Object.hasOwn(SYMBOL_TO_CODE, token)) cur = SYMBOL_TO_CODE[token];
    else {
      cur = token.toUpperCase();
      if (!isCurrency(cur)) throw err('MONEY_INVALID_CURRENCY');
    }
  }
  if (cur === null) {
    if (options.currency === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = options.currency;
  } else if (options.currency !== undefined && options.currency !== cur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const d = DECIMALS[cur];
  let v;
  if (frac.length > d) {
    const kept = BigInt(intPart + frac.slice(0, d));
    const rest = frac.slice(d);
    const unit = pow10(rest.length);
    v = divRound(BigInt(rest) + kept * unit, unit);
  } else {
    v = BigInt(intPart + frac.padEnd(d, '0'));
  }
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

  const d = DECIMALS[m.currency];
  const abs = BigInt(Math.abs(m.minor));
  const p = pow10(d);
  const grouped = (abs / p).toString().replace(/\B(?=(\d{3})+(?!\d))/g, loc.ts);
  let num = grouped;
  if (d > 0) num += loc.ds + (abs % p).toString().padStart(d, '0');

  let out;
  if (display === 'none') out = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (!loc.after) out = display === 'symbol' ? tok + num : `${tok} ${num}`;
    else out = `${num} ${tok}`;
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
  return norm(Number(divRound(BigInt(n), BigInt(d))));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let fb = BigInt(i + f);
  if (neg) fb = -fb;
  return fromBig(divRound(BigInt(m.minor) * fb, pow10(f.length)), m.currency);
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
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: norm(Number(neg ? -p : p)), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: norm(m.minor), currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const rb = BigInt(i + f);
  if (rb === 0n) throw err('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * rb * pow10(DECIMALS[to]);
  const den = pow10(f.length + DECIMALS[m.currency]);
  return fromBig(divRound(num, den), to);
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
