// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để không mất chính xác.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOL = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function toMoney(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, d != 0 (BigInt).
function divRound(n, d) {
  const an = abs(n);
  const ad = abs(d);
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return (n < 0n) !== (d < 0n) ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options?.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return { name, ...LOCALES[name] };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const opts = options ?? {};
  const loc = getLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let body = text.trim();
  let negative = false;
  if (body[0] === '-' || body[0] === '+') {
    negative = body[0] === '-';
    body = body.slice(1).trim();
  } else if (body.startsWith('(') && body.endsWith(')') && body.length >= 2) {
    body = body.slice(1, -1).trim();
    if (body[0] === '-' || body[0] === '+') throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  }

  let pre = null;
  let suf = null;
  let m = /^([₫$€]|[A-Za-z]+)/.exec(body);
  if (m) {
    pre = m[1];
    body = body.slice(pre.length).trimStart();
  }
  m = /([₫$€]|[A-Za-z]+)$/.exec(body);
  if (m) {
    suf = m[1];
    body = body.slice(0, body.length - suf.length).trimEnd();
  }
  if (pre !== null && suf !== null) throw fail('MONEY_INVALID_AMOUNT');
  const token = pre ?? suf;
  if (token !== null && /^[A-Za-z]+$/.test(token) && token.length !== 3) throw fail('MONEY_INVALID_AMOUNT');

  const t = escapeRe(loc.thousands);
  const d = escapeRe(loc.decimal);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const nm = numRe.exec(body);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    tokenCurrency = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCurrency !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCurrency) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCurrency;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intPart = nm[1].split(loc.thousands).join('');
  const frac = nm[2] ?? '';
  const digits = DIGITS[currency];
  let value;
  if (frac.length <= digits) {
    value = BigInt(intPart + frac.padEnd(digits, '0'));
  } else {
    value = BigInt(intPart + frac.slice(0, digits));
    const rest = frac.slice(digits);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && (tail || value % 2n === 1n))) value += 1n;
  }
  return toMoney(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options ?? {};
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const digits = DIGITS[m.currency];
  const s = abs(BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const intStr = s.slice(0, s.length - digits);
  const fracStr = s.slice(s.length - digits);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.thousands);
  const num = digits > 0 ? grouped + loc.decimal + fracStr : grouped;

  const label = display === 'symbol' ? SYMBOL[m.currency] : m.currency;
  let out;
  if (display === 'none') out = num;
  else if (loc.symbolAfter) out = `${num} ${label}`;
  else out = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;

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
  return toMoney(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return toMoney(BigInt(a.minor) - BigInt(b.minor), a.currency);
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
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return toMoney(divRound(num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  if (!ratios.every((r) => Number.isSafeInteger(r) && r >= 0)) throw fail('MONEY_INVALID_RATIO');
  const total = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((s, p) => s + p, 0n);
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
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate) || !/[1-9]/.test(rate)) {
    throw fail('MONEY_INVALID_RATE');
  }
  const [i, f = ''] = rate.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  let den = 10n ** BigInt(f.length);
  const e = DIGITS[to] - DIGITS[m.currency];
  if (e > 0) num *= 10n ** BigInt(e);
  else if (e < 0) den *= 10n ** BigInt(-e);
  return toMoney(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let sum = 0n;
  for (const item of list) {
    sum += BigInt(convert(item, to, rates).minor);
    if (sum > MAX_SAFE || sum < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  }
  return toMoney(sum, to);
}
