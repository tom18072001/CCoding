import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';
import { estimateTokens } from '../util/tokens.js';
import { classifyError } from './errors.js';
import { withTimeout } from './common.js';
import { resolveCommand, runProcess } from './spawn.js';

/**
 * UI-7 (học từ adapter process/http của Paperclip): cắm một agent bên ngoài làm runtime.
 *
 *   "my-agent":   { "type": "process", "command": "node", "extraArgs": ["agents/my-agent.mjs"] }
 *   "team-agent": { "type": "http", "baseUrl": "http://127.0.0.1:8088/run", "apiKeyEnv": "TEAM_AGENT_KEY" }
 *
 * Giao kèo: nhận một JSON (stdin với process, thân POST với http)
 *   { version: 1, runId, phase, model, system, context, prompt, maxTokens, agent: { id, name, role, department }, meta }
 * và trả về JSON { text, usage?: { input, output }, model? } — hoặc văn bản thuần (process).
 *
 * Khác Paperclip ở chỗ an toàn dữ liệu: lượt gọi vẫn đi qua Orchestrator.call() (log, đếm token, chính sách dữ liệu);
 * tiến trình con chỉ nhận PATH/HOME/LANG + CCODING_* (không thừa hưởng khóa API của máy chủ); runtime http chỉ được coi là
 * "cục bộ" (nhận dữ liệu Bảo mật/Hạn chế) khi địa chỉ là loopback — cấu hình "local": true với máy chủ ở xa bị bỏ qua.
 */
export const EXTERNAL_TYPES = ['process', 'http'] as const;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function isLoopbackUrl(u: string | undefined): boolean {
  try {
    return LOOPBACK.has(new URL(String(u)).hostname);
  } catch {
    return false;
  }
}

/** Đọc kết quả của agent ngoài: JSON {text, usage, model} hoặc văn bản thuần. */
export function parseExternalOutput(raw: string): { text: string; input?: number; output?: number; model?: string } {
  const s = raw.trim();
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s);
      if (typeof j.text === 'string') {
        const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : undefined);
        return { text: j.text, input: n(j.usage?.input), output: n(j.usage?.output), model: typeof j.model === 'string' ? j.model : undefined };
      }
    } catch {
      /* không phải JSON hợp lệ → coi như văn bản */
    }
  }
  return { text: s };
}

export class ExternalRuntime implements Runtime {
  readonly label: string;
  readonly local: boolean;
  readonly supportsTools = false;
  readonly kind: 'process' | 'http';

  constructor(
    readonly id: string,
    private cfg: RuntimeConfig,
  ) {
    this.kind = cfg.type === 'http' ? 'http' : 'process';
    this.label = cfg.label ?? `${id} (${this.kind === 'http' ? 'agent HTTP' : 'agent tiến trình'})`;
    this.local = this.kind === 'http' ? cfg.local !== false && isLoopbackUrl(cfg.baseUrl) : cfg.local !== false;
  }

  async available(): Promise<RuntimeAvailability> {
    if (this.kind === 'http') {
      try {
        new URL(String(this.cfg.baseUrl));
      } catch {
        return { ok: false, detail: 'thiếu hoặc sai "baseUrl"' };
      }
      if (this.cfg.apiKeyEnv && !process.env[this.cfg.apiKeyEnv]) return { ok: false, detail: `chưa đặt biến môi trường ${this.cfg.apiKeyEnv}` };
      return { ok: true, detail: `${this.cfg.baseUrl}${this.local ? '' : ' · ngoài máy (không nhận dữ liệu Bảo mật/Hạn chế)'}` };
    }
    if (!this.cfg.command) return { ok: false, detail: 'thiếu "command"' };
    const r = resolveCommand(this.cfg.command);
    return r ? { ok: true, detail: r.file } : { ok: false, detail: `không tìm thấy lệnh "${this.cfg.command}"` };
  }

  private payload(req: RunRequest) {
    return {
      version: 1,
      runId: req.meta.callId,
      phase: req.phase,
      model: req.model,
      system: req.system,
      context: req.context ?? '',
      prompt: req.prompt,
      maxTokens: req.maxTokens,
      agent: { id: req.agent.id, name: req.agent.name, role: req.agent.role, department: req.agent.department },
      meta: req.meta,
    };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const t0 = Date.now();
    const body = JSON.stringify(this.payload(req));
    const done = (raw: string, model?: string): RunResult => {
      const out = parseExternalOutput(raw);
      const est = out.input === undefined || out.output === undefined;
      const input = out.input ?? estimateTokens(`${req.system}\n${req.context ?? ''}\n${req.prompt}`);
      const output = out.output ?? estimateTokens(out.text);
      return {
        text: out.text,
        usage: { input, output, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
        estimated: est,
        model: out.model ?? model ?? req.model,
        runtime: this.id,
        durationMs: Date.now() - t0,
        ...(out.text ? {} : { error: 'Agent ngoài không trả nội dung', errorKind: 'empty' as const }),
      };
    };
    const fail = (error: string, status?: number): RunResult => ({
      text: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
      estimated: true,
      model: req.model,
      runtime: this.id,
      durationMs: Date.now() - t0,
      error,
      errorKind: classifyError(status, error),
    });

    if (this.kind === 'http') {
      const signal = withTimeout(hooks.signal, req.timeoutMs);
      const key = this.cfg.apiKeyEnv ? process.env[this.cfg.apiKeyEnv] : undefined;
      try {
        const res = await fetch(String(this.cfg.baseUrl), {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', ...(this.cfg.headers ?? {}), ...(key ? { authorization: `Bearer ${key}` } : {}) },
          body,
        });
        const text = await res.text();
        if (!res.ok) return fail(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
        return done(text);
      } catch (e) {
        return fail(signal.aborted && !hooks.signal?.aborted ? `quá thời gian ${req.timeoutMs} ms` : (e as Error).message);
      }
    }

    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? process.env.Path,
      HOME: process.env.HOME ?? process.env.USERPROFILE,
      LANG: process.env.LANG ?? 'C.UTF-8',
      ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT } : {}),
      CCODING_RUN_ID: req.meta.callId,
      CCODING_TASK_ID: req.meta.taskId,
      CCODING_AGENT_ID: req.agent.id,
      CCODING_PHASE: req.phase,
    };
    try {
      const r = await runProcess({ cmd: String(this.cfg.command), args: this.cfg.extraArgs ?? [], cwd: req.cwd, stdin: body, env, replaceEnv: true, timeoutMs: req.timeoutMs, signal: hooks.signal });
      if (r.aborted) return fail('đã hủy');
      if (r.timedOut) return { ...fail(`quá thời gian ${req.timeoutMs} ms`), errorKind: 'timeout' };
      if (r.code !== 0) return fail(`thoát mã ${r.code}: ${(r.stderr || r.stdout).trim().slice(-300)}`);
      return done(r.stdout);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
