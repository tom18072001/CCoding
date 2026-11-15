'use strict';
const http = require('node:http');
const { Router } = require('./router');
const { Store } = require('./store');
const { HttpError, send, sendError } = require('./http');
const tasks = require('./handlers/tasks');
const audit = require('./handlers/audit');

/**
 * createServer({ seed?, now? }) → http.Server (chưa listen).
 * `seed`: dữ liệu ban đầu (mặc định data/seed.json) · `now`: hàm trả về Date (đồng hồ tiêm được để test).
 * server.store là kho dữ liệu của server (cho test).
 */
function createServer(options = {}) {
  const store = new Store(options);
  const router = new Router();
  tasks.register(router, store);
  audit.register(router, store);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      let user;
      if (p === '/audit' || p === '/tasks' || p.startsWith('/tasks/') || p.startsWith('/audit/')) {
        const id = req.headers['x-user'];
        user = id === undefined ? undefined : store.user(id);
        if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
      }
      const { handler, params, pathMatched } = router.match(req.method, url.pathname);
      if (!handler) throw pathMatched ? new HttpError(405, 'METHOD_NOT_ALLOWED', 'Phương thức không hỗ trợ') : new HttpError(404, 'NOT_FOUND', 'Không có đường dẫn');
      await handler({ req, res, params, query: url.searchParams, url, user });
    } catch (err) {
      sendError(res, err);
    }
  });
  server.store = store;
  return server;
}

module.exports = { createServer };
