'use strict';

/** Router tối giản: route('GET', '/tasks/:id', handler) — handler(ctx) với ctx = { req, res, params, query, url }. */
class Router {
  constructor() {
    this.routes = [];
  }

  route(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    this.routes.push({ method, re, keys, handler });
    return this;
  }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      try {
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      } catch {
        return { handler: null, pathMatched: false };
      }
      return { handler: r.handler, params };
    }
    return { handler: null, pathMatched };
  }
}

module.exports = { Router };
