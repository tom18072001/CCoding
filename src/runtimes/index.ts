import { firstModels, modelChain, type Config, type ModelEntry } from '../config.js';
import type { Classification, ErrorKind, RateLimitInfo, RunResult, Runtime, RuntimeAvailability } from '../types.js';
import { AnthropicApiRuntime, OpenAiApiRuntime } from './api.js';
import { ClaudeCliRuntime } from './claude-cli.js';
import { CodexCliRuntime, KimiCliRuntime } from './cli-agents.js';
import { MockRuntime } from './mock.js';

export interface HealthInfo {
  /** Tạm ngừng dùng tới thời điểm này (ms epoch). */
  until?: number;
  kind?: ErrorKind;
  reason?: string;
  failures: number;
  /** Bắt đầu chuỗi lỗi liên tiếp hiện tại (ms epoch) — xóa khi gọi thành công lại. */
  since?: number;
  lastError?: string;
  lastErrorAt?: number;
  lastOkAt?: number;
}

export interface QuotaRow {
  id: string;
  label: string;
  local: boolean;
  disabled: boolean;
  inOrder: boolean;
  /** Runtime API đọc được header giới hạn của nhà cung cấp (runtime CLI thì không). */
  tracksLimits: boolean;
  keyEnv?: string;
  keySet?: boolean;
  usedToday: number;
  dailyTokenLimit?: number;
  remaining?: number;
  health?: HealthInfo;
  models: Array<{ model: string; alias?: string; usedToday: number; dailyTokenLimit?: number; remaining?: number; health?: HealthInfo; rateLimit?: RateLimitInfo }>;
}

export interface RuntimeStatus extends RuntimeAvailability {
  id: string;
  label: string;
  local: boolean;
  supportsTools: boolean;
  health?: HealthInfo;
  usageToday?: number;
  dailyTokenLimit?: number;
  models?: string[];
  chains?: Record<string, Array<{ model: string; dailyTokenLimit?: number; usageToday: number; health?: HealthInfo }>>;
}

export interface Resolution {
  runtime: Runtime;
  note?: string;
}

/** Một tài nguyên cụ thể để thử: runtime + model (id thật hoặc bí danh với runtime CLI). */
export interface Candidate {
  runtime: Runtime;
  model: string;
  /** Khóa theo dõi sức khỏe/hạn mức: "<runtime>::<model>". */
  key: string;
  label: string;
}

export class NoCapacityError extends Error {
  constructor(message: string, public retryAt?: number) {
    super(message);
  }
}

/** Nguồn số token đã dùng hôm nay (từ sổ cái) — được gắn sau khi dựng app. */
export type UsageSource = (runtime: string, model?: string) => number;

const ALIASES = ['opus', 'sonnet', 'haiku'];

/** Quản lý các runtime (CLI agent, API, mock) + chọn tài nguyên theo cấu hình, phân loại dữ liệu, quota và sức khỏe. */
export class RuntimeManager {
  readonly runtimes = new Map<string, Runtime>();
  private cache = new Map<string, { at: number; res: RuntimeAvailability }>();
  readonly health = new Map<string, HealthInfo>();
  private usageSource?: UsageSource;
  onChange?: (id: string) => void;

