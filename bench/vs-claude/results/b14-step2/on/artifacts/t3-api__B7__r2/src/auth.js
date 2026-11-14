'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User; trả về user hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return user;
}

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
}

/**
 * Đọc tham số truy vấn theo thứ tự trên URL. `spec` = { tên: (giá trị) => giá trị đã parse | throw/undefined }.
 * Tham số lạ hoặc lặp → INVALID_QUERY; validator trả về { ok:false } nếu sai.
 */
function parseQuery(searchParams, spec) {
  const out = {};
  const seen = new Set();
  const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
  for (const [k, v] of searchParams.entries()) {
    if (!Object.prototype.hasOwnProperty.call(spec, k) || seen.has(k)) throw bad(k);
    seen.add(k);
    const r = spec[k](v);
    if (!r || !r.ok) throw bad(k);
    out[k] = r.value;
  }
  return out;
}

module.exports = { authenticate, forbidden, parseQuery };
