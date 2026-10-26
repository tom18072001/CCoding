import path from 'node:path';
import { quickRun, runProcess } from './spawn.js';
import { estimateTokens } from '../util/tokens.js';
import { writeText } from '../util/fsx.js';
import { combinedPrompt } from './common.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';

/** Prompt quá dài để truyền qua tham số dòng lệnh → ghi ra file trong workspace và dẫn agent đọc file. */
function promptAsArg(req: RunRequest, limit = 20000): string {
  const full = combinedPrompt(req);
  if (full.length <= limit) return full;
  const rel = path.join('.ccoding', 'prompts', `${req.meta.callId}.md`);
  writeText(path.join(req.cwd, rel), full);
  return `Đọc KỸ và thực hiện ĐẦY ĐỦ yêu cầu trong file ${rel.replace(/\\/g, '/')} (nằm trong thư mục làm việc hiện tại). Câu trả lời cuối cùng của bạn phải chứa toàn bộ sản phẩm theo đúng định dạng được yêu cầu trong file đó.`;
}

// ── Codex CLI ────────────────────────────────────────────────────────────────

export class CodexParser {
  messages: string[] = [];
  input = 0;
  cached = 0;
  output = 0;
  error = '';
  constructor(private hooks: RunHooks = {}) {}

  feed(line: string): void {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const item = ev.item ?? {};
    if (ev.type === 'item.completed' && item.type === 'agent_message' && item.text) {
      this.messages.push(item.text);
      this.hooks.onText?.(item.text);
    } else if ((ev.type === 'item.started' || ev.type === 'item.completed') && item.type === 'command_execution') {
      if (ev.type === 'item.started') this.hooks.onActivity?.(`Bash: ${String(item.command ?? '').slice(0, 60)}`);
    } else if (ev.type === 'item.completed' && item.type === 'file_change') {
      this.hooks.onActivity?.('Ghi file');
    } else if (ev.type === 'turn.completed' && ev.usage) {
      this.input += ev.usage.input_tokens ?? 0;
      this.cached += ev.usage.cached_input_tokens ?? 0;
      this.output += ev.usage.output_tokens ?? 0;
    } else if (ev.type === 'turn.failed' || ev.type === 'error') {
      this.error = String(ev.error?.message ?? ev.message ?? 'lỗi codex');
    } else if (ev.msg) {
      // định dạng cũ của codex exec --json
      const m = ev.msg;
      if (m.type === 'agent_message' && m.message) this.messages.push(m.message);
      if (m.type === 'token_count' && m.info?.total_token_usage) {
        const t = m.info.total_token_usage;
        this.input = t.input_tokens ?? this.input;
        this.cached = t.cached_input_tokens ?? this.cached;
        this.output = t.output_tokens ?? this.output;
      }
    }
  }
}

export class CodexCliRuntime implements Runtime {
  id = 'codex-cli';
  label = 'OpenAI Codex CLI';
  local = false;
  supportsTools = true;
  constructor(private cfg: RuntimeConfig, private models: Record<string, string>) {}

  async available(): Promise<RuntimeAvailability> {
    const r = await quickRun(this.cfg.command ?? 'codex', ['--version']);
    return { ok: r.ok, detail: r.ok ? r.out.split('\n')[0] : 'không tìm thấy codex' };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const model = this.models[req.model];
    const sandbox = req.allowTools ? this.cfg.sandbox ?? 'workspace-write' : 'read-only';
    const args = ['exec', '--json', '--skip-git-repo-check', '--sandbox', sandbox];
    if (model) args.push('-m', model);
    args.push(...(this.cfg.extraArgs ?? []), '-');
    const prompt = combinedPrompt(req);
    const p = new CodexParser(hooks);
    const proc = await runProcess({
      cmd: this.cfg.command ?? 'codex',
      args,
      cwd: req.cwd,
      stdin: prompt,
      timeoutMs: req.timeoutMs,
      signal: hooks.signal,
      onLine: (l) => p.feed(l),
    });
    const text = (p.messages.at(-1) ?? '').trim();
    const estimated = p.input === 0 && p.output === 0;
    return {
      text,
      usage: {
        input: estimated ? estimateTokens(prompt) : Math.max(0, p.input - p.cached),
        output: estimated ? estimateTokens(text) : p.output,
        cacheRead: p.cached,
        cacheWrite: 0,
        costUsd: 0,
      },
      estimated,
      model: model || 'codex-default',
      runtime: this.id,
      durationMs: Date.now() - started,
      error: proc.timedOut ? 'Hết thời gian' : proc.aborted ? 'Đã hủy' : p.error || (proc.code !== 0 && !text ? proc.stderr.slice(-400) : undefined),
    };
  }
}

