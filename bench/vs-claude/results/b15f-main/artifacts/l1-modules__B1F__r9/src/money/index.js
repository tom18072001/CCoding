// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để tránh sai số số thực.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousand: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousand: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    throw err('MONEY_INVALID_AMOUNT', 'giá trị tiền phải là đối tượng');
  }
  if (!isCurrency(m.currency)) throw err('MONEY_INVALID_CURRENCY', 'loại tiền không hợp lệ');
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT', 'minor không hợp lệ');
}

function fromBig(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT', 'vượt số nguyên an toàn');
  return { minor: Number(big), currency };
}

function absBig(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, n và d là BigInt, d != 0.
function bigDivHalfEven(n, d) {
  let q = n / d;
  const r = n % d;
  if (r !== 0n) {
    const twice = absBig(r) * 2n;
    const ad = absBig(d);
    const sign = n < 0n !== d < 0n ? -1n : 1n;
    if (twice > ad || (twice === ad && q % 2n !== 0n)) q += sign;
  }
  return q;
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw err('MONEY_INVALID_CURRENCY', 'loại tiền không hợp lệ');
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT', 'minor không hợp lệ');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE', 'locale không hợp lệ');
  }
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TOKEN_RE = '(?:₫|\\$|€|[A-Za-z]{3})';

export function parseMoney(text, options = {}) {
  const opts = options || {};
  const loc = getLocale(opts);
  if (opts.currency !== undefined && !isCurrency(opts.currency)) {
    throw err('MONEY_INVALID_CURRENCY', 'options.currency không hợp lệ');
  }
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT', 'đầu vào phải là chuỗi');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    negative = true;
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT', 'dấu trong ngoặc');
  } else {
    const sm = /^([+-])\s*/.exec(s);
    if (sm) {
      negative = sm[1] === '-';
      s = s.slice(sm[0].length);
    }
  }

  let prefix = null;
  let suffix = null;
  const pm = new RegExp(`^(${TOKEN_RE})\\s*`).exec(s);
  if (pm) {
    prefix = pm[1];
    s = s.slice(pm[0].length);
  }
  const sufm = new RegExp(`\\s*(${TOKEN_RE})$`).exec(s);
  if (sufm) {
    suffix = sufm[1];
    s = s.slice(0, s.length - sufm[0].length);
  }
  if (prefix !== null && suffix !== null) throw err('MONEY_INVALID_AMOUNT', 'token ở cả hai phía');
  const token = prefix !== null ? prefix : suffix;

  const th = escapeRe(loc.thousand);
  const dc = escapeRe(loc.decimal);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT', 'cú pháp số tiền sai');
  const intPart = nm[1].split(loc.thousand).join('');
  const frac = nm[2] || '';

  let tokenCur = null;
  if (token !== null) {
    if (Object.hasOwn(SYMBOL_TO_CODE, token)) tokenCur = SYMBOL_TO_CODE[token];
    else {
      const up = token.toUpperCase();
      if (!isCurrency(up)) throw err('MONEY_INVALID_CURRENCY', 'loại tiền không hỗ trợ');
      tokenCur = up;
    }
  }
  let currency;
  if (tokenCur !== null && opts.currency !== undefined) {
    if (tokenCur !== opts.currency) throw err('MONEY_CURRENCY_MISMATCH', 'loại tiền không khớp');
    currency = tokenCur;
  } else if (tokenCur !== null) currency = tokenCur;
  else if (opts.currency !== undefined) currency = opts.currency;
  else throw err('MONEY_INVALID_CURRENCY', 'không xác định được loại tiền');

  const d = DIGITS[currency];
  let kept = BigInt(intPart + frac.slice(0, d).padEnd(d, '0'));
  if (frac.length > d) {
    const rest = frac.slice(d);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && kept % 2n === 1n)) kept += 1n;
  }
  return fromBig(negative ? -kept : kept, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options || {};
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION', 'display không hợp lệ');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION', 'negative không hợp lệ');

  const d = DIGITS[m.currency];
  const abs = absBig(BigInt(m.minor)).toString().padStart(d + 1, '0');
  const intStr = abs.slice(0, abs.length - d);
  const fracStr = abs.slice(abs.length - d);
  const grouped = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, loc.thousand);
  const num = d > 0 ? grouped + loc.decimal + fracStr : grouped;

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

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH', 'khác loại tiền');
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) {
    throw err('MONEY_INVALID_AMOUNT', 'n và d phải là số nguyên an toàn');
  }
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO', 'chia cho 0');
  return Number(bigDivHalfEven(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw err('MONEY_INVALID_RATE', 'hệ số không hợp lệ');
  }
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return fromBig(bigDivHalfEven(num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0 || !ratios.every((r) => Number.isSafeInteger(r) && r >= 0)) {
    throw err('MONEY_INVALID_RATIO', 'ratios không hợp lệ');
  }
  const total = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (total <= 0n) throw err('MONEY_INVALID_RATIO', 'tổng ratios phải > 0');
  const A = absBig(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((s, p) => s + p, 0n);
  const order = ratios
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r > 0)
    .sort((x, y) => (y.r !== x.r ? y.r - x.r : x.idx - y.idx));
  for (const { idx } of order) {
    if (left <= 0n) break;
    parts[idx] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: Number(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY', 'loại tiền đích không hợp lệ');
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) {
    throw err('MONEY_INVALID_RATE', 'rates không hợp lệ');
  }
  if (!Object.hasOwn(rates, m.currency)) throw err('MONEY_MISSING_RATE', 'thiếu tỉ giá');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw err('MONEY_INVALID_RATE', 'rates không hợp lệ');
  }
  if (!Object.hasOwn(row, to)) throw err('MONEY_MISSING_RATE', 'thiếu tỉ giá');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate) || !/[1-9]/.test(rate)) {
    throw err('MONEY_INVALID_RATE', 'tỉ giá không hợp lệ');
  }
  const [i, f = ''] = rate.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  let den = 10n ** BigInt(f.length);
  const diff = DIGITS[to] - DIGITS[m.currency];
  if (diff > 0) num *= 10n ** BigInt(diff);
  else if (diff < 0) den *= 10n ** BigInt(-diff);
  return fromBig(bigDivHalfEven(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) {
    throw err('MONEY_INVALID_AMOUNT', 'list phải là mảng khác rỗng');
  }
  let total = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    total = total === null ? c : add(total, c);
  }
  return total;
}
