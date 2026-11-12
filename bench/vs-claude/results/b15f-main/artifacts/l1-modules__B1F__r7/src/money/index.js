// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt; làm tròn half-even đúng một lần ở cuối.

const CURRENCIES = { VND: { digits: 0, symbol: '₫' }, USD: { digits: 2, symbol: '$' }, EUR: { digits: 2, symbol: '€' } };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolFirst: true },
  'vi-VN': { thousands: '.', decimal: ',', symbolFirst: false },
  'fr-FR': { thousands: ' ', decimal: ',', symbolFirst: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const isCurrency = (c) => typeof c === 'string' && Object.hasOwn(CURRENCIES, c);
const isObj = (x) => typeof x === 'object' && x !== null;

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

// Kiểm giá trị tiền: đối tượng → currency → minor.
function checkMoney(m) {
  if (!isObj(m) || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  let q = n / d;
  const r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice > d || (twice === d && (q % 2n !== 0n))) q += n < 0n ? -1n : 1n;
  return q;
}

// BigInt → money an toàn (không -0).
function fromBig(big, currency) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

function pow10(k) {
  return 10n ** BigInt(k);
}

function getLocale(options) {
  const name = isObj(options) && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
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
  if (options === null) options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let token = null;
  const pre = /^(₫|\$|€|[A-Za-z]{3})\s*([\s\S]*)$/.exec(s);
  if (pre) {
    token = pre[1];
    s = pre[2];
  } else {
    const suf = /^([\s\S]*?)\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
    if (suf) {
      token = suf[2];
      s = suf[1];
    }
  }

  const t = escapeRe(loc.thousands);
  const d = escapeRe(loc.decimal);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    if (token === '₫') tokenCurrency = 'VND';
    else if (token === '$') tokenCurrency = 'USD';
    else if (token === '€') tokenCurrency = 'EUR';
    else {
      const up = token.toUpperCase();
      if (!isCurrency(up)) throw fail('MONEY_INVALID_CURRENCY');
      tokenCurrency = up;
    }
  }
  const optCurrency = options.currency;
  if (tokenCurrency === null && optCurrency === undefined) throw fail('MONEY_INVALID_CURRENCY');
  if (tokenCurrency !== null && optCurrency !== undefined && tokenCurrency !== optCurrency) {
    throw fail('MONEY_CURRENCY_MISMATCH');
  }
  const currency = tokenCurrency ?? optCurrency;
  const digits = CURRENCIES[currency].digits;

  const intPart = nm[1].split(loc.thousands).join('');
  let frac = nm[2] ?? '';
  let abs;
  if (frac.length > digits) {
    abs = divRound(BigInt(intPart + frac), pow10(frac.length - digits));
  } else {
    frac = frac.padEnd(digits, '0');
    abs = BigInt(intPart + frac);
  }
  return fromBig(negative ? -abs : abs, currency);
}

function groupDigits(str, sep) {
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(m, options = {}) {
  if (options === null) options = {};
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const { digits, symbol } = CURRENCIES[m.currency];
  const abs = (m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const intStr = abs.slice(0, abs.length - digits);
  const fracStr = digits ? abs.slice(abs.length - digits) : '';
  const num = groupDigits(intStr, loc.thousands) + (digits ? loc.decimal + fracStr : '');

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? symbol : m.currency;
    if (loc.symbolFirst) body = display === 'symbol' ? label + num : `${label} ${num}`;
    else body = `${num} ${label}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divRound(BigInt(m.minor) * num, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const total = ratios.reduce((acc, r) => acc + BigInt(r), 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const neg = m.minor < 0;
  const A = BigInt(neg ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((acc, p) => acc + p, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k]] += 1n;
  return parts.map((p) => ({ minor: p === 0n ? 0 : Number(neg ? -p : p), currency: m.currency }));
}

function rateOf(rates, from, to) {
  if (!isObj(rates) || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, from)) throw fail('MONEY_MISSING_RATE');
  const row = rates[from];
  if (!isObj(row) || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate) || /^0+(\.0+)?$/.test(rate)) {
    throw fail('MONEY_INVALID_RATE');
  }
  return rate;
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: to };
  const rate = rateOf(rates, m.currency, to);
  const [i, f = ''] = rate.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  let den = pow10(f.length);
  const shift = CURRENCIES[to].digits - CURRENCIES[m.currency].digits;
  if (shift >= 0) num *= pow10(shift);
  else den *= pow10(-shift);
  return fromBig(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = { minor: 0, currency: to };
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
