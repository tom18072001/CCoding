import type { Config } from '../config.js';
import type { Classification, RunResult, Runtime, RuntimeAvailability } from '../types.js';
import { AnthropicApiRuntime, OpenAiApiRuntime } from './api.js';
import { ClaudeCliRuntime } from './claude-cli.js';
import { CodexCliRuntime, KimiCliRuntime } from './cli-agents.js';
import { MockRuntime } from './mock.js';

export interface RuntimeStatus extends RuntimeAvailability {
  id: string;
  label: string;
  local: boolean;
  supportsTools: boolean;
}

export interface Resolution {
  runtime: Runtime;
  note?: string;
}

/** Quản lý các runtime (CLI agent, API, mock) + chọn runtime theo cấu hình và phân loại dữ liệu. */
export class RuntimeManager {
  readonly runtimes = new Map<string, Runtime>();
  private cache = new Map<string, { at: number; res: RuntimeAvailability }>();

  constructor(private config: Config) {
    const rc = (id: string) => config.runtimes[id] ?? {};
    const mm = (id: string) => config.models[id] ?? {};
    const all: Runtime[] = [
      new ClaudeCliRuntime(rc('claude-cli'), mm('claude-cli')),
      new CodexCliRuntime(rc('codex-cli'), mm('codex-cli')),
      new KimiCliRuntime(rc('kimi-cli'), mm('kimi-cli')),
      new AnthropicApiRuntime(rc('anthropic-api'), mm('anthropic-api')),
      new OpenAiApiRuntime(rc('openai-api'), mm('openai-api')),
      new MockRuntime(rc('mock')),
    ];
    for (const r of all) this.runtimes.set(r.id, r);
    // Runtime tùy biến khai báo trong cấu hình, ví dụ "bifrost", "ollama", "litellm": { "type": "openai-api", … }
    for (const [id, c] of Object.entries(config.runtimes)) {
      if (this.runtimes.has(id) || !c || c.type !== 'openai-api') continue;
      this.runtimes.set(id, new OpenAiApiRuntime(c, mm(id), id));
    }
  }

  get(id: string): Runtime | undefined {
    return this.runtimes.get(id);
  }

  register(r: Runtime): void {
    this.runtimes.set(r.id, r);
    this.cache.delete(r.id);
  }

  async availability(id: string, force = false): Promise<RuntimeAvailability> {
    const r = this.runtimes.get(id);
    if (!r) return { ok: false, detail: 'runtime không tồn tại' };
    const hit = this.cache.get(id);
    if (!force && hit && Date.now() - hit.at < 60_000) return hit.res;
    let res: RuntimeAvailability;
    try {
      res = await r.available();
    } catch (e) {
      res = { ok: false, detail: (e as Error).message };
    }
    this.cache.set(id, { at: Date.now(), res });
    return res;
  }

  async status(force = false): Promise<RuntimeStatus[]> {
    return Promise.all(
      [...this.runtimes.values()].map(async (r) => ({
        id: r.id,
        label: r.label,
        local: r.local,
        supportsTools: r.supportsTools,
        ...(await this.availability(r.id, force)),
      })),
    );
  }

  /** Runtime có được phép xử lý dữ liệu ở mức phân loại này không (Data Protection Gate). */
  allowed(id: string, cls: Classification): boolean {
    const r = this.runtimes.get(id);
    if (!r) return false;
    const rules = this.config.dataProtection.allowedRuntimes[cls] ?? ['local'];
    return rules.some((x) => x === '*' || x === id || (x === 'local' && r.local));
  }

  /**
   * Chọn runtime theo chuỗi ưu tiên (task → dự án → agent → mặc định).
   * Runtime được chỉ định nhưng không sẵn sàng/không được phép → rơi về chế độ auto, kèm ghi chú.
   */
  async resolve(chain: Array<string | undefined>, cls: Classification): Promise<Resolution> {
    const notes: string[] = [];
    for (const want of chain) {
      if (!want || want === 'inherit') continue;
      if (want === 'auto') break;
      if (!this.runtimes.has(want)) {
        notes.push(`runtime "${want}" không tồn tại`);
        break;
      }
      if (!this.allowed(want, cls)) {
        notes.push(`runtime "${want}" bị chặn với dữ liệu "${cls}"`);
        break;
      }
      const a = await this.availability(want);
      if (a.ok) return { runtime: this.runtimes.get(want)!, note: notes.join('; ') || undefined };
      notes.push(`runtime "${want}" chưa sẵn sàng (${a.detail})`);
      break;
    }
    for (const id of this.config.runtime.order) {
      if (!this.allowed(id, cls)) continue;
      const a = await this.availability(id);
      if (a.ok) return { runtime: this.runtimes.get(id)!, note: notes.length ? `${notes.join('; ')} → dùng ${id}` : undefined };
    }
    const mock = this.runtimes.get('mock')!;
    return { runtime: mock, note: `${notes.concat('không có runtime thật khả dụng').join('; ')} → dùng mock` };
  }

  /** Tính chi phí theo bảng giá cấu hình khi runtime không tự báo (USD / 1 triệu token). */
  applyPricing(res: RunResult): RunResult {
    if (res.usage.costUsd > 0 || res.runtime === 'mock') return res;
    const p = this.config.pricing[res.model];
    if (!p) return res;
    const cost =
      (res.usage.input * p.input + res.usage.output * p.output + res.usage.cacheRead * (p.cacheRead ?? p.input * 0.1) + res.usage.cacheWrite * (p.cacheWrite ?? p.input * 1.25)) /
      1e6;
    return { ...res, usage: { ...res.usage, costUsd: cost } };
  }
}
