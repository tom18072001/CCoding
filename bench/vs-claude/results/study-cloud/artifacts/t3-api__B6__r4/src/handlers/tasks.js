'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseListQuery, applyQuery, paginate, toCsv } = require('../query');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];

function validate(body, store, { partial }) {
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw new HttpError(400, 'VALIDATION', `Trường không hợp lệ: ${k}`, { field: k });
  const need = partial ? [] : ['title', 'team'];
  for (const k of need) if (body[k] === undefined) throw new HttpError(400, 'VALIDATION', `Thiếu ${k}`, { field: k });
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200))
    throw new HttpError(400, 'VALIDATION', 'title phải là chuỗi 1–200 ký tự', { field: 'title' });
  if (body.status !== undefined && !STATUSES.includes(body.status)) throw new HttpError(400, 'VALIDATION', 'status không hợp lệ', { field: 'status' });
  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) throw new HttpError(400, 'VALIDATION', 'priority phải là 1, 2 hoặc 3', { field: 'priority' });
  if (body.assignee !== undefined && body.assignee !== null && !store.user(body.assignee))
    throw new HttpError(400, 'VALIDATION', 'assignee không tồn tại', { field: 'assignee' });
  if (body.team !== undefined && !['A', 'B'].includes(body.team)) throw new HttpError(400, 'VALIDATION', 'team không hợp lệ', { field: 'team' });
  if (body.dueDate !== undefined && body.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))
    throw new HttpError(400, 'VALIDATION', 'dueDate phải dạng YYYY-MM-DD', { field: 'dueDate' });
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

/** Xác thực: X-User phải thuộc seed.users. */
function authenticate(req, store) {
  const u = store.user(req.headers['x-user']);
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return u;
}

const sorted = (arr) => [...arr].sort();

function register(router, store) {
  // Bọc handler: xác thực trước mọi thứ khác.
  const route = (method, pattern, fn) =>
    router.route(method, pattern, (ctx) => fn({ ...ctx, user: authenticate(ctx.req, store) }));

  const visible = (user, t) => user.role !== 'member' || t.team === user.team;
  const getVisible = (user, id) => {
    const t = store.getTask(id);
    if (!t || !visible(user, t)) throw notFound();
    return t;
  };
  const listFor = (user, query, allowPaging) => {
    const parsed = parseListQuery(query, { allowPaging });
    const r = applyQuery(store.listTasks(), parsed, { forceTeam: user.role === 'member' ? user.team : undefined });
    return { parsed, ...r };
  };

  route('GET', '/tasks', ({ res, user, query }) => {
    const { parsed, items, total } = listFor(user, query, true);
    send(res, 200, { items: paginate(items, parsed.page, parsed.pageSize), total, page: parsed.page, pageSize: parsed.pageSize });
  });

  // Phải đăng ký trước /tasks/:id.
  route('GET', '/tasks/export.csv', ({ res, user, query }) => {
    const { items } = listFor(user, query, false);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  route('GET', '/audit', ({ res, user, query }) => {
    const keys = [...query.keys()];
    for (let i = 0; i < keys.length; i++)
      if (keys[i] !== 'taskId' || keys.indexOf(keys[i]) !== i)
        throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${keys[i]}`, { field: keys[i] });
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    let items = store.audit.slice().reverse();
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });

  route('GET', '/tasks/:id', ({ res, params, user }) => {
    send(res, 200, getVisible(user, params.id));
  });

  route('POST', '/tasks', async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    // Quyền (403) chạy trước validate; manager chỉ bị 403 khi body CÓ team khác nhóm mình.
    // Nếu thiếu team thì để validate báo 400 (không có gì để so quyền).
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, sorted(Object.keys(body)));
    send(res, 201, t);
  });

  route('PATCH', '/tasks/:id', async ({ req, res, params, user }) => {
    const t = getVisible(user, params.id);
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const upd = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, sorted(changes));
    send(res, 200, upd);
  });

  route('DELETE', '/tasks/:id', ({ res, params, user }) => {
    getVisible(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