  constructor(private config: Config) {
    const rc = (id: string) => config.runtimes[id] ?? {};
    const mm = (id: string) => firstModels(config.models[id]);
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

  setUsageSource(fn: UsageSource): void {
    this.usageSource = fn;
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
    if (this.config.runtimes[id]?.disabled === true) return { ok: false, detail: 'đã tắt trong cấu hình (disabled)' };
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

  /**
   * Hạn mức & token còn lại theo runtime/model: dùng hôm nay (sổ cái CCoding) so với `dailyTokenLimit`, cộng header
   * giới hạn của nhà cung cấp ở lượt gọi gần nhất. Không trả khóa — chỉ tên biến môi trường và đã đặt hay chưa.
   */
  quota(): QuotaRow[] {
    return [...this.runtimes.values()].map((r) => {
      const cfg = this.config.runtimes[r.id] ?? {};
      const keyEnv = cfg.apiKeyEnv ? String(cfg.apiKeyEnv) : undefined;
      const limit = Number(cfg.dailyTokenLimit ?? 0) || undefined;
      const used = this.usageToday(r.id);
      const seen = new Set<string>();
      const models: QuotaRow['models'] = [];
      for (const [alias, spec] of Object.entries(this.config.models[r.id] ?? {}))
        for (const e of modelChain(spec)) {
          if (seen.has(e.model)) continue;
          seen.add(e.model);
          const u = this.usageToday(r.id, e.model);
          models.push({ model: e.model, alias, usedToday: u, dailyTokenLimit: e.dailyTokenLimit, remaining: e.dailyTokenLimit ? Math.max(0, e.dailyTokenLimit - u) : undefined, health: this.health.get(`${r.id}::${e.model}`), rateLimit: r.rateLimits?.get(e.model) });
        }
      for (const [m, info] of r.rateLimits ?? []) if (!seen.has(m)) models.push({ model: m, usedToday: this.usageToday(r.id, m), rateLimit: info });
      return {
        id: r.id,
        label: r.label,
        local: r.local,
        disabled: cfg.disabled === true,
        inOrder: this.config.runtime.order.includes(r.id),
        tracksLimits: !!r.rateLimits,
        keyEnv,
        keySet: keyEnv ? !!process.env[keyEnv] : undefined,
        usedToday: used,
        dailyTokenLimit: limit,
        remaining: limit ? Math.max(0, limit - used) : undefined,
        health: this.health.get(r.id),
        models,
      };
    });
  }

  /** Chuỗi model (theo thứ tự ưu tiên) của một runtime cho bí danh/model đã yêu cầu. */
  chainFor(runtimeId: string, want: string): ModelEntry[] {
    const map = this.config.models[runtimeId] ?? {};
    const chain = modelChain(map[want]);
    if (chain.length) return chain;
    // runtime CLI/mock tự ánh xạ bí danh; model id đầy đủ được dùng nguyên
    return [{ model: want }];
  }

  private usageToday(runtime: string, model?: string): number {
    return this.usageSource ? this.usageSource(runtime, model) : 0;
  }

  /** Lý do tài nguyên đang không dùng được (hết quota / cooldown / chạm hạn mức ngày) — undefined nếu dùng được. */
  blocked(runtimeId: string, entry?: ModelEntry): string | undefined {
    const now = Date.now();
    for (const key of [runtimeId, entry ? `${runtimeId}::${entry.model}` : '']) {
      if (!key) continue;
      const h = this.health.get(key);
      if (h?.until && h.until > now) return `${key} tạm ngừng tới ${new Date(h.until).toLocaleTimeString('vi-VN')} (${h.reason ?? h.kind})`;
    }
    const rl = Number(this.config.runtimes[runtimeId]?.dailyTokenLimit ?? 0);
    if (rl > 0) {
      const used = this.usageToday(runtimeId);
      if (used >= rl) return `${runtimeId} đã dùng ${used} / ${rl} token hôm nay`;
    }
    if (entry?.dailyTokenLimit) {
      const used = this.usageToday(runtimeId, entry.model);
      if (used >= entry.dailyTokenLimit) return `${entry.model} đã dùng ${used} / ${entry.dailyTokenLimit} token hôm nay`;
    }
    return undefined;
  }

  /** Thời điểm sớm nhất một tài nguyên đang bị chặn mở lại. */
  earliestRecovery(): number | undefined {
    const now = Date.now();
    const times = [...this.health.values()].map((h) => h.until ?? 0).filter((t) => t > now);
    return times.length ? Math.min(...times) : undefined;
  }

  markOk(key: string): void {
    const h = this.health.get(key);
    if (!h) return;
    h.failures = 0;
    h.until = undefined;
    h.since = undefined;
    h.lastOkAt = Date.now();
    const rt = key.split('::')[0];
    if (rt !== key) {
      const rh = this.health.get(rt);
      if (rh) {
        rh.failures = 0;
        rh.until = undefined;
        rh.since = undefined;
        rh.lastOkAt = Date.now();
      }
    }
    this.onChange?.(rt);
  }

  /**
   * Ghi nhận lỗi và quyết định thời gian nghỉ:
   * quota → tới lúc nhà cung cấp mở lại (hoặc quotaCooldownMs) · rate → 1 phút · lỗi mạng/timeout → nghỉ 2 phút từ lần thứ 2 liên tiếp ·
   * auth → 30 phút · model không tồn tại → 6 giờ (chỉ model đó).
   */
  markFailure(runtimeId: string, model: string | undefined, kind: ErrorKind, message: string, retryAt?: number): HealthInfo {
    const now = Date.now();
    const scopeModel = kind === 'quota' || kind === 'rate' || kind === 'model' || kind === 'context' || kind === 'empty';
    // lỗi quota/model gắn với model cụ thể; lỗi mạng/xác thực gắn với cả runtime
    const key = scopeModel && model ? `${runtimeId}::${model}` : runtimeId;
    const h = this.health.get(key) ?? { failures: 0 };
    if (!h.failures || !h.since) h.since = now;
    h.failures++;
    h.kind = kind;
    h.lastError = message.slice(0, 300);
    h.lastErrorAt = now;
    let until: number | undefined;
    switch (kind) {
      case 'quota':
        until = retryAt && retryAt > now ? retryAt : now + this.config.runtime.quotaCooldownMs;
        h.reason = 'hết hạn mức';
        break;
      case 'rate':
        until = retryAt && retryAt > now ? Math.min(retryAt, now + 15 * 60_000) : now + 60_000 * Math.min(5, h.failures);
        h.reason = 'giới hạn tốc độ';
        break;
      case 'auth':
        until = now + 30 * 60_000;
        h.reason = 'lỗi xác thực/khóa';
        break;
      case 'model':
        until = now + 6 * 3_600_000;
        h.reason = 'model không dùng được';
        break;
      case 'empty':
        until = h.failures >= 2 ? now + 10 * 60_000 : undefined;
        h.reason = 'phản hồi rỗng';
        break;
      case 'transient':
      case 'timeout':
        until = h.failures >= 2 ? now + 2 * 60_000 * Math.min(5, h.failures - 1) : undefined;
        h.reason = kind === 'timeout' ? 'quá thời gian' : 'lỗi kết nối';
        break;
      default:
        h.reason = 'lỗi';
    }
    h.until = until;
    this.health.set(key, h);
    if (kind === 'transient' || kind === 'auth') this.cache.delete(runtimeId);
    this.onChange?.(runtimeId);
    return h;
  }

  async status(force = false): Promise<RuntimeStatus[]> {
    return Promise.all(
      [...this.runtimes.values()].map(async (r) => {
        const chains: RuntimeStatus['chains'] = {};
        for (const [alias, spec] of Object.entries(this.config.models[r.id] ?? {})) {
          const list = modelChain(spec);
          if (list.length > 1 || list.some((e) => e.dailyTokenLimit))
            chains[alias] = list.map((e) => ({ model: e.model, dailyTokenLimit: e.dailyTokenLimit, usageToday: this.usageToday(r.id, e.model), health: this.health.get(`${r.id}::${e.model}`) }));
        }
        const modelHealth = [...this.health.entries()].filter(([k]) => k.startsWith(`${r.id}::`));
        const blockedModels = modelHealth.filter(([, h]) => h.until && h.until > Date.now()).map(([k, h]) => `${k.split('::')[1]} (${h.reason})`);
        const av = await this.availability(r.id, force);
        return {
          id: r.id,
          label: r.label,
          local: r.local,
          supportsTools: r.supportsTools,
          ...av,
          detail: blockedModels.length ? `${av.detail} · tạm ngừng: ${blockedModels.join(', ')}` : av.detail,
          models: undefined,
          health: this.health.get(r.id),
          usageToday: this.usageToday(r.id),
          dailyTokenLimit: Number(this.config.runtimes[r.id]?.dailyTokenLimit ?? 0) || undefined,
          chains: Object.keys(chains).length ? chains : undefined,
        };
      }),
    );
  }

  /** Runtime có được phép xử lý dữ liệu ở mức phân loại này không (Data Protection Gate). */
  allowed(id: string, cls: Classification): boolean {
    const r = this.runtimes.get(id);
    if (!r) return false;
    const rules = this.config.dataProtection.allowedRuntimes[cls] ?? ['local'];
    return rules.some((x) => x === '*' || x === id || (x === 'local' && r.local));
  }

  /** Thứ tự runtime để thử: runtime được chỉ định đầu tiên hợp lệ (task → dự án → agent → mặc định) rồi runtime.order. */
  private orderedIds(prefs: Array<string | undefined>, cls: Classification, notes: string[]): string[] {
    const ids: string[] = [];
    for (const p of prefs) {
      if (!p || p === 'inherit') continue;
      if (p === 'auto') break;
      if (!this.runtimes.has(p)) {
        notes.push(`runtime "${p}" không tồn tại`);
        break;
      }
      if (!this.allowed(p, cls)) {
        notes.push(`runtime "${p}" bị chặn với dữ liệu "${cls}"`);
        break;
      }
      ids.push(p);
      break;
    }
    for (const id of this.config.runtime.order) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  /** Model thuộc nhóm "chậm" theo runtime.slowModels (regex không phân biệt hoa thường; regex lỗi → so chuỗi con). */
  isSlow(c: { model: string; label?: string }): boolean {
    const pats = this.config.runtime.slowModels ?? [];
    return pats.some((p) => {
      try {
        const re = new RegExp(p, 'i');
        return re.test(c.model) || (!!c.label && re.test(c.label));
      } catch {
        const q = p.toLowerCase();
        return c.model.toLowerCase().includes(q) || !!c.label?.toLowerCase().includes(q);
      }
    });
  }

  /**
   * Model nhanh (không thuộc slowModels) dùng được cho yêu cầu này nhưng đang nghỉ vì quota/giới hạn tốc độ:
   * thời điểm mở lại sớm nhất — để quyết định chờ nó thay vì chạy pha nặng bằng model chậm.
   * Model chạm hạn mức token ngày không tính (chờ cũng không mở lại).
   */
  async fastRecovery(prefs: Array<string | undefined>, cls: Classification, want: string): Promise<{ until: number; label: string; reason?: string; since?: number } | undefined> {
    const now = Date.now();
    let best: { until: number; label: string; reason?: string; since?: number } | undefined;
    for (const id of this.orderedIds(prefs, cls, [])) {
      if (!this.runtimes.has(id) || !this.allowed(id, cls)) continue;
      if (!(await this.availability(id)).ok) continue;
      const rl = Number(this.config.runtimes[id]?.dailyTokenLimit ?? 0);
      if (rl > 0 && this.usageToday(id) >= rl) continue;
      for (const e of this.chainFor(id, want)) {
        const label = `${id}/${e.label ?? e.model}`;
        if (this.isSlow({ model: e.model, label })) continue;
        if (e.dailyTokenLimit && this.usageToday(id, e.model) >= e.dailyTokenLimit) continue;
        const holds = [this.health.get(`${id}::${e.model}`), this.health.get(id)].filter((h): h is HealthInfo => !!h?.until && h.until > now);
        // chỉ chờ khi mọi lý do chặn đều là quota/giới hạn tốc độ (lỗi xác thực, model không tồn tại… thì chờ vô ích)
        if (!holds.length || holds.some((h) => h.kind !== 'rate' && h.kind !== 'quota')) continue;
        const until = Math.max(...holds.map((h) => h.until as number));
        const since = Math.min(...holds.map((h) => h.since ?? now));
        if (!best || until < best.until) best = { until, label, reason: holds[0].reason, since };
      }
    }
    return best;
  }

  /**
   * Danh sách tài nguyên (runtime + model) theo thứ tự thử: runtime được chỉ định (task → dự án → agent → mặc định)
   * rồi tới thứ tự runtime.order; trong mỗi runtime là chuỗi model dự phòng. Bỏ qua runtime bị chặn với phân loại dữ liệu,
   * chưa sẵn sàng, đang nghỉ (hết quota/lỗi) hoặc đã chạm hạn mức ngày.
   */
  async candidates(prefs: Array<string | undefined>, cls: Classification, want: string): Promise<{ list: Candidate[]; notes: string[]; skipped: string[]; deferred?: string[] }> {
    const notes: string[] = [];
    const skipped: string[] = [];
    const ids = this.orderedIds(prefs, cls, notes);
    const list: Candidate[] = [];
    for (const id of ids) {
      const rt = this.runtimes.get(id);
      if (!rt || !this.allowed(id, cls)) continue;
      const a = await this.availability(id);
      if (!a.ok) {
        if (id === ids[0] && notes.length === 0 && prefs.some((p) => p === id)) notes.push(`runtime "${id}" chưa sẵn sàng (${a.detail})`);
        continue;
      }
      // pha nhẹ có thể xin model rẻ ("haiku") — runtime không có ánh xạ thì dùng model của agent
      for (const e of this.chainFor(id, want)) {
        const why = this.blocked(id, e);
        if (why) {
          skipped.push(why);
          continue;
        }
        list.push({ runtime: rt, model: e.model, key: `${id}::${e.model}`, label: `${id}/${e.label ?? e.model}` });
      }
    }
    // model vừa bị giới hạn tốc độ (đã hết thời gian nghỉ ngắn) xếp sau các model khác cho tới khi gọi thành công lại
    const backoff = this.config.runtime.rateBackoffMs ?? 0;
    let deferred: string[] | undefined;
    if (backoff > 0 && list.length > 1) {
      const recent = (c: Candidate) => this.recentlyRateLimited(c.key, backoff);
      const fresh = list.filter((c) => !recent(c));
      if (fresh.length && fresh.length < list.length) {
        const later = list.filter(recent);
        deferred = later.map((c) => c.label);
        list.splice(0, list.length, ...fresh, ...later);
      }
    }
    return { list, notes, skipped, deferred };
  }

  /** Tài nguyên báo 429 trong khoảng `windowMs` gần đây và chưa gọi thành công lại kể từ đó. */
  recentlyRateLimited(key: string, windowMs: number): boolean {
    const h = this.health.get(key);
    if (!h || h.kind !== 'rate' || !h.lastErrorAt) return false;
    if (h.lastOkAt && h.lastOkAt > h.lastErrorAt) return false;
    return Date.now() - h.lastErrorAt < windowMs;
  }

  /** Tương thích ngược: chọn runtime đầu tiên khả dụng. */
  async resolve(chain: Array<string | undefined>, cls: Classification): Promise<Resolution> {
    const { list, notes } = await this.candidates(chain, cls, 'sonnet');
    if (list.length) {
      const first = list[0].runtime;
      const wanted = chain.find((x) => x && x !== 'inherit' && x !== 'auto');
      return { runtime: first, note: notes.length || (wanted && wanted !== first.id) ? `${notes.join('; ')} → dùng ${first.id}`.replace(/^ → /, '') : undefined };
    }
    throw new NoCapacityError(`Không có runtime khả dụng (${notes.join('; ') || 'tất cả đang nghỉ hoặc chưa cấu hình'})`, this.earliestRecovery());
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

export { ALIASES };
