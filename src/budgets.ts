import fs from 'node:fs';
import path from 'node:path';
import type { UsageLedger } from './usage.js';
import { totalTokens } from './types.js';
import { shortId } from './util/ids.js';

/**
 * UI-7 (học từ Paperclip): ngân sách token theo dự án hoặc theo agent, có ngưỡng mềm (cảnh báo) và trần cứng (tạm dừng).
 * Khác ngân sách của từng nhiệm vụ: chính sách cộng dồn mọi nhiệm vụ của dự án/agent trong một kỳ (ngày, tháng, toàn bộ).
 * Lưu tại data/budgets.json; mức dùng tính từ sổ cái token (data/usage/ledger.jsonl) nên không ghi thêm dữ liệu nào.
 */
export type BudgetScope = 'project' | 'agent';
export type BudgetPeriod = 'day' | 'month' | 'total';

export interface BudgetPolicy {
  id: string;
  scope: BudgetScope;
  /** Mã dự án hoặc mã agent. */
  target: string;
  period: BudgetPeriod;
  tokens: number;
  /** Ngưỡng mềm, % của `tokens` — chạm thì cảnh báo một lần mỗi kỳ. */
  softPct: number;
  /** true = chạm 100% thì tạm dừng nhiệm vụ (lý do "budget"); false = chỉ cảnh báo. */
  hard: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStatus extends BudgetPolicy {
  since?: string;
  used: number;
  pct: number;
  level: 'ok' | 'soft' | 'hard';
}

export const BUDGET_SCOPES: BudgetScope[] = ['project', 'agent'];
export const BUDGET_PERIODS: BudgetPeriod[] = ['day', 'month', 'total'];

/** Đầu kỳ theo giờ máy chủ: 00:00 hôm nay, ngày 1 tháng này, hoặc không giới hạn. */
export function periodStart(period: BudgetPeriod, now = new Date()): string | undefined {
  if (period === 'total') return undefined;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'month') d.setDate(1);
  return d.toISOString();
}

export class BudgetPolicies {
  readonly file: string;
  private list: BudgetPolicy[] = [];

  constructor(dataDir: string, private usage: UsageLedger) {
    this.file = path.join(dataDir, 'budgets.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.list = Array.isArray(raw?.policies) ? raw.policies : [];
    } catch {
      this.list = [];
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ policies: this.list }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  all(): BudgetPolicy[] {
    return this.list.map((p) => ({ ...p }));
  }

  /** Tạo mới (không có id) hoặc sửa chính sách; kiểm tra đầu vào, trả về bản đã lưu. */
  upsert(input: Partial<BudgetPolicy>): BudgetPolicy {
    const scope = input.scope as BudgetScope;
    const period = (input.period ?? 'month') as BudgetPeriod;
    if (!BUDGET_SCOPES.includes(scope)) throw new Error('Phạm vi phải là project hoặc agent');
    if (!BUDGET_PERIODS.includes(period)) throw new Error('Kỳ phải là day, month hoặc total');
    const target = String(input.target ?? '').trim();
    if (!target) throw new Error('Thiếu dự án hoặc agent áp dụng');
    const tokens = Math.floor(Number(input.tokens));
    if (!Number.isFinite(tokens) || tokens < 1000) throw new Error('Ngân sách phải từ 1.000 token trở lên');
    const softPct = input.softPct === undefined ? 80 : Math.floor(Number(input.softPct));
    if (!Number.isFinite(softPct) || softPct < 1 || softPct > 100) throw new Error('Ngưỡng mềm phải trong khoảng 1–100%');
    const now = new Date().toISOString();
    const prev = input.id ? this.list.find((p) => p.id === input.id) : undefined;
    if (input.id && !prev) throw new Error('Không có chính sách ngân sách này');
    const dup = this.list.find((p) => p.id !== prev?.id && p.scope === scope && p.target === target && p.period === period);
    if (dup) throw new Error('Đã có chính sách cùng phạm vi, đối tượng và kỳ — sửa chính sách đó thay vì tạo thêm');
    const pol: BudgetPolicy = { id: prev?.id ?? shortId('bp'), scope, target, period, tokens, softPct, hard: input.hard !== false, createdAt: prev?.createdAt ?? now, updatedAt: now };
    if (prev) this.list[this.list.indexOf(prev)] = pol;
    else this.list.push(pol);
    this.persist();
    return { ...pol };
  }

  remove(id: string): BudgetPolicy | undefined {
    const i = this.list.findIndex((p) => p.id === id);
    if (i < 0) return undefined;
    const [gone] = this.list.splice(i, 1);
    this.persist();
    return gone;
  }

  status(p: BudgetPolicy, now = new Date()): BudgetStatus {
    const since = periodStart(p.period, now);
    const used = totalTokens(this.usage.total({ ...(p.scope === 'project' ? { project: p.target } : { agent: p.target }), since }));
    const pct = p.tokens ? Math.round((used / p.tokens) * 1000) / 10 : 0;
    const level = pct >= 100 ? 'hard' : pct >= p.softPct ? 'soft' : 'ok';
    return { ...p, since, used, pct, level };
  }

  statuses(now = new Date()): BudgetStatus[] {
    return this.list.map((p) => this.status(p, now));
  }

  /** Chính sách áp lên một lượt gọi (dự án của nhiệm vụ, agent đang gọi). */
  matching(projectId: string | undefined, agentId: string, now = new Date()): BudgetStatus[] {
    return this.list.filter((p) => (p.scope === 'project' ? !!projectId && p.target === projectId : p.target === agentId)).map((p) => this.status(p, now));
  }
}
