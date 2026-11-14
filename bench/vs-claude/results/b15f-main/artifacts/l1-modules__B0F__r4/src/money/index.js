// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép làm tròn half-even dùng BigInt, đúng một lần.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.', before: true },
  'vi-VN': { ts: '.', ds: ',', before: false },
  'fr-FR': { ts: ' ', ds: ',', before: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isCurrency = (c) => c === 'VND' || c === 'USD' || c === 'EUR';

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
}

// BigInt -> money (kiểm an toàn, không -0)
function fromBig(b, currency) {
  if (b > MAX_SAFE || b < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(b), currency };
}

// n / d làm tròn half-even, BigInt, d != 0
function divRound(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const twice = 2n * (an % ad);
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

const pow10 = (k) => 10n ** BigInt(k);

function getLocale(options) {
  const loc = options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  const opts = options ?? {};
  const loc = getLocale(opts);
  if (opts.currency !== undefined && !isCurrency(opts.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const tokenRe = '(₫|\\$|€|\\p{L}{3})';
  let token = null;
  const lead = new RegExp(`^${tokenRe}\\s*`, 'u').exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = new RegExp(`\\s*${tokenRe}$`, 'u').exec(s);
  if (trail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, s.length - trail[0].length);
  }

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const ts = esc(loc.ts);
  const ds = esc(loc.ds);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${ts}\\d{3})+)(?:${ds}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    tokenCur = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  const optCur = opts.currency;
  let currency;
  if (tokenCur !== null) {
    if (optCur !== undefined && optCur !== tokenCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (optCur !== undefined) {
    currency = optCur;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intPart = nm[1].split(loc.ts).join('');
  const frac = nm[2] ?? '';
  const cd = DIGITS[currency];
  let kept = BigInt(intPart + frac.slice(0, cd).padEnd(cd, '0'));
  if (frac.length > cd) {
    const rest = frac.slice(cd);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail)) kept += 1n;
    else if (first === 5 && kept % 2n === 1n) kept += 1n;
  }
  return fromBig(neg ? -kept : kept, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options ?? {};
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw fail('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw fail('MONEY_INVALID_OPTION');

  const cd = DIGITS[m.currency];
  const abs = String(Math.abs(m.minor)).padStart(cd + 1, '0');
  const intStr = abs.slice(0, abs.length - cd).replace(/\B(?=(\d{3})+$)/g, loc.ts);
  const num = cd > 0 ? intStr + loc.ds + abs.slice(abs.length - cd) : intStr;
  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) out = display === 'symbol' ? label + num : label + ' ' + num;
    else out = num + ' ' + label;
  }
  if (m.minor < 0) out = negative === 'sign' ? '-' + out : '(' + out + ')';
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
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divRound(BigInt(m.minor) * num, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; left > 0n; k++, left--) parts[order[k % order.length]] += 1n;
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  if (!isCurrency(to)) throw fail('MONEY_INVALID_CURRENCY');
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const r = BigInt(i + f);
  if (r === 0n) throw fail('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * r * pow10(DIGITS[to]);
  const den = pow10(f.length + DIGITS[m.currency]);
  return fromBig(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let sum = 0n;
  for (const item of list) sum += BigInt(convert(item, to, rates).minor);
  return fromBig(sum, to);
}
