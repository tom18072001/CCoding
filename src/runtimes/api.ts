import { spawnSync } from 'node:child_process';
import { estimateTokens } from '../util/tokens.js';
import { sseData, withTimeout } from './common.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';

function apiKey(cfg: RuntimeConfig, fallbackEnv: string): string | undefined {
  return readEnv(cfg.apiKeyEnv ?? fallbackEnv);
}

/** Biến môi trường bắt buộc phải có (ví dụ khóa của dịch vụ phía sau gateway). */
function missingEnv(cfg: RuntimeConfig): string[] {
  return (cfg.requireEnv ?? []).filter((n) => !readEnv(n));
}

// ── Anthropic Messages API ───────────────────────────────────────────────────

export class AnthropicApiRuntime implements Runtime {
  id = 'anthropic-api';
  label = 'Anthropic API';
  local = false;
  supportsTools = false;
  constructor(private cfg: RuntimeConfig, private models: Record<string, string>) {}

  async available(): Promise<RuntimeAvailability> {
    const key = apiKey(this.cfg, 'ANTHROPIC_API_KEY');
    return key ? { ok: true, detail: `khóa từ $${this.cfg.apiKeyEnv ?? 'ANTHROPIC_API_KEY'}` } : { ok: false, detail: `chưa đặt $${this.cfg.apiKeyEnv ?? 'ANTHROPIC_API_KEY'}` };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const key = apiKey(this.cfg, 'ANTHROPIC_API_KEY');
    if (!key) throw new Error('Thiếu ANTHROPIC_API_KEY');
    const model = this.models[req.model] ?? req.model;
    const res = await fetch(`${(this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: this.cfg.maxTokens ?? 8000,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        stream: true,
      }),
      signal: withTimeout(hooks.signal, req.timeoutMs),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    let text = '';
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let usedModel = model;
    let error: string | undefined;
    for await (const data of sseData(res)) {
      let ev: Record<string, any>;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'message_start') {
        const u = ev.message?.usage ?? {};
        input = u.input_tokens ?? 0;
        cacheRead = u.cache_read_input_tokens ?? 0;
        cacheWrite = u.cache_creation_input_tokens ?? 0;
        usedModel = ev.message?.model ?? model;
      } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        text += ev.delta.text;
        hooks.onText?.(ev.delta.text);
      } else if (ev.type === 'message_delta' && ev.usage) {
        output = ev.usage.output_tokens ?? output;
      } else if (ev.type === 'error') {
        error = ev.error?.message ?? 'lỗi API';
      }
    }
    return {
      text: text.trim(),
      usage: { input, output, cacheRead, cacheWrite, costUsd: 0 },
      estimated: false,
      model: usedModel,
      runtime: this.id,
      durationMs: Date.now() - started,
      error,
    };
  }
}

// ── OpenAI-compatible Chat Completions (Bifrost, LiteLLM, 9router, Ollama, OpenRouter, vLLM, …) ─

const userEnvCache = new Map<string, { at: number; val: string | undefined }>();

/**
 * Đọc biến môi trường; trên Windows nếu tiến trình chưa thấy (biến vừa đặt bằng `setx`)
 * thì đọc thẳng từ HKCU\Environment. Không bao giờ ghi giá trị ra log.
 */
export function readEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (process.platform !== 'win32') return undefined;
  const hit = userEnvCache.get(name);
  if (!hit || Date.now() - hit.at > 30_000) {
    let val: string | undefined;
    try {
      const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const m = new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`, 'i').exec(r.stdout ?? '');
      val = m?.[1]?.trim() || undefined;
    } catch {
      val = undefined;
    }
    userEnvCache.set(name, { at: Date.now(), val });
  }
  return userEnvCache.get(name)!.val;
}

/** Giá trị bí mật: "env:TEN_BIEN", "TEN_BIEN" (nếu có trong môi trường) hoặc chuỗi khóa trực tiếp. */
export function resolveSecret(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v.startsWith('env:')) return readEnv(v.slice(4));
  if (/^[A-Z_][A-Z0-9_]*$/.test(v)) return readEnv(v);
  return v;
}

const headerSafe = (s: string) => s.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120);

/**
 * Header gửi kèm để gateway (Bifrost/LiteLLM) thống kê theo agent/phòng/task và áp key riêng từng phòng.
 * Chỉ chứa mã định danh (không PII, không nội dung).
 */
