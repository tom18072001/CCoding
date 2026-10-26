import { estimateTokens } from '../util/tokens.js';
import { sseData, withTimeout } from './common.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';

function apiKey(cfg: RuntimeConfig, fallbackEnv: string): string | undefined {
  return process.env[cfg.apiKeyEnv ?? fallbackEnv] || undefined;
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

// ── OpenAI-compatible Chat Completions (9router, Ollama, OpenRouter, vLLM, …) ─

export class OpenAiApiRuntime implements Runtime {
  id = 'openai-api';
  label = 'OpenAI-compatible API';
  local: boolean;
  supportsTools = false;
  private modelList?: string[];

  constructor(private cfg: RuntimeConfig, private models: Record<string, string>) {
    this.local = cfg.local === true;
  }

  private base(): string {
    return (this.cfg.baseUrl ?? 'http://localhost:20128/v1').replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    const key = apiKey(this.cfg, 'OPENAI_API_KEY');
    return { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
  }

  async available(): Promise<RuntimeAvailability> {
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers(), signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { ok: false, detail: `${this.base()} trả ${res.status}` };
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      this.modelList = (body.data ?? []).map((m) => m.id);
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
      headers: this.headers(),
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
