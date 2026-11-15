// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; làm tròn half-even đúng một lần ở cuối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', decimal: '.', symbolBefore: true },
  'vi-VN': { group: '.', decimal: ',', symbolBefore: false },
  'fr-FR': { group: ' ', decimal: ',', symbolBefore: false },
};

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

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function toSafeNumber(big) {
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw err('MONEY_INVALID_AMOUNT');
  }
  const n = Number(big);
  return n === 0 ? 0 : n;
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  let neg = false;
  if (n < 0n) { neg = !neg; n = -n; }
  if (d < 0n) { neg = !neg; d = -d; }
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function mk(minorBig, currency) {
  return { minor: toSafeNumber(minorBig), currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (/^[-+]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
    negative = true;
  } else {
    const m = /^([-+])\s*/.exec(s);
    if (m) {
      negative = m[1] === '-';
      s = s.slice(m[0].length);
    }
  }

  let before = null;
  let after = null;
  let mm = /^(₫|\$|€|[A-Za-z]+)\s*/.exec(s);
  if (mm) { before = mm[1]; s = s.slice(mm[0].length); }
  mm = /\s*(₫|\$|€|[A-Za-z]+)$/.exec(s);
  if (mm) { after = mm[1]; s = s.slice(0, s.length - mm[0].length); }
  if (before !== null && after !== null) throw err('MONEY_INVALID_AMOUNT');
  const token = before !== null ? before : after;
  if (token !== null && token.length !== 1 && token.length !== 3) throw err('MONEY_INVALID_AMOUNT');
  if (token !== null && token.length === 1 && !Object.hasOwn(SYMBOL_TO_CODE, token)) throw err('MONEY_INVALID_AMOUNT');

  const esc = (c) => c.replace(/[.]/g, '\\.');
  const re = new RegExp(
    `^(\\d+|\\d{1,3}(?:${esc(loc.group)}\\d{3})+)(?:${esc(loc.decimal)}(\\d+))?$`,
  );
  const nm = re.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    tokenCur = token.length === 1 ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur !== null) {
    if (options.currency !== undefined && options.currency !== tokenCur) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const intDigits = nm[1].split(loc.group).join('');
  const frac = nm[2] || '';
  const scale = DECIMALS[currency];
  let value;
  if (frac.length <= scale) {
    value = BigInt(intDigits + frac.padEnd(scale, '0'));
  } else {
    const all = BigInt(intDigits + frac);
    value = divRound(all, 10n ** BigInt(frac.length - scale));
  }
  return mk(negative ? -value : value, currency);
}

function groupDigits(str, sep) {
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const scale = DECIMALS[m.currency];
  const abs = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const pow = 10n ** BigInt(scale);
  let num = groupDigits((abs / pow).toString(), loc.group);
  if (scale > 0) num += loc.decimal + (abs % pow).toString().padStart(scale, '0');

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolBefore) out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
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
  return mk(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return mk(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return toSafeNumber(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return mk(divRound(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) || ratios.length === 0 ||
    !ratios.every((r) => typeof r === 'number' && Number.isSafeInteger(r) && r >= 0)
  ) throw err('MONEY_INVALID_RATIO');
  const T = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((s, p) => s + p, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  return parts.map((p) => mk(m.minor < 0 ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw err('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  let numer = BigInt(m.minor) * num;
  let denom = 10n ** BigInt(f.length);
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  if (shift > 0) numer *= 10n ** BigInt(shift);
  else if (shift < 0) denom *= 10n ** BigInt(-shift);
  return mk(divRound(numer, denom), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = { minor: 0, currency: to };
  for (const item of list) total = add(total, convert(item, to, rates));
  return total;
}
