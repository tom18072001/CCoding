'use strict';

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    if (message && typeof message === 'object') {
      extra = message;
      message = undefined;
    }
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function send(res, status, body, headers = {}) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.writeHead(status, headers);
    return res.end(body);
  }
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(text);
}

function sendError(res, err) {
  if (err instanceof HttpError) return send(res, err.status, { error: { code: err.code, message: err.message, ...err.extra } });
  console.error(err);
  return send(res, 500, { error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } });
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
    return v;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Body phải là đối tượng JSON');
  }
}

module.exports = { HttpError, send, sendError, readJson };
