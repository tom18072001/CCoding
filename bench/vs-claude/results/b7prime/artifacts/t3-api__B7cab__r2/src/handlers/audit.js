'use strict';
const { send } = require('../http');
const { authenticate, forbidden, badQuery } = require('./tasks');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    let taskId;
    const seen = new Set();
    for (const [k, v] of query) {
      if (k !== 'taskId' || seen.has(k)) throw badQuery(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    const items = store.audit.filter((e) => taskId === undefined || e.taskId === taskId).sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { register };
