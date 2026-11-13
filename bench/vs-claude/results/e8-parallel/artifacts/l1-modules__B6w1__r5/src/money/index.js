// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', symbolAfter: false },
  'vi-VN': { group: '.', dec: ',', symbolAfter: true },
  'fr-FR': { group: ' ', dec: ',', symbolAfter: true },
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

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d (BigInt, d != 0) làm tròn half-even
function roundDiv(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const an = abs(n);
  let q = an / d;
  const r2 = (an % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function toMoney(big, currency) {
  if (big > MAX || big < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function opts(options) {
  return options === undefined || options === null ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  options = opts(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('-') || s.startsWith('+')) {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  } else if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  }

  let token = null;
  const lead = /^(₫|\$|€|[A-Za-z]{3})\s*/.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = /\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (trail) {
    if (token !== null) throw err('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, trail.index);
  }

  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${esc(loc.group)}\\d{3})+)(?:${esc(loc.dec)}(\\d+))?$`);
  const match = re.exec(s);
  if (!match) throw err('MONEY_INVALID_AMOUNT');
  const intPart = match[1].split(loc.group).join('');
  const frac = match[2] || '';

  let tokenCur = null;
  if (token !== null) {
    if (SYMBOL_TO_CODE[token]) tokenCur = SYMBOL_TO_CODE[token];
    else {
      tokenCur = token.toUpperCase();
      if (!isCurrency(tokenCur)) throw err('MONEY_INVALID_CURRENCY');
    }
  }
  let currency;
  if (tokenCur !== null) {
    if (options.currency !== undefined && options.currency !== tokenCur) {
      throw err('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCur;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const d = DIGITS[currency];
  let big;
  if (frac.length > d) {
    big = roundDiv(BigInt(intPart + frac), 10n ** BigInt(frac.length - d));
  } else {
    big = BigInt(intPart + frac.padEnd(d, '0'));
  }
  return toMoney(neg ? -big : big, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = opts(options);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const d = DIGITS[m.currency];
  const a = abs(BigInt(m.minor)).toString().padStart(d + 1, '0');
  const intStr = a.slice(0, a.length - d).replace(/\B(?=(\d{3})+(?!\d))/g, loc.group);
  const num = d > 0 ? intStr + loc.dec + a.slice(a.length - d) : intStr;

  let out;
  if (display === 'none') out = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${num} ${tok}`;
    else out = display === 'symbol' ? `${tok}${num}` : `${tok} ${num}`;
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
  return toMoney(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  pair(a, b);
  return toMoney(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  pair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(roundDiv(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const negF = factor.startsWith('-');
  const [ip, fp = ''] = (negF ? factor.slice(1) : factor).split('.');
  let num = BigInt(m.minor) * BigInt(ip + fp);
  if (negF) num = -num;
  return toMoney(roundDiv(num, 10n ** BigInt(fp.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n || total > MAX) throw err('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const base = ratios.map((r) => (A * BigInt(r)) / total);
  let left = Number(A - base.reduce((s, x) => s + x, 0n));
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (let k = 0; k < left; k++) base[order[k]] += 1n;
  const neg = m.minor < 0;
  return base.map((x) => ({ minor: neg && x !== 0n ? -Number(x) : Number(x), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor + 0, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const digits = BigInt(ip + fp);
  if (digits === 0n) throw err('MONEY_INVALID_RATE');
  const ds = DIGITS[m.currency];
  const dt = DIGITS[to];
  const up = 10n ** BigInt(Math.max(0, dt - ds));
  const down = 10n ** BigInt(fp.length + Math.max(0, ds - dt));
  return toMoney(roundDiv(BigInt(m.minor) * digits * up, down), to);
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
