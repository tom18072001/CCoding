// money — tiền VND/USD/EUR trên số nguyên đơn vị nhỏ nhất (lời giải tham chiếu)

const CURRENCIES = {
  VND: { decimals: 0, symbol: '₫' },
  USD: { decimals: 2, symbol: '$' },
  EUR: { decimals: 2, symbol: '€' },
};
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };

const LOCALES = {
  'en-US': { group: ',', decimal: '.', prefix: true },
  'vi-VN': { group: '.', decimal: ',', prefix: false },
  'fr-FR': { group: ' ', decimal: ',', prefix: false },
};

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function checkCurrency(c) {
  if (typeof c !== 'string' || !has(CURRENCIES, c)) throw fail('MONEY_INVALID_CURRENCY', `Loại tiền không hỗ trợ: ${String(c)}`);
  return CURRENCIES[c];
}

function checkLocale(l) {
  const name = l === undefined ? 'en-US' : l;
  if (typeof name !== 'string' || !has(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE', `Locale không hỗ trợ: ${String(l)}`);
  return LOCALES[name];
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT', 'Giá trị tiền phải là đối tượng {minor, currency}');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT', 'minor phải là số nguyên an toàn');
  return m;
}

function make(minorBig, currency) {
  const abs = minorBig < 0n ? -minorBig : minorBig;
  if (abs > MAX) throw fail('MONEY_INVALID_AMOUNT', 'Kết quả vượt quá số nguyên an toàn');
  const n = Number(minorBig);
  return { minor: n === 0 ? 0 : n, currency };
}

function divHalfEven(n, d) {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const twice = (an % ad) * 2n;
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT', 'minor phải là số nguyên an toàn');
  return { minor: minor === 0 ? 0 : minor, currency };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  const opts = options ?? {};
  const loc = checkLocale(opts.locale);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT', 'Đầu vào phải là chuỗi');
  const bad = () => fail('MONEY_INVALID_AMOUNT', `Số tiền không hợp lệ: ${JSON.stringify(text)}`);

  let s = text.trim();
  let negative = false;
  const paren = /^\(([\s\S]*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1].trim();
    if (/^[+-]/.test(s)) throw bad();
  } else if (/^[+-]/.test(s)) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const tm = /^(?:([A-Za-z]{3}|[₫$€])\s*)?([\s\S]*?)(?:\s*([A-Za-z]{3}|[₫$€]))?$/.exec(s);
  const first = tm[1];
  const last = tm[3];
  const body = tm[2];
  if (first && last) throw bad();

  const g = esc(loc.group);
  const d = esc(loc.decimal);
  const nm = new RegExp(`^(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?$`).exec(body);
  if (!nm) throw bad();

  const token = first || last;
  let currency = opts.currency;
  if (token) {
    const code = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    checkCurrency(code);
    if (currency !== undefined && currency !== code) throw fail('MONEY_CURRENCY_MISMATCH', 'Loại tiền trong chuỗi khác tùy chọn currency');
    currency = code;
  }
  if (currency === undefined) throw fail('MONEY_INVALID_CURRENCY', 'Không xác định được loại tiền');

  const dec = CURRENCIES[currency].decimals;
  const intDigits = nm[1].split(loc.group).join('');
  const frac = nm[2] || '';
  const keep = frac.slice(0, dec).padEnd(dec, '0');
  const rest = frac.slice(dec);
  let minor = BigInt(intDigits + keep);
  if (rest) {
    const lead = rest[0];
    const tail = /[1-9]/.test(rest.slice(1));
    if (lead > '5' || (lead === '5' && tail) || (lead === '5' && !tail && minor % 2n === 1n)) minor += 1n;
  }
  return make(negative ? -minor : minor, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options ?? {};
  const loc = checkLocale(opts.locale);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION', 'display phải là symbol, code hoặc none');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION', 'negative phải là sign hoặc parens');

  const cur = CURRENCIES[m.currency];
  const abs = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const digits = abs.toString().padStart(cur.decimals + 1, '0');
  const int = digits.slice(0, digits.length - cur.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, loc.group);
  const num = cur.decimals ? int + loc.decimal + digits.slice(digits.length - cur.decimals) : int;

  let body;
  if (display === 'none') body = num;
  else {
    const mark = display === 'symbol' ? cur.symbol : m.currency;
    if (loc.prefix) body = display === 'symbol' ? mark + num : `${mark} ${num}`;
    else body = `${num} ${mark}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

export function add(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH', 'Không cộng/trừ khác loại tiền');
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH', 'Không cộng/trừ khác loại tiền');
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH', 'Không so sánh khác loại tiền');
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT', 'n và d phải là số nguyên an toàn');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO', 'Chia cho 0');
  const r = Number(divHalfEven(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

function parseDecimal(str, allowNegative) {
  const re = allowNegative ? /^(-?)(\d+)(?:\.(\d+))?$/ : /^()(\d+)(?:\.(\d+))?$/;
  const mm = typeof str === 'string' ? re.exec(str) : null;
  if (!mm) throw fail('MONEY_INVALID_RATE', `Hệ số/tỉ giá không hợp lệ: ${JSON.stringify(str)}`);
  const frac = mm[3] || '';
  const value = BigInt(mm[2] + frac);
  return { value: mm[1] === '-' ? -value : value, scale: BigInt(frac.length) };
}

export function multiply(m, factor) {
  checkMoney(m);
  const f = parseDecimal(factor, true);
  return make(divHalfEven(BigInt(m.minor) * f.value, 10n ** f.scale), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  const okRatios = Array.isArray(ratios) && ratios.length > 0 && ratios.every((r) => Number.isSafeInteger(r) && r >= 0);
  if (!okRatios) throw fail('MONEY_INVALID_RATIO', 'ratios phải là mảng khác rỗng các số nguyên không âm');
  const total = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (total === 0n) throw fail('MONEY_INVALID_RATIO', 'Tổng ratios phải lớn hơn 0');

  const abs = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const shares = ratios.map((r) => (abs * BigInt(r)) / total);
  let left = Number(abs - shares.reduce((s, x) => s + x, 0n));
  const order = ratios
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r > 0)
    .sort((x, y) => y.r - x.r || x.i - y.i);
  for (let k = 0; k < left; k++) shares[order[k].i] += 1n;
  return shares.map((s) => make(m.minor < 0 ? -s : s, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (m.currency === to) return { minor: m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE', 'Bảng tỉ giá không hợp lệ');
  const row = has(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null || typeof row !== 'object' || !has(row, to)) {
    throw fail('MONEY_MISSING_RATE', `Thiếu tỉ giá ${m.currency} → ${to}`);
  }
  const r = parseDecimal(row[to], false);
  if (r.value === 0n) throw fail('MONEY_INVALID_RATE', 'Tỉ giá phải lớn hơn 0');
  const num = BigInt(m.minor) * r.value * 10n ** BigInt(CURRENCIES[to].decimals);
  const den = 10n ** (r.scale + BigInt(CURRENCIES[m.currency].decimals));
  return make(divHalfEven(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT', 'Danh sách tiền phải là mảng khác rỗng');
  checkCurrency(to);
  let total = { minor: 0, currency: to };
  for (const item of list) total = add(total, convert(item, to, rates));
  return total;
}
