'use strict';
const { createServer } = require('../src/server');

/**
 * Khởi động server trên cổng ngẫu nhiên; trả về { base, server, close, call }.
 * call(method, path, { body, headers, user }) — `user` là giá trị X-User (mặc định 'u1' = admin; null = không gửi header).
 */
async function start(options = {}) {
  const server = createServer(options);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, headers = {}, user = 'u1', raw } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(user !== null ? { 'x-user': user } : {}),
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('utf8');
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, buf, json };
  };
  return { base, server, call, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };
