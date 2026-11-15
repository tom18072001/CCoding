'use strict';
const http = require('node:http');
const { Router } = require('./router');
const { Store } = require('./store');
const { HttpError, send, sendError } = require('./http');
const tasks = require('./handlers/tasks');

/**
 * createServer({ seed?, now? }) → http.Server (chưa listen).
 * `seed`: dữ liệu ban đầu (mặc định data/seed.json) · `now`: hàm trả về Date (đồng hồ tiêm được để test).
 * server.store là kho dữ liệu của server (cho test).
 */
function createServer(options = {}) {
  const store = new Store(options);
  const router = new Router();
  tasks.register(router, store);
  require('./handlers/audit').register(router, store);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { handler, params, pathMatched } = router.match(req.method, url.pathname);
      if (!handler) throw pathMatched ? new HttpError(405, 'METHOD_NOT_ALLOWED', 'Phương thức không hỗ trợ') : new HttpError(404, 'NOT_FOUND', 'Không có đường dẫn');
      let user = null;
      if (url.pathname === '/audit' || url.pathname === '/tasks' || url.pathname.startsWith('/tasks/')) {
        const id = req.headers['x-user'];
        user = id ? store.user(id) : undefined;
        if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
      }
      await handler({ req, res, params, query: url.searchParams, url, user });
    } catch (err) {
      sendError(res, err);
    }
  });
  server.store = store;
  return server;
}

module.exports = { createServer };
