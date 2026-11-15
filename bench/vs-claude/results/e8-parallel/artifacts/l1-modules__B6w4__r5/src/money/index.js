// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác tuyệt đối.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.', before: true },
  'vi-VN': { ts: '.', ds: ',', before: false },
  'fr-FR': { ts: ' ', ds: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DIGITS, c);
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d (BigInt) làm tròn half-even.
function divRound(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d;
  const r = n % d;
  if (r !== 0n) {
    const twice = abs(r) * 2n;
    const away = twice > d || (twice === d && q % 2n !== 0n);
    if (away) q += n < 0n ? -1n : 1n;
  }
  return q;
}

// BigInt -> money, kiểm an toàn; 0 luôn là +0.
function make(big, currency) {
  if (abs(big) > MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function numberRegex(loc) {
  const esc = (s) => s.replace(/[.,]/g, '\\$&');
  const ts = loc.ts === ' ' ? ' ' : esc(loc.ts);
  return new RegExp(`^([0-9]+|[0-9]{1,3}(?:${ts}[0-9]{3})+)(?:${esc(loc.ds)}([0-9]+))?$`);
}

export function parseMoney(text, options = {}) {
  const opts = options || {};
  const loc = getLocale(opts);
  if (opts.currency !== undefined && !isCurrency(opts.currency)) throw err('MONEY_INVALID_CURRENCY');
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let token = null;
  let body = s;
  const lead = /^(₫|\$|€|[A-Za-z]{3})\s*([\s\S]*)$/.exec(s);
  if (lead) {
    token = lead[1];
    body = lead[2];
  } else {
    const trail = /^([\s\S]*?)\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
    if (trail) {
      token = trail[2];
      body = trail[1];
    }
  }

  const match = numberRegex(loc).exec(body);
  if (!match) throw err('MONEY_INVALID_AMOUNT');

  let tokenCode = null;
  if (token !== null) {
    tokenCode = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(tokenCode)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCode !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCode) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokenCode;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const intPart = match[1].replace(/[^0-9]/g, '');
  const frac = match[2] || '';
  const d = DIGITS[currency];
  let value;
  if (frac.length <= d) {
    value = BigInt(intPart + frac.padEnd(d, '0'));
  } else {
    value = divRound(BigInt(intPart + frac), pow10(frac.length - d));
  }
  return make(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options || {};
  const loc = getLocale(opts);
  const localeName = opts.locale !== undefined ? opts.locale : 'en-US';
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const d = DIGITS[m.currency];
  const a = abs(BigInt(m.minor));
  const intStr = (a / pow10(d)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, loc.ts);
  let num = intStr;
  if (d > 0) num += loc.ds + (a % pow10(d)).toString().padStart(d, '0');

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (localeName === 'en-US') out = display === 'symbol' ? label + num : `${label} ${num}`;
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
  return Number(divRound(BigInt(n), BigInt(d)));
}

// Phân tích chuỗi thập phân thành { int: BigInt (đã bỏ dấu thập phân), scale }.
function decimal(str) {
  const dot = str.indexOf('.');
  if (dot < 0) return { int: BigInt(str), scale: 0 };
  const frac = str.slice(dot + 1);
  return { int: BigInt(str.slice(0, dot) + frac), scale: frac.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const f = decimal(neg ? factor.slice(1) : factor);
  const num = BigInt(m.minor) * (neg ? -f.int : f.int);
  return make(divRound(num, pow10(f.scale)), m.currency);
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

  const A = abs(BigInt(m.minor));
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
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency) || !has(rates[m.currency], to)) throw err('MONEY_MISSING_RATE');
  const rate = rates[m.currency][to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const r = decimal(rate);
  if (r.int === 0n) throw err('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * r.int * pow10(DIGITS[to]);
  const den = pow10(r.scale + DIGITS[m.currency]);
  return make(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  let sum = 0n;
  for (const item of list) {
    sum += BigInt(convert(item, to, rates).minor);
    if (abs(sum) > MAX) throw err('MONEY_INVALID_AMOUNT');
  }
  return make(sum, to);
}
