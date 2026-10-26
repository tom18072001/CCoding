import { quickRun, runProcess } from './spawn.js';
import { estimateTokens } from '../util/tokens.js';
import { combinedPrompt } from './common.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Bóc tách luồng stream-json của `claude -p --output-format stream-json --verbose`. */
export class ClaudeStreamParser {
  text = '';
  resultText?: string;
  usage: ClaudeUsage = {};
  turnUsage: ClaudeUsage = {};
  costUsd = 0;
  model = '';
  isError = false;
  errorText = '';
  sawResult = false;

  constructor(private hooks: RunHooks = {}) {}

  feed(line: string): void {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    switch (ev.type) {
      case 'system':
        if (ev.model) this.model = ev.model;
        break;
      case 'assistant': {
        const msg = ev.message ?? {};
        if (msg.model) this.model = msg.model;
        for (const block of msg.content ?? []) {
          if (block.type === 'text' && block.text) {
            this.text += (this.text ? '\n' : '') + block.text;
            this.hooks.onText?.(block.text);
          } else if (block.type === 'tool_use') {
            const inp = block.input ?? {};
            const detail = inp.command ?? inp.file_path ?? inp.pattern ?? inp.url ?? inp.query ?? '';
            this.hooks.onActivity?.(`${block.name}${detail ? `: ${String(detail).slice(0, 60)}` : ''}`);
          }
        }
        const u = msg.usage as ClaudeUsage | undefined;
        if (u) {
          // cộng dồn theo từng lượt — dự phòng khi không có sự kiện result
          for (const k of Object.keys(u) as Array<keyof ClaudeUsage>) {
            if (typeof u[k] === 'number') this.turnUsage[k] = (this.turnUsage[k] ?? 0) + (u[k] as number);
          }
        }
        break;
      }
      case 'result':
        this.sawResult = true;
        if (typeof ev.result === 'string') this.resultText = ev.result;
        if (ev.usage) this.usage = ev.usage;
        if (typeof ev.total_cost_usd === 'number') this.costUsd = ev.total_cost_usd;
        if (ev.modelUsage && typeof ev.modelUsage === 'object') {
          const names = Object.keys(ev.modelUsage);
          if (names.length) this.model = names.join('+');
        }
        if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) {
          this.isError = true;
          this.errorText = String(ev.result ?? ev.subtype ?? 'lỗi không rõ');
        }
        break;
    }
  }

  finalUsage(): ClaudeUsage {
    return this.sawResult && Object.keys(this.usage).length ? this.usage : this.turnUsage;
  }
}

export class ClaudeCliRuntime implements Runtime {
  id = 'claude-cli';
  label = 'Claude Code CLI';
  local = false;
  supportsTools = true;

  constructor(private cfg: RuntimeConfig, private models: Record<string, string>) {}

  async available(): Promise<RuntimeAvailability> {
    const r = await quickRun(this.cfg.command ?? 'claude', ['--version']);
    return { ok: r.ok, detail: r.ok ? r.out.split('\n')[0] : `không tìm thấy (${r.out.slice(0, 80)})` };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const model = this.models[req.model] ?? req.model;
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--no-session-persistence'];
    if (req.allowTools && req.tools.length) {
      args.push('--tools', req.tools.join(','), '--permission-mode', this.cfg.permissionMode ?? 'acceptEdits');
    } else {
      args.push('--tools', '');
    }
    args.push(...(this.cfg.extraArgs ?? []));

    const prompt = combinedPrompt(req);
    const parser = new ClaudeStreamParser(hooks);
    const proc = await runProcess({
      cmd: this.cfg.command ?? 'claude',
      args,
      cwd: req.cwd,
      stdin: prompt,
      timeoutMs: req.timeoutMs,
      signal: hooks.signal,
      onLine: (l) => parser.feed(l),
    });
    const text = (parser.resultText ?? parser.text).trim();
    const u = parser.finalUsage();
    const estimated = !u.input_tokens && !u.output_tokens;
    let error: string | undefined;
    if (proc.timedOut) error = `Hết thời gian (${Math.round(req.timeoutMs / 1000)}s)`;
    else if (proc.aborted) error = 'Đã hủy';
    else if (parser.isError) error = parser.errorText;
    else if (proc.code !== 0 && !text) error = `claude thoát mã ${proc.code}: ${proc.stderr.slice(-400)}`;
    return {
      text,
      usage: {
        input: estimated ? estimateTokens(prompt) : u.input_tokens ?? 0,
        output: estimated ? estimateTokens(text) : u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        costUsd: parser.costUsd,
      },
      estimated,
      model: parser.model || model,
      runtime: this.id,
      durationMs: Date.now() - started,
      error,
    };
  }
}
