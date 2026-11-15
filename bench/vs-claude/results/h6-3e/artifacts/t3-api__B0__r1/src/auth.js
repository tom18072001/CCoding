'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User; trả về user hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id === undefined ? undefined : store.user(id);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
}

/** Duyệt tham số truy vấn theo thứ tự trên URL; allowed: { tên: (giá trị) => hợp lệ? }. Trả về Map đã parse thô. */
function parseQuery(searchParams, allowed) {
  const out = {};
  for (const [k, v] of searchParams) {
    const bad = () => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
    if (!Object.prototype.hasOwnProperty.call(allowed, k) || k in out) throw bad();
    if (!allowed[k](v)) throw bad();
    out[k] = v;
  }
  return out;
}

module.exports = { authenticate, forbidden, parseQuery };
