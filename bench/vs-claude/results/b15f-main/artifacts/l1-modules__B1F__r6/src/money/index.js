// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt; làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', after: false },
  'vi-VN': { group: '.', dec: ',', after: true },
  'fr-FR': { group: ' ', dec: ',', after: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function hasCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DECIMALS, c);
}

function checkCurrency(c) {
  if (!hasCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (typeof m !== 'object' || m === null) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// Số BigInt -> money, kiểm an toàn; 0 luôn là +0.
function fromBig(big, currency) {
  if (big > MAX || big < -MAX) throw err('MONEY_INVALID_AMOUNT');
  const minor = Number(big);
  return { minor: minor === 0 ? 0 : minor, currency };
}

// n / d làm tròn half-even, BigInt, d != 0.
function divRound(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  const twice = (a % b) * 2n;
  if (twice > b || (twice === b && (q & 1n) === 1n)) q += 1n;
  return neg ? -q : q;
}

function checkLocale(options) {
  const locale = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof locale !== 'string' || !Object.hasOwn(LOCALES, locale)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[locale];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

const TOKEN_START = /^([₫$€]|[A-Za-z]{3})/;
const TOKEN_END = /([₫$€]|[A-Za-z]{3})$/;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const opts = options || {};
  const loc = checkLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw err('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let lead = null;
  let trail = null;
  let m = TOKEN_START.exec(s);
  if (m) {
    lead = m[1];
    s = s.slice(lead.length).trim();
  }
  m = TOKEN_END.exec(s);
  if (m) {
    trail = m[1];
    s = s.slice(0, s.length - trail.length).trim();
  }
  if (lead !== null && trail !== null) throw err('MONEY_INVALID_AMOUNT');

  const g = escapeRe(loc.group);
  const d = escapeRe(loc.dec);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?$`);
  const nm = re.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');
  const intDigits = nm[1].split(loc.group).join('');
  const frac = nm[2] || '';

  const token = lead !== null ? lead : trail;
  let tokenCur = null;
  if (token !== null) {
    tokenCur = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!hasCurrency(tokenCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCur) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const dec = DECIMALS[currency];
  let abs;
  if (frac.length <= dec) {
    abs = BigInt(intDigits + frac.padEnd(dec, '0'));
  } else {
    abs = divRound(BigInt(intDigits + frac), 10n ** BigInt(frac.length - dec));
  }
  return fromBig(negative ? -abs : abs, currency);
}

function groupInt(str, sep) {
  return str.replace(/\B(?=(\d{3})+$)/g, sep);
}

export function formatMoney(m, options = {}) {
  const opts = options || {};
  checkMoney(m);
  const loc = checkLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw err('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const abs = String(Math.abs(m.minor)).padStart(dec + 1, '0');
  const intPart = groupInt(abs.slice(0, abs.length - dec), loc.group);
  const num = dec > 0 ? intPart + loc.dec + abs.slice(abs.length - dec) : intPart;

  let out;
  if (display === 'none') out = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.after) out = `${num} ${tok}`;
    else out = display === 'symbol' ? `${tok}${num}` : `${tok} ${num}`;
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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  const r = Number(divRound(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let F = BigInt(i + f);
  if (neg) F = -F;
  return fromBig(divRound(BigInt(m.minor) * F, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((r, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((i, j) => (R[i] === R[j] ? i - j : R[i] > R[j] ? -1 : 1));
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => fromBig(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (typeof rates !== 'object' || rates === null) throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw err('MONEY_MISSING_RATE');
  if (typeof row !== 'object' || row === null) throw err('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw err('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const R = BigInt(i + f);
  if (R === 0n) throw err('MONEY_INVALID_RATE');

  let num = BigInt(m.minor) * R;
  let den = 10n ** BigInt(f.length);
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  if (shift >= 0) num *= 10n ** BigInt(shift);
  else den *= 10n ** BigInt(-shift);
  return fromBig(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let total = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    total = total === null ? c : add(total, c);
  }
  return total;
}
