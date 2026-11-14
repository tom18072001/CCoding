// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; không dùng số thực.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', before: true },
  'vi-VN': { thousands: '.', decimal: ',', before: false },
  'fr-FR': { thousands: ' ', decimal: ',', before: false },
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

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function pow10(n) {
  return 10n ** BigInt(n);
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  let neg = false;
  if (n < 0n) { n = -n; neg = !neg; }
  if (d < 0n) { d = -d; neg = !neg; }
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

// BigInt -> money; kiểm tra an toàn; không bao giờ -0 (Number(0n) là +0).
function fromBig(v, currency) {
  if (v > MAX || v < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(v), currency };
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function checkLocale(locale) {
  if (locale === undefined) return LOCALES['en-US'];
  if (typeof locale !== 'string' || !Object.hasOwn(LOCALES, locale)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[locale];
}

function numberRegex(loc) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const t = esc(loc.thousands);
  const d = esc(loc.decimal);
  return new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = checkLocale(options.locale);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let token = null;
  const lead = /^(₫|\$|€|[A-Za-z]{3})/.exec(s);
  const trail = /(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (lead && trail) throw err('MONEY_INVALID_AMOUNT'); // token ở cả hai phía
  if (lead) { token = lead[1]; s = s.slice(lead[1].length).trimStart(); }
  else if (trail) { token = trail[1]; s = s.slice(0, -trail[1].length).trimEnd(); }

  const m = numberRegex(loc).exec(s);
  if (!m) throw err('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    if (token === '₫') tokenCur = 'VND';
    else if (token === '$') tokenCur = 'USD';
    else if (token === '€') tokenCur = 'EUR';
    else {
      const up = token.toUpperCase();
      if (!isCurrency(up)) throw err('MONEY_INVALID_CURRENCY');
      tokenCur = up;
    }
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

  const intDigits = m[1].split(loc.thousands).join('');
  const frac = m[2] || '';
  const dec = DECIMALS[currency];
  let v;
  if (frac.length <= dec) {
    v = BigInt(intDigits + frac.padEnd(dec, '0'));
  } else {
    v = divRound(BigInt(intDigits + frac), pow10(frac.length - dec)); // trên giá trị tuyệt đối
  }
  if (neg) v = -v;
  return fromBig(v, currency);
}

function group(intStr, sep) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = checkLocale(options.locale);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const abs = BigInt(Math.abs(m.minor));
  const p = pow10(dec);
  let num = group((abs / p).toString(), loc.thousands);
  if (dec > 0) num += loc.decimal + (abs % p).toString().padStart(dec, '0');

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) out = display === 'symbol' ? label + num : label + ' ' + num;
    else out = num + ' ' + label;
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
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divRound(num, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => fromBig(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const r = BigInt(i + f);
  if (r === 0n) throw err('MONEY_INVALID_RATE');

  // minor_đích = minor_nguồn × tỉ_giá × 10^(chữ_số_đích − chữ_số_nguồn); làm tròn một lần.
  let num = BigInt(m.minor) * r;
  let den = pow10(f.length);
  const e = DECIMALS[to] - DECIMALS[m.currency];
  if (e >= 0) num *= pow10(e);
  else den *= pow10(-e);
  return fromBig(divRound(num, den), to);
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
