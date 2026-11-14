'use strict';
const { createServer } = require('../src/server');

/** Khởi động server trên cổng ngẫu nhiên; trả về { base, server, close, call }. */
async function start(options = {}) {
  const server = createServer(options);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, headers = {}, user } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(user ? { 'x-user': user } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = Buffer.from(await res.arrayBuffer()).toString('utf8'); // giữ nguyên BOM
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  };
  return { base, server, call, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };
