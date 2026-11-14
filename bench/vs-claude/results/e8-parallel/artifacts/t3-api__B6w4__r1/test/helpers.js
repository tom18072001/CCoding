'use strict';
const { createServer } = require('../src/server');

/** Khởi động server trên cổng ngẫu nhiên; trả về { base, server, close, call }. */
async function start(options = {}) {
  const server = createServer(options);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // user: id người dùng gửi qua X-User (mặc định u1 = admin; truyền null để không gửi header)
  const call = async (method, path, { body, headers = {}, user = 'u1' } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(user ? { 'x-user': user } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8'); // giữ nguyên BOM (res.text() sẽ bỏ BOM)
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, bytes, json };
  };
  return { base, server, call, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };
