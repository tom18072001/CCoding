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
  cacheWrite: number;
  model?: string;
  events: number;
  /** Số ký tự "suy nghĩ" (delta.reasoning / reasoning_content) — model suy nghĩ mà không trả lời thì nhắc viết câu trả lời. */
  reasoning: number;
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
    const payload = wantsCacheControl(this.cfg, model) ? withCacheMarks(messages, req, this.cfg.promptStyle === 'combined') : messages;
    // luồng treo (không byte nào, kể cả keepalive) quá idleTimeoutMs → hủy lượt này thay vì chờ hết timeoutMs (30 phút)
    const idleMs = this.cfg.idleTimeoutMs ?? 300_000;
    const idle = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      if (!idleMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => idle.abort(), idleMs);
    };
    const stalled = () => new RuntimeError(`${this.base()}: luồng trả lời không có dữ liệu trong ${Math.round(idleMs / 1000)} giây (treo)`, 'timeout');
    kick();
    let res: Response;
    try {
      res = await fetch(`${this.base()}/chat/completions`, {
        method: 'POST',
        headers: this.headers(gatewayHeaders(this.cfg, req)),
        body: JSON.stringify({
          ...extraBodyFor(this.cfg, req.phase),
          model,
          max_tokens: req.maxTokens ?? this.cfg.maxTokens ?? 8000,
          stream: true,
          stream_options: { include_usage: true },
          messages: payload,
          ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: AbortSignal.any([withTimeout(hooks.signal, req.timeoutMs), idle.signal]),
      });
    } catch (e) {
      if (idleTimer) clearTimeout(idleTimer);
      if (hooks.signal?.aborted) throw e;
      if (idle.signal.aborted) throw stalled();
      throw toRuntimeError(e);
    }
    if (!res.ok) {
      if (idleTimer) clearTimeout(idleTimer);
      const body = (await res.text()).slice(0, 600);
      throw new RuntimeError(`${this.base()} ${res.status}: ${body}`, classifyError(res.status, body), res.status, parseRetryAt(res.headers, body));
    }
    const t: StreamTurn = { text: '', toolCalls: [], input: 0, output: 0, cached: 0, cacheWrite: 0, events: 0, reasoning: 0 };
    const calls = new Map<number, { id: string; name: string; args: string }>();
    try {
      for await (const data of sseData(res, kick)) {
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
        const think = ch?.delta?.reasoning ?? ch?.delta?.reasoning_content;
        if (typeof think === 'string') t.reasoning += think.length;
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
          t.cached = ev.usage.prompt_tokens_details?.cached_tokens ?? ev.usage.cache_read_input_tokens ?? ev.usage.cache_read_tokens ?? t.cached;
          const pd = ev.usage.prompt_tokens_details ?? {};
          // Bifrost (provider kiểu anthropic) báo cache_write_tokens / cached_write_tokens; Anthropic gốc báo cache_creation_input_tokens
          t.cacheWrite = ev.usage.cache_creation_input_tokens ?? pd.cache_creation_tokens ?? pd.cache_write_tokens ?? pd.cached_write_tokens ?? t.cacheWrite;
        }
      }
    } catch (e) {
      if (hooks.signal?.aborted || e instanceof RuntimeError) throw e;
      if (idle.signal.aborted) throw stalled();
      throw toRuntimeError(e);
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
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
    const usage = { input: 0, output: 0, cached: 0, cacheWrite: 0 };
    let usedModel = model;
    let finish: string | undefined;
    let finalText = '';
    let narration = '';
    const records: ToolCallRecord[] = [];
    const diag: string[] = [];
    const maxTurns = useTools ? Math.max(1, policy!.maxTurns) : 1;
    const inputCap = useTools ? (policy!.maxInputTokens ?? 0) : 0;
    // trần token vòng công cụ tính theo chi phí: phần đọc từ cache chỉ tính theo trọng số (mặc định 10%) — có cache thì vòng lặp
    // đi được nhiều lượt hơn trước khi phải "chạy tiếp" với ngữ cảnh mới (chạy tiếp mất cache và phải đọc lại tệp)
    const cachedW = Math.min(1, Math.max(0, policy?.cachedInputWeight ?? 0.1));
    const capUsed = () => usage.input - usage.cached + usage.cached * cachedW;
    let nudged = false;
    let finalAsked = false;
    let claimNudged = false;
    let thinkNudged = false;
    let capped: 'turns' | 'input' | undefined;
    let turns = 0;
    // chống "khảo sát mãi không ghi": đếm tệp đã ghi, nhắc khi đã dùng ~35% / ~65% lượt hoặc trần token mà chưa ghi gì
    let wrote = 0;
    let writeNudges = 0;
    // đọc trùng: cùng tham số read_file, nội dung cũ còn nguyên trong lịch sử và chưa ghi gì từ đó → không gửi lại lần nữa
    const reads = new Map<string, { msg: ChatMsg; turn: number; wroteAt: number }>();
    // ngân sách ngữ cảnh mỗi lượt (runtime không có cache prompt / model cửa sổ nhỏ như Ollama num_ctx): vượt thì rút gọn kết quả cũ
    const ctxBudget = useTools ? toolContextBudget(this.cfg, req.maxTokens ?? this.cfg.maxTokens ?? 8000) : 0;
    // runtime có ngân sách ngữ cảnh: một lần read_file không vượt ~40% ngân sách (khỏi bị cắt ngay sau khi đọc)
    const toolPol: typeof policy = ctxBudget > 0 && policy ? { ...policy, maxReadChars: Math.min(policy.maxReadChars ?? policy.maxOutputChars, Math.max(4000, Math.floor(ctxBudget * 2.5 * 0.4))) } : policy;
    // khảo sát mãi không ghi: đọc/tìm liên tiếp N lần → nhắc; 2N lần → từ chối đọc thêm tới khi ghi tệp
    const readLimit = useTools && policy!.expectWrites ? Math.max(0, policy!.readsBeforeWrite ?? 0) : 0;
    let readStreak = 0;
    let streakNudged = false;
    let readsBlocked = 0;
    let charsPerToken = 2.5; // hiệu chỉnh theo prompt_tokens thật sau mỗi lượt
    let sentChars = 0;
    let fitted = 0;
    for (;;) {
      turns++;
      let t: StreamTurn;
      sentChars = historyChars(messages);
      try {
        t = await this.turn(req, hooks, model, messages, tools);
      } catch (e) {
        if (hooks.signal?.aborted) throw e;
        let re = toRuntimeError(e);
        // giữa vòng lặp công cụ dài: thử lại lượt này một lần (mất kết nối thoáng qua) thay vì bỏ cả công việc đã làm
        let retried: StreamTurn | undefined;
        if (turns > 1 && re.kind === 'rate') {
          // 429 giữa vòng công cụ (vd. Claude Max): chờ ngắn rồi thử lại CHÍNH lượt này — giữ nguyên ngữ cảnh và cache, không phải
          // bỏ cả vòng lặp rồi chạy lại hạng mục từ đầu (ND57 gói 2: 6 lần tạm dừng/tiếp tục trong 4 phút, mỗi lần mất ngữ cảnh)
          const maxWait = Math.max(0, Number(this.cfg.rateWaitMs ?? 240_000));
          let waited = 0;
          for (let k = 1; !retried && re.kind === 'rate' && waited < maxWait; k++) {
            const hint = re.retryAt && re.retryAt > Date.now() ? re.retryAt - Date.now() + 1000 : 20_000 * k;
            if (hint > maxWait - waited) break; // mở lại quá xa (vd. hết hạn mức) → để điều phối chuyển tài nguyên / tạm dừng
            hooks.onActivity?.(`⏳ giới hạn tốc độ ở lượt ${turns} — chờ ${Math.round(hint / 1000)} giây rồi thử lại`);
            diag.push(`lượt ${turns}: giới hạn tốc độ — chờ ${Math.round(hint / 1000)} giây rồi thử lại (giữ ngữ cảnh)`);
            await sleepFor(hint, hooks.signal);
            waited += hint;
            try {
              retried = await this.turn(req, hooks, model, messages, tools);
            } catch (e2) {
              if (hooks.signal?.aborted) throw e2;
              re = toRuntimeError(e2);
            }
          }
        }
        if (!retried && turns > 1 && (re.kind === 'transient' || re.kind === 'timeout' || re.kind === 'empty')) {
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
          if (turns > 1) re.partial = { input: Math.max(0, usage.input - usage.cached - usage.cacheWrite), output: usage.output, cacheRead: usage.cached, turns: turns - 1, toolCalls: records.length ? records : undefined, model: usedModel };
          throw re;
        }
        t = retried;
      }
      usage.input += t.input;
      usage.output += t.output;
      usage.cached += t.cached;
      usage.cacheWrite += t.cacheWrite;
      if (t.input > 500 && sentChars > 0) charsPerToken = Math.min(5, Math.max(1.5, sentChars / t.input));
      if (t.model) usedModel = t.model;
      finish = t.finish;
      if (t.toolCalls.length && useTools && turns <= maxTurns && !finalAsked) {
        if (t.text.trim()) narration += `${t.text.trim()}\n`;
        for (const c of t.toolCalls) c.name = toolName(c.name, policy!.allow);
        messages.push({ role: 'assistant', content: t.text || null, tool_calls: t.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
        for (const c of t.toolCalls) {
          let args: unknown = {};
          let parseErr = '';
          try {
            args = c.args ? JSON.parse(c.args) : {};
          } catch (e) {
            parseErr = `Tham số JSON không hợp lệ (${(e as Error).message}) — có thể do đầu ra bị cắt; hãy gửi lại với nội dung ngắn hơn hoặc chia nhỏ file.`;
          }
          const readKey = c.name === 'read_file' && !parseErr ? JSON.stringify(args) : '';
          const prevRead = readKey ? reads.get(readKey) : undefined;
          const dup = prevRead && prevRead.wroteAt === wrote && !String(prevRead.msg.content ?? '').includes(COMPACTED_MARK);
          const isRead = READ_TOOL_NAMES.has(c.name);
          const blocked = !parseErr && !dup && isRead && readLimit > 0 && readStreak >= readLimit * 2;
          const out = parseErr
            ? { ok: false, output: `LỖI: ${parseErr}`, ms: 0, summary: `${c.name} ✗ JSON lỗi` }
            : dup
              ? { ok: true, output: `(Đã đọc đúng nội dung này ở lượt ${prevRead!.turn} — vẫn còn nguyên ở trên và tệp chưa đổi; dùng lại, không đọc lại.)`, ms: 0, summary: `${c.name} (trùng lượt ${prevRead!.turn})` }
              : blocked
                ? { ok: false, output: `⛔ Từ chối: đã đọc/tìm ${readStreak} lần liên tiếp mà chưa ghi tệp nào. Ghi ngay phần đã đủ thông tin bằng write_file/edit_file (tệp/module mới, bản nháp tài liệu, hoặc một sửa đổi nhỏ) — ghi xong sẽ được đọc tiếp. Hạng mục quá lớn thì làm phần chính, ghi "Việc còn lại" trong bàn giao.`, ms: 0, summary: `${c.name} ⛔ (chưa ghi sau ${readStreak} lần đọc)` }
                : await executeTool(c.name, args, toolPol!, hooks.signal);
          if (blocked) readsBlocked++;
          else if (isRead && !dup && !parseErr) readStreak++;
          if ((c.name === 'write_file' || c.name === 'edit_file') && out.ok) {
            wrote++;
            readStreak = 0;
            streakNudged = false;
          }
          hooks.onActivity?.(out.summary);
          records.push({ name: c.name, args: argsSummary(c.name, args), ok: out.ok, ms: out.ms, outputChars: out.output.length, error: out.ok ? undefined : out.output.slice(0, 300) });
          // nội dung file/đầu ra lệnh đi ra nhà cung cấp bên ngoài → che bí mật (và PII với dữ liệu Bảo mật/Hạn chế)
          const toolMsg: ChatMsg = { role: 'tool', tool_call_id: c.id, content: req.redact ? redact(out.output, req.redact) : out.output };
          messages.push(toolMsg);
          if (readKey && !dup && out.ok) reads.set(readKey, { msg: toolMsg, turn: turns, wroteAt: wrote });
        }
        if (ctxBudget > 0) {
          const r = fitContext(messages, Math.floor(ctxBudget * charsPerToken));
          if (r) {
            fitted++;
            if (fitted <= 3 || r.over) diag.push(`lượt ${turns}: ngữ cảnh vượt ${ctxBudget} token — ${r.note}`);
          }
        } else compactHistory(messages);
        if (readLimit > 0 && readStreak >= readLimit && !streakNudged) {
          streakNudged = true;
          diag.push(`lượt ${turns}: ${readStreak} lần đọc/tìm liên tiếp chưa ghi — nhắc ghi${wrote ? '' : ' (chưa ghi tệp nào)'}`);
          messages.push({
            role: 'user',
            content: `⚠️ Bạn đã đọc/tìm ${readStreak} lần liên tiếp mà chưa ghi tệp nào${wrote ? ' kể từ lần ghi gần nhất' : ''}. Dựa vào những gì đã có, ghi ngay phần đủ thông tin (write_file/edit_file). Tới ${readLimit * 2} lần liên tiếp, công cụ đọc sẽ bị từ chối cho tới khi bạn ghi.`,
          });
        }
        if (policy!.expectWrites && !wrote && writeNudges < 2) {
          const frac = Math.max(turns / maxTurns, inputCap > 0 ? capUsed() / inputCap : 0);
          if (frac >= (writeNudges === 0 ? 0.35 : 0.65)) {
            writeNudges++;
            diag.push(`nhắc ghi tệp lần ${writeNudges} ở lượt ${turns} (chưa ghi tệp nào)`);
            messages.push({
              role: 'user',
              content:
                writeNudges === 1
                  ? `⚠️ Đã dùng ${Math.round(frac * 100)}% ngân sách công cụ của bước này mà CHƯA ghi tệp nào. Dừng khảo sát rộng: dựa trên những gì đã đọc, bắt đầu tạo/sửa tệp ngay ở lượt tới (write_file/edit_file), làm từng phần nhỏ; chỉ đọc thêm đúng đoạn cần để sửa.`
                  : `⛔ Đã dùng ${Math.round(frac * 100)}% ngân sách công cụ và vẫn chưa ghi tệp nào — nếu hết lượt mà không có thay đổi thì hạng mục thất bại. Ghi ngay phần đã đủ thông tin (vd. tạo module/tệp mới trước, nối vào tệp lớn sau).`,
            });
          }
        }
        const overBudget = inputCap > 0 && capUsed() >= inputCap;
        if (turns >= maxTurns || overBudget) {
          finalAsked = true;
          capped = overBudget ? 'input' : 'turns';
          diag.push(overBudget ? `chạm trần ${inputCap} token đầu vào của vòng lặp công cụ sau ${turns} lượt (${Math.round(usage.input)} token vào, ${usage.cached} từ cache tính ${cachedW * 100}%)` : `hết ${maxTurns} lượt công cụ`);
          messages.push({ role: 'user', content: `${overBudget ? 'Đã dùng hết ngân sách token cho công cụ ở bước này.' : 'Đã dùng hết số lượt công cụ cho bước này.'} KHÔNG gọi thêm công cụ — hãy viết ngay câu trả lời cuối cùng (sản phẩm bàn giao) theo đúng mẫu. ${CAP_STATUS_RULE}` });
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
      // chỉ suy nghĩ mà không trả lời (qwen3 qua Ollama đôi khi dồn cả câu trả lời vào phần suy nghĩ) → nhắc viết câu trả lời một lần
      if (!t.text.trim() && !t.toolCalls.length && t.reasoning > 0 && !thinkNudged) {
        thinkNudged = true;
        diag.push(`lượt ${turns}: chỉ có phần suy nghĩ (${t.reasoning} ký tự), không có câu trả lời — nhắc viết câu trả lời`);
        messages.push({ role: 'user', content: 'Bạn mới suy nghĩ mà CHƯA đưa ra câu trả lời. Viết ngay câu trả lời cuối theo đúng yêu cầu và mẫu (hoặc gọi công cụ nếu thật sự cần).' });
        continue;
      }
      // "báo đã tạo/sửa tệp" mà chưa gọi công cụ ghi nào (hay gặp ở model nhỏ) → nhắc một lần để ghi thật
      if (useTools && policy!.expectWrites && !wrote && !claimNudged && !finalAsked && turns < maxTurns && claimsWrites(t.text)) {
        claimNudged = true;
        diag.push(`lượt ${turns}: báo đã tạo/sửa tệp nhưng chưa gọi công cụ ghi — nhắc ghi thật`);
        messages.push({ role: 'assistant', content: t.text });
        messages.push({
          role: 'user',
          content: '⚠️ Bạn vừa báo đã tạo/sửa tệp nhưng CHƯA gọi write_file/edit_file lần nào — workspace chưa có thay đổi. Hãy gọi công cụ để ghi thật (đường dẫn tương đối trong workspace) rồi mới viết câu trả lời cuối. Nếu hạng mục không cần tệp, viết lại câu trả lời cuối và bỏ câu "đã tạo/sửa tệp".',
        });
        continue;
      }
      finalText = t.text;
      if (t.toolCalls.length && useTools && finalAsked) diag.push('đã yêu cầu viết câu trả lời cuối nhưng model vẫn gọi công cụ (bỏ qua)');
      if (!t.text.trim()) diag.push(`lượt cuối rỗng (finish=${t.finish ?? '?'}, ${t.events} sự kiện stream)`);
      break;
    }
    if (readsBlocked) diag.push(`từ chối ${readsBlocked} lần đọc/tìm vì đọc liên tiếp quá ${readLimit * 2} lần chưa ghi`);
    let text = finalText.trim();
    if (!text && narration.trim()) text = narration.trim();
    if (looksLikeLimitMessage(text)) throw new RuntimeError(`${this.base()}: ${text}`, 'quota', undefined, parseRetryAt(undefined, text));
    // nhà cung cấp trả 200 nhưng không có nội dung (vd. một số model qua proxy) → coi là lỗi để chuyển tài nguyên
    if (!text && !records.length) throw new RuntimeError(`${model}: phản hồi rỗng${diag.length ? ` (${diag.join('; ')})` : ''}`, 'empty');
    const estimated = usage.input === 0 && usage.output === 0;
    return {
      text,
      usage: {
        // prompt_tokens kiểu OpenAI gồm cả phần đọc/ghi cache → tách ra để khớp cách tính của Anthropic (input + cacheRead + cacheWrite)
        input: estimated ? estimateTokens(combinedPrompt(req)) : Math.max(0, usage.input - usage.cached - usage.cacheWrite),
        output: estimated ? estimateTokens(text) : usage.output,
        cacheRead: usage.cached,
        cacheWrite: usage.cacheWrite,
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
      capped,
    };
  }
}

/**
 * Tên công cụ model trả về → tên đã khai báo. 9router (đường Claude gốc /v1/messages, vd. qua Bifrost provider kiểu anthropic)
 * đổi tên công cụ thành "<tên>_ide" và không đổi lại trong câu trả lời.
 */
export function toolName(name: string, allow: readonly string[]): string {
  if (allow.includes(name)) return name;
  const base = name.replace(/_ide$/i, '');
  if (base !== name && allow.includes(base)) return base;
  const ci = allow.find((a) => a.toLowerCase() === base.toLowerCase());
  return ci ?? name;
}

/** Trường thêm vào thân yêu cầu theo runtime + pha (đặt trước model/messages/tools/stream nên không ghi đè được các trường đó). */
export function extraBodyFor(cfg: RuntimeConfig, phase: string): Record<string, unknown> {
  const base = cfg.extraBody && typeof cfg.extraBody === 'object' ? cfg.extraBody : {};
  const byPhase = cfg.extraBodyByPhase && typeof cfg.extraBodyByPhase === 'object' ? (cfg.extraBodyByPhase as Record<string, Record<string, unknown>>)[phase] : undefined;
  // có mục cho pha thì THAY extraBody (vd. execute: {} = bỏ reasoning_effort ở pha có công cụ)
  return byPhase && typeof byPhase === 'object' ? byPhase : base;
}

/** Câu trả lời tự nhận đã tạo/sửa tệp (có tên tệp) — dùng để bắt trường hợp "báo xong" mà chưa gọi công cụ ghi. */
export function claimsWrites(text: string): boolean {
  const t = text.normalize('NFC');
  if (!/(đã|Đã|ĐÃ)\s+(hoàn thành|tạo|viết|ghi|cập nhật|sửa|thêm|bổ sung)|\b(created|wrote|updated|added)\b/u.test(t)) return false;
  return /`[^`\s]+\.[A-Za-z0-9]{1,8}`|\b[\w./-]+\.(md|js|mjs|cjs|ts|tsx|json|py|sql|prisma|csv|txt|html|css|ya?ml|ps1|sh)\b/.test(t);
}

/** Chờ `ms` mili giây, dừng sớm (ném lỗi) nếu lượt gọi bị hủy. */
function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Đã hủy'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('Đã hủy'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Yêu cầu dòng trạng thái khi vòng công cụ bị dừng giữa chừng — điều phối viên dựa vào đây để cho chạy tiếp. */
export const CAP_STATUS_RULE =
  'Dòng ĐẦU TIÊN của câu trả lời phải là đúng một trong hai: "TRẠNG THÁI: XONG" (mọi tiêu chí hoàn thành của hạng mục đã đạt và đã ghi vào workspace) hoặc "TRẠNG THÁI: CHƯA XONG — <việc còn lại>". Sau đó ghi rõ đã làm gì (tệp đã sửa), việc còn dang dở và bước tiếp theo cụ thể để lần chạy sau làm tiếp mà không phải khảo sát lại.';

/** Câu trả lời sau khi chạm trần có tự nhận là đã xong không (thiếu dòng trạng thái ⇒ coi là chưa xong). */
export function cappedDone(text: string): boolean {
  const head = text.trim().split(/\r?\n/).slice(0, 3).join(' ').normalize('NFC');
  if (/TRẠNG THÁI:\s*CHƯA\s*XONG/iu.test(head)) return false;
  return /TRẠNG THÁI:\s*XONG\b/iu.test(head);
}

/**
 * Giữ lịch sử hội thoại công cụ gọn: kết quả công cụ cũ (trừ `keep` kết quả gần nhất) rút còn `max` ký tự, tham số write_file/edit_file cũ
 * (nội dung file đã nằm trên đĩa) cũng rút gọn. Mỗi lượt gửi lại toàn bộ lịch sử nên phần này quyết định chi phí token của vòng lặp.
 * Rút gọn THEO ĐỢT: chỉ khi phần cũ chưa rút gọn vượt `threshold` ký tự — giữa hai đợt, tiền tố hội thoại giữ nguyên nên
 * cache prompt của nhà cung cấp (tự động như OpenAI/Codex, hoặc cache_control với Claude) vẫn trúng.
 * Trả về true nếu đã rút gọn.
 */
const COMPACTED_MARK = 'kết quả cũ đã lược bớt';
const READ_TOOL_NAMES = new Set(['list_files', 'read_file', 'search']);

export function compactHistory(messages: ChatMsg[], keep = 3, max = 400, threshold = 40_000): boolean {
  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const older = toolIdx.slice(0, Math.max(0, toolIdx.length - keep)).filter((i) => String(messages[i].content ?? '').length > max + 80);
  const calls = (i: number) => (messages[i].tool_calls as Array<{ function: { name: string; arguments: string } }> | undefined) ?? [];
  const asst = messages.map((x, i) => (x.role === 'assistant' && Array.isArray(x.tool_calls) ? i : -1)).filter((i) => i >= 0);
  const bigArgs = asst.slice(0, Math.max(0, asst.length - 2)).filter((i) => calls(i).some((tc) => tc.function.arguments.length > 2000));
  const pending =
    older.reduce((n, i) => n + String(messages[i].content ?? '').length, 0) + bigArgs.reduce((n, i) => n + calls(i).reduce((k, tc) => k + tc.function.arguments.length, 0), 0);
  if (pending < threshold) return false;
  for (const i of older) {
    const c = String(messages[i].content ?? '');
    messages[i].content = `${c.slice(0, max)}\n… [${COMPACTED_MARK} — gọi lại công cụ nếu cần]`;
  }
  for (const i of bigArgs) {
    for (const tc of calls(i)) {
      if (tc.function.arguments.length <= 2000) continue;
      try {
        const a = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        for (const k of ['content', 'new_string', 'old_string']) if (typeof a[k] === 'string' && (a[k] as string).length > 400) a[k] = `${(a[k] as string).slice(0, 400)}… [đã ghi ra file]`;
        tc.function.arguments = JSON.stringify(a);
      } catch {
        tc.function.arguments = tc.function.arguments.slice(0, 2000);
      }
    }
  }
  return true;
}

/** Tổng ký tự của lịch sử hội thoại (nội dung + tham số công cụ) — dùng ước lượng token mỗi lượt. */
export function historyChars(messages: ChatMsg[]): number {
  let n = 0;
  for (const m of messages) {
    n += typeof m.content === 'string' ? m.content.length : 0;
    for (const tc of (m.tool_calls as Array<{ function: { arguments: string } }> | undefined) ?? []) n += tc.function.arguments.length + 40;
  }
  return n;
}

/**
 * Trần token mỗi lượt của vòng công cụ: `toolContextTokens` và/hoặc (cửa sổ model − phần chừa cho đầu ra − 1.024).
 * 0 = không đặt (giữ cách rút gọn theo đợt để giữ cache prompt).
 */
export function toolContextBudget(cfg: Pick<RuntimeConfig, 'toolContextTokens' | 'contextWindow'>, maxOut: number): number {
  const caps: number[] = [];
  if (Number(cfg.toolContextTokens) > 0) caps.push(Number(cfg.toolContextTokens));
  if (Number(cfg.contextWindow) > 0) {
    // chừa chỗ cho đầu ra: max_tokens của pha nhưng không quá 1/4 cửa sổ (pha thực thi đặt 32k — lượt công cụ thực tế sinh ít hơn nhiều)
    const win = Number(cfg.contextWindow);
    caps.push(Math.max(2048, win - Math.min(maxOut, Math.floor(win / 4)) - 1024));
  }
  return caps.length ? Math.min(...caps) : 0;
}

/**
 * Đưa lịch sử về dưới `maxChars` (≈ ngân sách token × ký tự/token): rút gọn kết quả công cụ cũ (giữ 2, rồi 1 gần nhất),
 * cuối cùng cắt bớt kết quả mới nhất. Trả về null nếu không cần làm gì; `over` = phần nền (hồ sơ + đề bài) đã vượt ngân sách.
 */
export function fitContext(messages: ChatMsg[], maxChars: number): { note: string; over: boolean } | null {
  if (historyChars(messages) <= maxChars) return null;
  const steps: string[] = [];
  compactHistory(messages, 2, 300, 0);
  steps.push('lược kết quả cũ (giữ 2)');
  if (historyChars(messages) > maxChars) {
    compactHistory(messages, 1, 200, 0);
    steps.push('giữ 1');
  }
  let size = historyChars(messages);
  if (size > maxChars) {
    // cắt kết quả công cụ còn nguyên, cũ trước
    for (const m of messages) {
      if (size <= maxChars) break;
      if (m.role !== 'tool' || typeof m.content !== 'string' || m.content.includes(COMPACTED_MARK)) continue;
      const keep = Math.max(400, m.content.length - (size - maxChars));
      if (keep >= m.content.length) continue;
      size -= m.content.length - keep;
      m.content = `${m.content.slice(0, keep)}\n… [${COMPACTED_MARK}: cắt để vừa ngữ cảnh model — đọc đoạn nhỏ hơn bằng offset/limit]`;
      steps.push('cắt kết quả mới nhất');
    }
  }
  const over = historyChars(messages) > maxChars;
  if (over) steps.push('phần nền vẫn vượt ngân sách');
  return { note: steps.join(' → '), over };
}

/** Model này có được gắn cache_control (cache prompt kiểu Anthropic) không. */
export function wantsCacheControl(cfg: RuntimeConfig, model: string): boolean {
  const c = cfg.cacheControl;
  if (!c) return false;
  if (c === true) return /claude/i.test(model);
  try {
    return new RegExp(String(c), 'i').test(model);
  } catch {
    return false;
  }
}

const EPHEMERAL = { type: 'ephemeral' } as const;
const part = (text: string, cache = false) => (cache ? { type: 'text', text, cache_control: EPHEMERAL } : { type: 'text', text });

/**
 * Bản sao tin nhắn kèm điểm cache (tối đa 3): hồ sơ vị trí (system), bối cảnh nhiệm vụ (đầu tin nhắn user đầu tiên)
 * và tin nhắn cuối cùng (kết quả công cụ mới nhất) — lượt sau đọc lại toàn bộ lịch sử từ cache thay vì tính đủ giá.
 */
export function withCacheMarks(messages: ChatMsg[], req: Pick<RunRequest, 'context' | 'prompt'>, combined: boolean): ChatMsg[] {
  const out = messages.map((x) => ({ ...x }));
  const first = out.findIndex((x) => x.role === 'user');
  for (let i = 0; i < out.length; i++) {
    const msg = out[i];
    if (typeof msg.content !== 'string' || !msg.content) continue;
    const text = msg.content;
    if (msg.role === 'system') msg.content = [part(text, true)];
    else if (i === first) {
      // phần tĩnh (bối cảnh, + hồ sơ với kiểu "combined") có điểm cache riêng; phần việc của lượt gọi đi sau
      const staticLen = combined ? (text.endsWith(req.prompt) ? text.length - req.prompt.length : 0) : req.context && text.startsWith(req.context) ? req.context.length : 0;
      msg.content = staticLen > 1000 && staticLen < text.length ? [part(text.slice(0, staticLen), true), part(text.slice(staticLen))] : [part(text, i === out.length - 1)];
    }
  }
  // điểm cache di động: kết quả công cụ mới nhất (kể cả khi sau nó còn lời nhắc user — qua Bifrost → Claude, điểm cache trên tin
  // nhắn user bị bỏ qua, trên tin nhắn tool thì giữ); chưa có kết quả công cụ thì đặt ở tin nhắn cuối. Tổng ≤ 3 điểm (Anthropic cho tối đa 4).
  let mv = -1;
  for (let i = out.length - 1; i > first; i--) if (out[i].role === 'tool') {
    mv = i;
    break;
  }
  if (mv < 0 && out.length - 1 > first && out[out.length - 1].role === 'user') mv = out.length - 1;
  if (mv > first && typeof out[mv].content === 'string' && out[mv].content) out[mv].content = [part(String(out[mv].content), true)];
  return out;
}
