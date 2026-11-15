// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Toàn bộ phép tính dùng BigInt để chính xác; làm tròn half-even đúng một lần.

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
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, n và d là BigInt, d != 0.
function divRound(n, d) {
  let q = n / d;
  const r = n % d;
  if (r !== 0n) {
    const twice = abs(r) * 2n;
    const ad = abs(d);
    const negative = (n < 0n) !== (d < 0n);
    if (twice > ad || (twice === ad && q % 2n !== 0n)) q += negative ? -1n : 1n;
  }
  return q;
}

// BigInt → money, kiểm tra an toàn; 0 luôn là +0 (BigInt không có -0).
function fromBig(v, currency) {
  if (v > MAX || v < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(v), currency };
}

function pow10(k) {
  return 10n ** BigInt(k);
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function numberRegex(loc) {
  const esc = (s) => s.replace(/[.]/g, '\\.');
  const t = esc(loc.thousands);
  const d = esc(loc.decimal);
  return new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
}

export function parseMoney(text, options = {}) {
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let body = text.trim();
  let negative = false;
  if (body.length >= 2 && body.startsWith('(') && body.endsWith(')')) {
    negative = true;
    body = body.slice(1, -1).trim();
  } else if (body[0] === '-' || body[0] === '+') {
    negative = body[0] === '-';
    body = body.slice(1).trimStart();
  }

  const lead = body.match(/^(₫|\$|€|[A-Za-z]{3})\s*/);
  let token = null;
  if (lead) {
    token = lead[1];
    body = body.slice(lead[0].length);
  }
  const trail = body.match(/\s*(₫|\$|€|[A-Za-z]{3})$/);
  if (trail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = trail[1];
    body = body.slice(0, body.length - trail[0].length);
  }

  const m = numberRegex(loc).exec(body);
  if (!m) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    if (token === '₫') tokenCurrency = 'VND';
    else if (token === '$') tokenCurrency = 'USD';
    else if (token === '€') tokenCurrency = 'EUR';
    else {
      tokenCurrency = token.toUpperCase();
      if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
    }
  }
  let currency;
  if (tokenCurrency === null) {
    if (opts.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    currency = opts.currency;
  } else {
    if (opts.currency !== undefined && opts.currency !== tokenCurrency) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCurrency;
  }

  const intPart = m[1].split(loc.thousands).join('');
  const frac = m[2] || '';
  const dec = DECIMALS[currency];
  let value;
  if (frac.length > dec) {
    value = divRound(BigInt(intPart + frac), pow10(frac.length - dec));
  } else {
    value = BigInt(intPart + frac.padEnd(dec, '0'));
  }
  return fromBig(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const neg = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(neg)) throw fail('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const digits = abs(BigInt(m.minor)).toString().padStart(dec + 1, '0');
  const intDigits = digits.slice(0, digits.length - dec);
  const fracDigits = digits.slice(digits.length - dec);
  let grouped = '';
  for (let i = 0; i < intDigits.length; i++) {
    if (i > 0 && (intDigits.length - i) % 3 === 0) grouped += loc.thousands;
    grouped += intDigits[i];
  }
  const num = dec > 0 ? grouped + loc.decimal + fracDigits : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    out = loc.symbolAfter
      ? `${num} ${label}`
      : display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
  }
  if (m.minor < 0) out = neg === 'parens' ? `(${out})` : `-${out}`;
  return out;
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
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const negative = factor[0] === '-';
  const [i, f = ''] = (negative ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (negative) num = -num;
  return fromBig(divRound(BigInt(m.minor) * num, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const rs = ratios.map((r) => BigInt(r));
  const total = rs.reduce((s, r) => s + r, 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = rs.map((r) => (A * r) / total);
  let left = A - parts.reduce((s, p) => s + p, 0n);
  const order = rs
    .map((r, idx) => ({ r, idx }))
    .filter((e) => e.r > 0n)
    .sort((x, y) => (x.r === y.r ? x.idx - y.idx : x.r > y.r ? -1 : 1));
  for (const e of order) {
    if (left <= 0n) break;
    parts[e.idx] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: p === 0n ? 0 : Number(neg ? -p : p), currency: m.currency }));
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) {
    throw fail('MONEY_INVALID_RATE');
  }
  if (!has(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');

  const shift = DECIMALS[to] - DECIMALS[m.currency];
  const top = BigInt(m.minor) * num * (shift > 0 ? pow10(shift) : 1n);
  const bottom = pow10(f.length) * (shift < 0 ? pow10(-shift) : 1n);
  return fromBig(divRound(top, bottom), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = { minor: 0, currency: to };
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
