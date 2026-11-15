'use strict';
const { send } = require('../http');
const { authenticate, visibleTasks } = require('../auth');
const { parseQuery, filterSort, paginate } = require('../query');
const { toCsv } = require('../csv');

/** ctx: kho dữ liệu (Store) hoặc { store }. Phải đăng ký TRƯỚC `/tasks/:id`. */
function register(router, ctx) {
  const store = ctx && ctx.store ? ctx.store : ctx;

  router.route('GET', '/tasks', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const p = parseQuery(url.searchParams);
    send(res, 200, paginate(filterSort(visibleTasks(user, store.listTasks()), p, user), p));
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const p = parseQuery(url.searchParams, { allowPaging: false });
    const body = toCsv(filterSort(visibleTasks(user, store.listTasks()), p, user));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tasks.csv"',
    });
    res.end(body);
  });
}

module.exports = { register };
