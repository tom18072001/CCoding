import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from './app.js';
import type { BusEvent } from './events.js';
import { nowIso } from './util/ids.js';
import { readJsonl } from './util/fsx.js';
import { MAX_UPLOAD_BYTES } from './uploads.js';
import type { BudgetMode, Classification, ProjectDef, TaskMode, ToolAccess } from './types.js';
import type { UsageDim } from './usage.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const CLASSES: Classification[] = ['public', 'internal', 'confidential', 'restricted'];
const MODES: TaskMode[] = ['auto', 'department', 'project', 'joint'];
const DIMS: UsageDim[] = ['agent', 'department', 'task', 'project', 'model', 'runtime', 'day', 'phase'];
const ACCESS: ToolAccess[] = ['none', 'read', 'write', 'exec'];
const BUDGET_MODES: BudgetMode[] = ['pause', 'complete'];

function budgetOpts(b: any) {
  const o: { addBudget?: number; budgetTokens?: number; budgetMode?: BudgetMode; runtime?: string } = {};
  if (b.addBudget !== undefined) o.addBudget = Math.max(0, Number(b.addBudget) || 0);
  if (b.budgetTokens !== undefined) o.budgetTokens = Math.max(0, Number(b.budgetTokens) || 0);
  if (b.budgetMode !== undefined) {
    if (!BUDGET_MODES.includes(b.budgetMode)) throw new HttpError(400, 'Chế độ ngân sách không hợp lệ (pause | complete)');
    o.budgetMode = b.budgetMode;
  }
  if (b.runtime !== undefined) o.runtime = String(b.runtime);
  if (b.from === 'review' || b.from === 'synthesize') (o as { from?: 'review' | 'synthesize' }).from = b.from;
  if (b.rerun === 'all') (o as { rerun?: string[] | 'all' }).rerun = 'all';
  else if (Array.isArray(b.rerun)) (o as { rerun?: string[] | 'all' }).rerun = b.rerun.map(String).slice(0, 50);
  return o as typeof o & { rerun?: string[] | 'all'; from?: 'review' | 'synthesize' };
}

async function readRaw(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, `Tệp quá lớn (tối đa ${Math.round(limit / 1024 / 1024)} MB)`);
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

async function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<any> {
  const ct = req.headers['content-type'] ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Chỉ nhận Content-Type: application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Nội dung quá lớn');
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ');
  }
}

/** Ảnh chụp trạng thái cho giao diện. */
export function snapshot(app: App) {
  const { registry, orchestrator, usage, store, config } = app;
  const states = new Map(orchestrator.states().map((s) => [s.id, s]));
  const byAgent = new Map(usage.summary('agent').map((r) => [r.key, r]));
  return {
    now: nowIso(),
    runner: orchestrator.runner,
    herdr: { session: config.herdr.session, inside: app.herdr.insideHerdr() },
    defaults: config.defaults,
    defaultRuntime: config.runtime.default,
    classifications: CLASSES,
    departments: [...registry.departments.values()].map(({ body, file, ...d }) => ({ ...d, charter: body })),
    agents: [...registry.agents.values()].map(({ body, file, ...a }) => ({ ...a, state: states.get(a.id), usage: byAgent.get(a.id) ?? null })),
    tasks: store.list().slice(0, 100),
    projects: store.projects(),
    alerts: orchestrator.alerts.slice(-30),
    tools: { defaultAccess: config.tools.defaultAccess, projectAccess: config.tools.projectAccess },
    usage: {
      total: usage.total(),
      byDepartment: usage.summary('department'),
      byAgent: usage.summary('agent'),
      byTask: usage.summary('task').slice(0, 50),
      byModel: usage.summary('model'),
      byDay: usage.summary('day').sort((a, b) => a.key.localeCompare(b.key)).slice(-30),
    },
    registryErrors: registry.errors,
  };
}