// ── Kimi Code CLI (và các CLI stream-json tổng quát) ───────────────────────────

export class GenericJsonParser {
  messages: string[] = [];
  input = 0;
  output = 0;
  constructor(private hooks: RunHooks = {}) {}

  private textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content))
      return content
        .map((b) => (typeof b === 'string' ? b : b && (b as any).type === 'text' ? String((b as any).text ?? '') : ''))
        .join('');
    return '';
  }

  feed(line: string): void {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const msg = ev.message && typeof ev.message === 'object' ? ev.message : ev;
    const role = msg.role ?? (ev.type === 'assistant' ? 'assistant' : undefined);
    if (role === 'assistant') {
      const t = this.textOf(msg.content).trim();
      if (t) {
        this.messages.push(t);
        this.hooks.onText?.(t);
      }
      for (const tc of msg.tool_calls ?? []) this.hooks.onActivity?.(String(tc.function?.name ?? tc.name ?? 'tool'));
    }
    const u = ev.usage ?? msg.usage;
    if (u) {
      this.input += u.input_tokens ?? u.prompt_tokens ?? 0;
      this.output += u.output_tokens ?? u.completion_tokens ?? 0;
    }
  }
}

export class KimiCliRuntime implements Runtime {
  id = 'kimi-cli';
  label = 'Kimi Code CLI';
  local = false;
  supportsTools = true;
  constructor(private cfg: RuntimeConfig, private models: Record<string, string>) {}

  async available(): Promise<RuntimeAvailability> {
    const r = await quickRun(this.cfg.command ?? 'kimi', ['--version']);
    return { ok: r.ok, detail: r.ok ? r.out.split('\n')[0] : 'không tìm thấy kimi' };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const model = this.models[req.model];
    const args = ['-p', promptAsArg(req), '--output-format', 'stream-json'];
    if (model) args.push('-m', model);
    args.push(...(this.cfg.extraArgs ?? []));
    const p = new GenericJsonParser(hooks);
    const proc = await runProcess({
      cmd: this.cfg.command ?? 'kimi',
      args,
      cwd: req.cwd,
      timeoutMs: req.timeoutMs,
      signal: hooks.signal,
      onLine: (l) => p.feed(l),
    });
    // Không có stream-json hợp lệ → dùng stdout thô
    const text = (p.messages.at(-1) ?? (p.messages.length ? '' : proc.stdout)).trim();
    const estimated = p.input === 0 && p.output === 0;
    return {
      text,
      usage: {
        input: estimated ? estimateTokens(combinedPrompt(req)) : p.input,
        output: estimated ? estimateTokens(p.messages.join('\n') || text) : p.output,
        cacheRead: 0,
        cacheWrite: 0,
        costUsd: 0,
      },
      estimated,
      model: model || 'kimi-default',
      runtime: this.id,
      durationMs: Date.now() - started,
      error: proc.timedOut ? 'Hết thời gian' : proc.aborted ? 'Đã hủy' : proc.code !== 0 && !text ? proc.stderr.slice(-400) : undefined,
    };
  }
}
