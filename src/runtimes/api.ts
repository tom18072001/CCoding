import { spawnSync } from 'node:child_process';
import { estimateTokens } from '../util/tokens.js';
import { redact } from '../util/redact.js';
import { combinedPrompt, sseData, userPrompt, withTimeout } from './common.js';
import { classifyError, looksLikeLimitMessage, parseRetryAt, RuntimeError, toRuntimeError } from './errors.js';
import { argsSummary, executeTool, toolDefinitions } from '../tools/workspace.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability, ToolCallRecord } from '../types.js';

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
    if (!key) throw new RuntimeError('Thiếu ANTHROPIC_API_KEY', 'auth');
    const model = this.models[req.model] ?? req.model;
    // Prompt caching: bối cảnh chung của nhiệm vụ đặt đầu system (giống nhau giữa các agent) + hồ sơ vị trí, mỗi khối một điểm cache.
    const system: Array<Record<string, unknown>> = [];
    if (req.context) system.push({ type: 'text', text: req.context, cache_control: { type: 'ephemeral' } });
    system.push({ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } });
    let res: Response;
    try {
      res = await fetch(`${(this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? this.cfg.maxTokens ?? 8000,
          system,
          messages: [{ role: 'user', content: req.prompt }],
          stream: true,
        }),
        signal: withTimeout(hooks.signal, req.timeoutMs),
      });
    } catch (e) {
      if (hooks.signal?.aborted) throw e;
      throw toRuntimeError(e);
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600);
      throw new RuntimeError(`Anthropic API ${res.status}: ${body}`, classifyError(res.status, body), res.status, parseRetryAt(res.headers, body));
    }
    let text = '';
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let usedModel = model;
    let error: string | undefined;
    let finishReason: string | undefined;
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
      } else if (ev.type === 'message_delta') {
        if (ev.usage) output = ev.usage.output_tokens ?? output;
        if (ev.delta?.stop_reason) finishReason = ev.delta.stop_reason;
      } else if (ev.type === 'error') {
        error = ev.error?.message ?? 'lỗi API';
      }
    }
    if (error && !text) throw new RuntimeError(`Anthropic API: ${error}`, classifyError(undefined, error), undefined, parseRetryAt(undefined, error));
    return {
      text: text.trim(),
      usage: { input, output, cacheRead, cacheWrite, costUsd: 0 },
      estimated: false,
      model: usedModel,
      runtime: this.id,
      durationMs: Date.now() - started,
      error,
      finishReason: finishReason === 'max_tokens' ? 'length' : finishReason,
      truncated: finishReason === 'max_tokens',
      turns: 1,
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

interface StreamTurn {
  text: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
  finish?: string;
  input: number;
  output: number;
  cached: number;
  model?: string;
  events: number;
}

type ChatMsg = Record<string, unknown> & { role: string };

export class OpenAiApiRuntime implements Runtime {
  id: string;
  label: string;
  local: boolean;
  supportsTools: boolean;
  private modelList?: string[];

  constructor(private cfg: RuntimeConfig, private models: Record<string, string>, id = 'openai-api') {
    this.id = id;
    this.label = String(cfg.label ?? (id === 'openai-api' ? 'OpenAI-compatible API' : id));
    this.local = cfg.local === true;
    this.supportsTools = cfg.supportsTools !== false;
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
    const m = this.models[alias] ?? (['opus', 'sonnet', 'haiku'].includes(alias) ? this.cfg.defaultModel : alias);
    if (m) return m;
    if (this.modelList?.length) return this.modelList[0];
    return alias;
  }

  /** Một lượt chat/completions (stream) — trả về văn bản, lời gọi công cụ, usage. */
  private async turn(req: RunRequest, hooks: RunHooks, model: string, messages: ChatMsg[], tools: unknown[] | undefined): Promise<StreamTurn> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}/chat/completions`, {
        method: 'POST',
        headers: this.headers(gatewayHeaders(this.cfg, req)),
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? this.cfg.maxTokens ?? 8000,
          stream: true,
          stream_options: { include_usage: true },
          messages,
          ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: withTimeout(hooks.signal, req.timeoutMs),
      });
    } catch (e) {
      if (hooks.signal?.aborted) throw e;
      throw toRuntimeError(e);
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600);
      throw new RuntimeError(`${this.base()} ${res.status}: ${body}`, classifyError(res.status, body), res.status, parseRetryAt(res.headers, body));
    }
    const t: StreamTurn = { text: '', toolCalls: [], input: 0, output: 0, cached: 0, events: 0 };
    const calls = new Map<number, { id: string; name: string; args: string }>();
    try {
      for await (const data of sseData(res)) {
        if (data === '[DONE]') break;
        let ev: Record<string, any>;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        t.events++;
        if (ev.error) {
          const msg = typeof ev.error === 'string' ? ev.error : (ev.error.message ?? JSON.stringify(ev.error));
          throw new RuntimeError(`${this.base()}: ${msg}`, classifyError(Number(ev.error.code) || undefined, msg), undefined, parseRetryAt(undefined, msg));
        }
        if (ev.model) t.model = ev.model;
        const ch = ev.choices?.[0];
        const delta = ch?.delta?.content;
        if (typeof delta === 'string' && delta) {
          t.text += delta;
          hooks.onText?.(delta);
        }
        for (const tc of ch?.delta?.tool_calls ?? []) {
          const k = typeof tc.index === 'number' ? tc.index : calls.size;
          const cur = calls.get(k) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(k, cur);
        }
        if (ch?.finish_reason) t.finish = ch.finish_reason;
        if (ev.usage) {
          t.input = ev.usage.prompt_tokens ?? t.input;
          t.output = ev.usage.completion_tokens ?? t.output;
          t.cached = ev.usage.prompt_tokens_details?.cached_tokens ?? ev.usage.cache_read_input_tokens ?? t.cached;
        }
      }
    } catch (e) {
      if (hooks.signal?.aborted || e instanceof RuntimeError) throw e;
      throw toRuntimeError(e);
    }
    t.toolCalls = [...calls.values()].filter((c) => c.name).map((c, i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}` }));
    return t;
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    if (!this.modelList && !this.models[req.model] && !this.cfg.defaultModel && ['opus', 'sonnet', 'haiku'].includes(req.model)) await this.available();
    const model = this.resolveModel(req.model);
    const policy = req.toolPolicy;
    const useTools = this.supportsTools && req.allowTools && !!policy && policy.allow.length > 0;
    const tools = useTools ? toolDefinitions(policy!.allow) : undefined;
    const messages: ChatMsg[] =
      this.cfg.promptStyle === 'combined'
        ? [{ role: 'user', content: combinedPrompt(req) }]
        : [
            { role: 'system', content: req.system },
            { role: 'user', content: userPrompt(req) },
          ];
    const usage = { input: 0, output: 0, cached: 0 };
    let usedModel = model;
    let finish: string | undefined;
    let finalText = '';
    let narration = '';
    const records: ToolCallRecord[] = [];
    const diag: string[] = [];
    const maxTurns = useTools ? Math.max(1, policy!.maxTurns) : 1;
    const inputCap = useTools ? (policy!.maxInputTokens ?? 0) : 0;
    let nudged = false;
    let finalAsked = false;
    let turns = 0;
    for (;;) {
      turns++;
      let t: StreamTurn;
      try {
        t = await this.turn(req, hooks, model, messages, tools);
      } catch (e) {
        if (hooks.signal?.aborted) throw e;
        const re = toRuntimeError(e);
        // giữa vòng lặp công cụ dài: thử lại lượt này một lần (mất kết nối thoáng qua) thay vì bỏ cả công việc đã làm
        let retried: StreamTurn | undefined;
        if (turns > 1 && (re.kind === 'transient' || re.kind === 'timeout' || re.kind === 'empty')) {
          hooks.onActivity?.(`↻ thử lại lượt ${turns} sau lỗi: ${re.message.slice(0, 80)}`);
          diag.push(`lượt ${turns} lỗi (${re.kind}) — đã thử lại`);
          await new Promise((r) => setTimeout(r, 3000));
          try {
            retried = await this.turn(req, hooks, model, messages, tools);
          } catch (e2) {
            if (hooks.signal?.aborted) throw e2;
          }
        }
        if (!retried) {
          if (turns > 1) re.partial = { input: Math.max(0, usage.input - usage.cached), output: usage.output, cacheRead: usage.cached, turns: turns - 1, toolCalls: records.length ? records : undefined, model: usedModel };
          throw re;
        }
        t = retried;
      }
      usage.input += t.input;
      usage.output += t.output;
      usage.cached += t.cached;
      if (t.model) usedModel = t.model;
      finish = t.finish;
      if (t.toolCalls.length && useTools && turns <= maxTurns && !finalAsked) {
        if (t.text.trim()) narration += `${t.text.trim()}\n`;
        messages.push({ role: 'assistant', content: t.text || null, tool_calls: t.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
        for (const c of t.toolCalls) {
          let args: unknown = {};
          let parseErr = '';
          try {
            args = c.args ? JSON.parse(c.args) : {};
          } catch (e) {
            parseErr = `Tham số JSON không hợp lệ (${(e as Error).message}) — có thể do đầu ra bị cắt; hãy gửi lại với nội dung ngắn hơn hoặc chia nhỏ file.`;
          }
          const out = parseErr
            ? { ok: false, output: `LỖI: ${parseErr}`, ms: 0, summary: `${c.name} ✗ JSON lỗi` }
            : await executeTool(c.name, args, policy!, hooks.signal);
          hooks.onActivity?.(out.summary);
          records.push({ name: c.name, args: argsSummary(c.name, args), ok: out.ok, ms: out.ms, outputChars: out.output.length, error: out.ok ? undefined : out.output.slice(0, 300) });
          // nội dung file/đầu ra lệnh đi ra nhà cung cấp bên ngoài → che bí mật (và PII với dữ liệu Bảo mật/Hạn chế)
          messages.push({ role: 'tool', tool_call_id: c.id, content: req.redact ? redact(out.output, req.redact) : out.output });
        }
        compactHistory(messages);
        const overBudget = inputCap > 0 && usage.input >= inputCap;
        if (turns >= maxTurns || overBudget) {
          finalAsked = true;
          if (overBudget) diag.push(`chạm trần ${inputCap} token đầu vào của vòng lặp công cụ sau ${turns} lượt`);
          messages.push({ role: 'user', content: `${overBudget ? 'Đã dùng hết ngân sách token cho công cụ ở bước này.' : 'Đã dùng hết số lượt công cụ cho bước này.'} KHÔNG gọi thêm công cụ — hãy viết ngay câu trả lời cuối cùng (sản phẩm bàn giao) theo đúng mẫu, ghi rõ việc còn dang dở.` });
        }
        continue;
      }
      if (t.toolCalls.length && !useTools) {
        // upstream (vd. proxy chèn system prompt riêng) khiến model gọi công cụ không tồn tại
        diag.push(`model gọi công cụ không được cấp: ${t.toolCalls.map((c) => c.name).join(', ')} (${t.toolCalls.reduce((n, c) => n + c.args.length, 0)} ký tự tham số bị bỏ)`);
        if (!t.text.trim() && !nudged) {
          nudged = true;
          messages.push({ role: 'assistant', content: '(đã cố gọi công cụ)' });
          messages.push({ role: 'user', content: 'Bạn KHÔNG có công cụ nào ở bước này. Hãy viết toàn bộ câu trả lời trực tiếp bằng văn bản (nếu cần tạo file, đặt nội dung trong khối code kèm tên file).' });
          continue;
        }
      }
      finalText = t.text;
      if (t.toolCalls.length && useTools && finalAsked) diag.push('đã yêu cầu viết câu trả lời cuối nhưng model vẫn gọi công cụ (bỏ qua)');
      if (!t.text.trim()) diag.push(`lượt cuối rỗng (finish=${t.finish ?? '?'}, ${t.events} sự kiện stream)`);
      break;
    }
    let text = finalText.trim();
    if (!text && narration.trim()) text = narration.trim();
    if (looksLikeLimitMessage(text)) throw new RuntimeError(`${this.base()}: ${text}`, 'quota', undefined, parseRetryAt(undefined, text));
    // nhà cung cấp trả 200 nhưng không có nội dung (vd. một số model qua proxy) → coi là lỗi để chuyển tài nguyên
    if (!text && !records.length) throw new RuntimeError(`${model}: phản hồi rỗng${diag.length ? ` (${diag.join('; ')})` : ''}`, 'empty');
    const estimated = usage.input === 0 && usage.output === 0;
    return {
      text,
      usage: {
        input: estimated ? estimateTokens(combinedPrompt(req)) : Math.max(0, usage.input - usage.cached),
        output: estimated ? estimateTokens(text) : usage.output,
        cacheRead: usage.cached,
        cacheWrite: 0,
        costUsd: 0,
      },
      estimated,
      model: usedModel,
      runtime: this.id,
      durationMs: Date.now() - started,
      finishReason: finish,
      truncated: finish === 'length',
      turns,
      toolCalls: records.length ? records : undefined,
      diag: diag.length ? diag.join('; ') : undefined,
    };
  }
}

/**
 * Giữ lịch sử hội thoại công cụ gọn: kết quả công cụ cũ (trừ 6 kết quả gần nhất) rút còn 600 ký tự —
 * mỗi lượt gửi lại toàn bộ lịch sử nên phần này quyết định chi phí token của vòng lặp.
 */
export function compactHistory(messages: ChatMsg[], keep = 4, max = 500): void {
  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  for (const i of toolIdx.slice(0, Math.max(0, toolIdx.length - keep))) {
    const c = String(messages[i].content ?? '');
    if (c.length > max) messages[i].content = `${c.slice(0, max)}\n… [kết quả cũ đã lược bớt — gọi lại công cụ nếu cần]`;
  }
  // tham số write_file cũ (nội dung file) cũng rút gọn — file đã nằm trên đĩa
  const asst = messages.map((m, i) => (m.role === 'assistant' && Array.isArray(m.tool_calls) ? i : -1)).filter((i) => i >= 0);
  for (const i of asst.slice(0, Math.max(0, asst.length - 2))) {
    for (const tc of messages[i].tool_calls as Array<{ function: { name: string; arguments: string } }>) {
      if (tc.function.arguments.length > 2000) {
        try {
          const a = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          for (const k of ['content', 'new_string', 'old_string']) if (typeof a[k] === 'string' && (a[k] as string).length > 400) a[k] = `${(a[k] as string).slice(0, 400)}… [đã ghi ra file]`;
          tc.function.arguments = JSON.stringify(a);
        } catch {
          tc.function.arguments = tc.function.arguments.slice(0, 2000);
        }
      }
    }
  }
}