export function gatewayHeaders(cfg: RuntimeConfig, req: Pick<RunRequest, 'agent' | 'phase' | 'meta'>): Record<string, string> {
  const h: Record<string, string> = {};
  const style = String(cfg.tags ?? 'both');
  const dept = req.meta.department;
  const dims: Record<string, string> = {
    app: 'ccoding',
    agent: req.agent.id,
    department: dept,
    task: req.meta.taskId,
    phase: req.phase,
    ...(req.meta.projectId ? { project: req.meta.projectId } : {}),
    ...(req.meta.subtaskId ? { subtask: req.meta.subtaskId } : {}),
  };
  if (style !== 'none') h['x-request-id'] = headerSafe(req.meta.callId);
  if (style === 'bifrost' || style === 'both') for (const [k, v] of Object.entries(dims)) h[`x-bf-dim-${k}`] = headerSafe(v);
  if (style === 'litellm' || style === 'both')
    h['x-litellm-tags'] = ['ccoding', ...Object.entries(dims).filter(([k]) => k !== 'app').map(([k, v]) => `${k}:${headerSafe(v)}`)].join(',');
  const vks = (cfg.virtualKeys ?? {}) as Record<string, string>;
  const vk = resolveSecret(vks[dept] ?? vks['*']);
  if (vk) {
    const name = String(cfg.virtualKeyHeader ?? 'x-bf-vk').toLowerCase();
    h[name] = name === 'authorization' ? `Bearer ${vk}` : vk;
  }
  for (const [k, v] of Object.entries((cfg.headers ?? {}) as Record<string, string>)) h[k.toLowerCase()] = String(v);
  return h;
}

export class OpenAiApiRuntime implements Runtime {
  id: string;
  label: string;
  local: boolean;
  supportsTools = false;
  private modelList?: string[];

  constructor(private cfg: RuntimeConfig, private models: Record<string, string>, id = 'openai-api') {
    this.id = id;
    this.label = String(cfg.label ?? (id === 'openai-api' ? 'OpenAI-compatible API' : id));
    this.local = cfg.local === true;
  }

  private base(): string {
    return (this.cfg.baseUrl ?? 'http://localhost:20128/v1').replace(/\/$/, '');
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const key = apiKey(this.cfg, 'OPENAI_API_KEY');
    return { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra };
  }

  async available(): Promise<RuntimeAvailability> {
    const miss = missingEnv(this.cfg);
    if (miss.length) return { ok: false, detail: `chưa đặt ${miss.map((m) => `$${m}`).join(', ')}` };
    try {
      const vks = (this.cfg.virtualKeys ?? {}) as Record<string, string>;
      const anyVk = resolveSecret(vks['*'] ?? Object.values(vks)[0]);
      const vkHeader = String(this.cfg.virtualKeyHeader ?? 'x-bf-vk').toLowerCase();
      const extra = anyVk ? { [vkHeader]: vkHeader === 'authorization' ? `Bearer ${anyVk}` : anyVk } : {};
      const res = await fetch(`${this.base()}/models`, { headers: this.headers(extra), signal: AbortSignal.timeout(Number(this.cfg.probeTimeoutMs ?? 12000)) });
      if (!res.ok) return { ok: false, detail: `${this.base()} trả ${res.status}` };
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      this.modelList = (body.data ?? []).map((m) => m.id);
      if (!this.modelList.length && !this.cfg.defaultModel && !Object.keys(this.models).length)
        return { ok: false, detail: `${this.base()} chạy nhưng chưa có model nào — thêm provider/model trước`, models: [] };
      return { ok: true, detail: `${this.base()} · ${this.modelList.length} model`, models: this.modelList };
    } catch (e) {
      return { ok: false, detail: `không kết nối được ${this.base()} (${(e as Error).message.slice(0, 60)})` };
    }
  }

  private resolveModel(alias: string): string {
    const m = this.models[alias] ?? this.cfg.defaultModel;
    if (m) return m;
    if (this.modelList?.length) return this.modelList[0];
    return alias;
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    if (!this.modelList && !this.models[req.model] && !this.cfg.defaultModel) await this.available();
    const model = this.resolveModel(req.model);
    const res = await fetch(`${this.base()}/chat/completions`, {
      method: 'POST',
      headers: this.headers(gatewayHeaders(this.cfg, req)),
      body: JSON.stringify({
        model,
        max_tokens: this.cfg.maxTokens ?? 8000,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
      }),
      signal: withTimeout(hooks.signal, req.timeoutMs),
    });
    if (!res.ok) throw new Error(`${this.base()} ${res.status}: ${(await res.text()).slice(0, 400)}`);
    let text = '';
    let input = 0;
    let output = 0;
    let cached = 0;
    let usedModel = model;
    for await (const data of sseData(res)) {
      if (data === '[DONE]') break;
      let ev: Record<string, any>;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.model) usedModel = ev.model;
      const delta = ev.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        text += delta;
        hooks.onText?.(delta);
      }
      if (ev.usage) {
        input = ev.usage.prompt_tokens ?? input;
        output = ev.usage.completion_tokens ?? output;
        cached = ev.usage.prompt_tokens_details?.cached_tokens ?? cached;
      }
    }
    const estimated = input === 0 && output === 0;
    return {
      text: text.trim(),
      usage: {
        input: estimated ? estimateTokens(req.system + req.prompt) : Math.max(0, input - cached),
        output: estimated ? estimateTokens(text) : output,
        cacheRead: cached,
        cacheWrite: 0,
        costUsd: 0,
      },
      estimated,
      model: usedModel,
      runtime: this.id,
      durationMs: Date.now() - started,
    };
  }
}