export function createServer(app: App): http.Server {
  const { config, orchestrator, registry, store, usage, logs, runtimes, bus } = app;
  const publicDir = path.join(config.root, 'public');
  const allowedHosts = new Set([`127.0.0.1:${config.server.port}`, `localhost:${config.server.port}`, `[::1]:${config.server.port}`]);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(config.server.host);

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    // Chống DNS rebinding & CSRF khi chỉ lắng nghe trên loopback
    if (loopback && req.headers.host && !allowedHosts.has(req.headers.host)) throw new HttpError(403, 'Host không hợp lệ');
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && !allowedHosts.has(origin.replace(/^https?:\/\//, ''))) throw new HttpError(403, 'Origin không hợp lệ');

    if (p.startsWith('/api/')) {
      if (config.server.token) {
        const auth = req.headers.authorization ?? '';
        const tok = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');
        if (tok !== config.server.token) throw new HttpError(401, 'Thiếu hoặc sai token');
      }
      return api(req, res, url);
    }

    // File tĩnh
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
    const file = path.resolve(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'Không tìm thấy');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  };

  const api = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
    const p = url.pathname;
    const q = (k: string) => url.searchParams.get(k) ?? undefined;
    const m = (re: RegExp) => re.exec(p);
    let mm: RegExpExecArray | null;

    if (p === '/api/health') return send(res, 200, { ok: true, runner: orchestrator.runner, pid: process.pid, uptime: process.uptime() });
    if (p === '/api/state') return send(res, 200, snapshot(app));

    if (p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ now: nowIso() })}\n\n`);
      const off = bus.subscribe((ev: BusEvent) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
      const ping = setInterval(() => res.write(`: ping\n\n`), 20000);
      req.on('close', () => {
        off();
        clearInterval(ping);
      });
      return;
    }

    if (p === '/api/tasks' && req.method === 'GET') return send(res, 200, store.list());
    if (p === '/api/tasks' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.mode && !MODES.includes(b.mode)) throw new HttpError(400, 'Chế độ không hợp lệ');
      try {
        const t = orchestrator.submit({
          brief: String(b.brief ?? ''),
          title: b.title ? String(b.title) : undefined,
          mode: b.mode,
          department: b.department || undefined,
          projectId: b.projectId || undefined,
          options: b.options ?? {},
          attachments: Array.isArray(b.attachments) ? b.attachments.map(String) : undefined,
        });
        return send(res, 201, t);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)$/)) && req.method === 'GET') {
      const t = store.get(mm[1]);
      if (!t) throw new HttpError(404, 'Không có nhiệm vụ');
      return send(res, 200, { task: t, transcript: store.transcript(t.id), outputs: store.outputs(t.id), usage: usage.summary('agent', { task: t.id }) });
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/file$/))) {
      const text = store.readRunFile(mm[1], q('path') ?? 'FINAL.md');
      if (text === undefined) throw new HttpError(404, 'Không có file');
      return send(res, 200, text);
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/cancel$/)) && req.method === 'POST') {
      return send(res, orchestrator.cancel(mm[1]) ? 200 : 409, { ok: true });
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/pause$/)) && req.method === 'POST') {
      return send(res, orchestrator.pause(mm[1]) ? 200 : 409, { ok: true });
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/resume$/)) && req.method === 'POST') {
      const b = await readBody(req);
      try {
        return send(res, 200, orchestrator.resume(mm[1], budgetOpts(b)));
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(409, (e as Error).message);
      }
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/budget$/)) && req.method === 'POST') {
      const b = await readBody(req);
      try {
        return send(res, 200, orchestrator.updateBudget(mm[1], budgetOpts(b)));
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(400, (e as Error).message);
      }
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/package$/)) && req.method === 'POST') {
      const b = await readBody(req);
      if (b.toolAccess && !ACCESS.includes(b.toolAccess)) throw new HttpError(400, 'Quyền công cụ không hợp lệ');
      if (b.workspace && !fs.existsSync(String(b.workspace))) throw new HttpError(400, `Thư mục không tồn tại: ${b.workspace}`);
      try {
        const r = orchestrator.packageTask(mm[1], {
          ...budgetOpts(b),
          projectId: b.projectId ? String(b.projectId) : undefined,
          name: b.name ? String(b.name) : undefined,
          description: b.description ? String(b.description) : undefined,
          workspace: b.workspace ? String(b.workspace) : undefined,
          toolAccess: b.toolAccess,
          isolation: b.isolation === 'none' || b.isolation === 'worktree' ? b.isolation : undefined,
          resume: !!b.resume,
        });
        return send(res, 200, r);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(409, (e as Error).message);
      }
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/calls$/))) {
      if (!store.get(mm[1])) throw new HttpError(404, 'Không có nhiệm vụ');
      const limit = Math.min(500, Number(q('limit') ?? 200));
      const full = q('call');
      const rows = readJsonl<Record<string, unknown>>(store.callsFile(mm[1]), full ? 0 : limit).map((r) =>
        full && r.callId === full ? r : { ...r, text: typeof r.text === 'string' ? (r.text as string).slice(0, 1500) : r.text, textChars: typeof r.text === 'string' ? (r.text as string).length : 0 },
      );
      return send(res, 200, full ? rows.filter((r) => r.callId === full) : rows);
    }
    if ((mm = m(/^\/api\/tasks\/([^/]+)\/events$/))) {
      return send(res, 200, logs.query({ task: mm[1], limit: Math.min(2000, Number(q('limit') ?? 500)) }));
    }

    if (p === '/api/uploads' && req.method === 'POST') {
      const name = decodeURIComponent(String(req.headers['x-filename'] ?? '')).trim();
      if (!name) throw new HttpError(400, 'Thiếu tên tệp (header X-Filename)');
      const buf = await readRaw(req, MAX_UPLOAD_BYTES);
      try {
        const meta = await app.uploads.save(name, buf, String(req.headers['content-type'] ?? '') || undefined);
        logs.write({ level: 'info', kind: 'upload', msg: `Tải lên ${meta.name} (${meta.kind}, ${meta.size} byte, ${meta.chars} ký tự)`, data: { id: meta.id, kind: meta.kind, size: meta.size, chars: meta.chars, sha256: meta.sha256 } });
        return send(res, 201, meta);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    if ((mm = m(/^\/api\/uploads\/([^/]+)$/)) && req.method === 'DELETE') {
      try {
        return send(res, app.uploads.remove(mm[1]) ? 200 : 404, { ok: true });
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    if (p === '/api/alerts') return send(res, 200, orchestrator.alerts.slice(-100));

    if (p === '/api/agents') return send(res, 200, snapshot(app).agents);
    if ((mm = m(/^\/api\/agents\/([^/]+)$/))) {
      const a = registry.agents.get(mm[1]);
      if (!a) throw new HttpError(404, 'Không có agent');
      return send(res, 200, {
        agent: a,
        state: orchestrator.agentStates.get(a.id),
        usage: usage.total({ agent: a.id }),
        byTask: usage.summary('task', { agent: a.id }).slice(0, 30),
        byPhase: usage.summary('phase', { agent: a.id }),
        logs: logs.query({ agent: a.id, limit: Number(q('limit') ?? 80) }),
      });
    }

    if (p === '/api/usage') {
      const by = (q('by') ?? 'agent') as UsageDim;
      if (!DIMS.includes(by)) throw new HttpError(400, 'Chiều thống kê không hợp lệ');
      const filter = { agent: q('agent'), department: q('department'), task: q('task'), project: q('project'), since: q('since') };
      return send(res, 200, { by, total: usage.total(filter), rows: usage.summary(by, filter) });
    }

    if (p === '/api/logs') {
      return send(res, 200, logs.query({ agent: q('agent'), department: q('department'), task: q('task'), level: q('level'), limit: Number(q('limit') ?? 200) }));
    }

    if (p === '/api/projects' && req.method === 'GET') return send(res, 200, store.projects());
    if (p === '/api/projects' && req.method === 'POST') {
      const b = await readBody(req);
      const id = String(b.id ?? '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new HttpError(400, 'id dự án: chữ thường, số, gạch ngang (2–41 ký tự)');
      const cls = (b.classification ?? config.dataProtection.defaultClassification) as Classification;
      if (!CLASSES.includes(cls)) throw new HttpError(400, 'Phân loại dữ liệu không hợp lệ');
      const dept = String(b.department ?? 'auto');
      if (!['auto', 'joint', ...registry.departments.keys()].includes(dept)) throw new HttpError(400, 'Phòng ban không hợp lệ');
      if (b.runtime && !runtimes.get(String(b.runtime))) throw new HttpError(400, 'Runtime không tồn tại');
      if (b.toolAccess && !ACCESS.includes(b.toolAccess)) throw new HttpError(400, 'Quyền công cụ không hợp lệ');
      if (b.budgetMode && !BUDGET_MODES.includes(b.budgetMode)) throw new HttpError(400, 'Chế độ ngân sách không hợp lệ');
      if (b.workspace && path.isAbsolute(String(b.workspace)) && !fs.existsSync(String(b.workspace))) throw new HttpError(400, `Thư mục không tồn tại: ${b.workspace}`);
      const existing = store.project(id);
      const proj: ProjectDef = {
        id,
        name: String(b.name ?? id).slice(0, 120),
        description: b.description ? String(b.description).slice(0, 2000) : undefined,
        department: dept,
        workspace: b.workspace ? String(b.workspace) : undefined,
        classification: cls,
        runtime: b.runtime ? String(b.runtime) : undefined,
        agents: Array.isArray(b.agents) ? b.agents.map(String).filter((x: string) => registry.agents.has(x)) : undefined,
        budgetTokens: b.budgetTokens ? Number(b.budgetTokens) : undefined,
        budgetMode: b.budgetMode || undefined,
        toolAccess: b.toolAccess || undefined,
        isolation: b.isolation === 'none' || b.isolation === 'worktree' ? b.isolation : undefined,
        worktreeCopy: Array.isArray(b.worktreeCopy) ? b.worktreeCopy.map(String).filter((x: string) => /^[\w.-]+$/.test(x)) : existing?.worktreeCopy,
        denyCommands: Array.isArray(b.denyCommands) ? b.denyCommands.map(String).slice(0, 50) : existing?.denyCommands,
        createdAt: existing?.createdAt ?? nowIso(),
      };
      store.saveProject(proj);
      logs.write({ level: 'info', kind: 'project.saved', msg: `Lưu dự án ${proj.id} (${proj.classification})`, projectId: proj.id });
      return send(res, 201, proj);
    }
    if ((mm = m(/^\/api\/projects\/([^/]+)$/)) && req.method === 'DELETE') {
      return send(res, store.removeProject(mm[1]) ? 200 : 404, { ok: true });
    }

    if (p === '/api/runtimes') {
      const list = await runtimes.status(q('refresh') === '1');
      return send(res, 200, list.map((r) => ({ ...r, allowed: Object.fromEntries(CLASSES.map((c) => [c, runtimes.allowed(r.id, c)])) })));
    }

    if (p === '/api/reload' && req.method === 'POST') {
      registry.reload();
      return send(res, 200, { agents: registry.agents.size, departments: registry.departments.size, errors: registry.errors });
    }

    throw new HttpError(404, 'API không tồn tại');
  };

  return http.createServer((req, res) => {
    handler(req, res).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) logs.write({ level: 'error', kind: 'http', msg: `${req.method} ${req.url}: ${(e as Error).message}` });
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
      else res.end();
    });
  });
}
