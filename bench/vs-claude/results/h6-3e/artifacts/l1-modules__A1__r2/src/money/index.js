// money — xem SPEC.md, mục "Module money". Tính trên số nguyên nhỏ nhất (BigInt khi cần).

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

// Kiểm một giá trị tiền: đối tượng → currency → minor.
function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// Chuyển BigInt về minor an toàn (không -0).
function fromBig(b) {
  if (b > MAX_SAFE || b < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return Number(b);
}

function make(bigMinor, currency) {
  return { minor: fromBig(bigMinor), currency };
}

// num / den (den > 0n hoặc < 0n), làm tròn half-even, chính xác.
function roundDivBig(num, den) {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const abs = neg ? -num : num;
  let q = abs / den;
  const r2 = (abs % den) * 2n;
  if (r2 > den || (r2 === den && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function pow10(n) {
  return 10n ** BigInt(n);
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function numberPattern(loc) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const t = esc(loc.thousands);
  const d = esc(loc.decimal);
  return new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
}

const LEADING_TOKEN = /^(₫|\$|€|[A-Za-z]{3})\s*([\s\S]*)$/;
const TRAILING_TOKEN = /^([\s\S]*?)\s*(₫|\$|€|[A-Za-z]{3})$/;

export function parseMoney(text, options) {
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  } else if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  }

  let token = null;
  let numText = s;
  let m = LEADING_TOKEN.exec(s);
  if (m) {
    token = m[1];
    numText = m[2];
  } else {
    m = TRAILING_TOKEN.exec(s);
    if (m) {
      token = m[2];
      numText = m[1];
    }
  }

  const nm = numberPattern(loc).exec(numText);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    if (Object.prototype.hasOwnProperty.call(SYMBOL_TO_CODE, token)) tokenCurrency = SYMBOL_TO_CODE[token];
    else {
      tokenCurrency = token.toUpperCase();
      if (!isCurrency(tokenCurrency)) throw err('MONEY_INVALID_CURRENCY');
    }
  }
  let currency;
  if (tokenCurrency !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCurrency) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokenCurrency;
  } else if (opts.currency !== undefined) currency = opts.currency;
  else throw err('MONEY_INVALID_CURRENCY');

  const intPart = nm[1].split(loc.thousands).join('');
  const frac = nm[2] || '';
  const dec = DECIMALS[currency];
  const digits = BigInt(intPart + frac);
  let minor;
  if (frac.length <= dec) minor = digits * pow10(dec - frac.length);
  else minor = roundDivBig(digits, pow10(frac.length - dec));
  return make(negative ? -minor : minor, currency);
}

function groupDigits(str, sep) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return out;
}

export function formatMoney(m, options) {
  checkMoney(m);
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw err('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  let digits = String(Math.abs(m.minor));
  if (dec > 0) digits = digits.padStart(dec + 1, '0');
  const intStr = dec > 0 ? digits.slice(0, -dec) : digits;
  let num = groupDigits(intStr, loc.thousands);
  if (dec > 0) num += loc.decimal + digits.slice(-dec);

  let body;
  if (display === 'none') body = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) body = `${num} ${tok}`;
    else body = display === 'symbol' ? `${tok}${num}` : `${tok} ${num}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(roundDivBig(BigInt(n), BigInt(d)));
}

const FACTOR_RE = /^-?\d+(\.\d+)?$/;
const RATE_RE = /^\d+(\.\d+)?$/;

// Tách chuỗi thập phân thành { n: BigInt (có dấu), scale }.
function decimalParts(str) {
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const dot = body.indexOf('.');
  const frac = dot === -1 ? '' : body.slice(dot + 1);
  const intp = dot === -1 ? body : body.slice(0, dot);
  const n = BigInt(intp + frac);
  return { n: neg ? -n : n, scale: frac.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !FACTOR_RE.test(factor)) throw err('MONEY_INVALID_RATE');
  const { n, scale } = decimalParts(factor);
  return make(roundDivBig(BigInt(m.minor) * n, pow10(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
  }
  let total = 0n;
  for (const r of ratios) total += BigInt(r);
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const abs = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (abs * BigInt(r)) / total);
  let left = Number(abs - parts.reduce((x, y) => x + y, 0n));
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (let k = 0; k < left; k++) parts[order[k]] += 1n;
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: p === 0n ? 0 : Number(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !RATE_RE.test(rate)) throw err('MONEY_INVALID_RATE');
  const { n, scale } = decimalParts(rate);
  if (n === 0n) throw err('MONEY_INVALID_RATE');
  // minor_đích = minor × n / 10^scale × 10^(dd − ds)
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  let num = BigInt(m.minor) * n;
  let den = pow10(scale);
  if (shift >= 0) num *= pow10(shift);
  else den *= pow10(-shift);
  return make(roundDivBig(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let sum = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    sum = sum === null ? c : add(sum, c);
  }
  return sum;
}
