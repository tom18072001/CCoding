import path from 'node:path';
import { readJsonl } from './util/fsx.js';
import type { LogStore } from './logger.js';
import type { EventBus } from './events.js';
import { addUsage, emptyUsage, totalTokens, type Usage, type UsageRecord } from './types.js';

export type UsageDim = 'agent' | 'department' | 'task' | 'project' | 'model' | 'runtime' | 'day' | 'phase';

export interface UsageRow extends Usage {
  key: string;
  total: number;
}

const keyOf: Record<UsageDim, (r: UsageRecord) => string> = {
  agent: (r) => r.agentId,
  department: (r) => r.department,
  task: (r) => r.taskId,
  project: (r) => r.projectId ?? '(không dự án)',
  model: (r) => r.model || '(?)',
  runtime: (r) => r.runtime,
  day: (r) => r.ts.slice(0, 10),
  phase: (r) => r.phase,
};

export interface UsageFilter {
  agent?: string;
  department?: string;
  task?: string;
  project?: string;
  since?: string; // ISO date
}

/**
 * Bộ đếm token: sổ cái JSONL (data/usage/ledger.jsonl) — mỗi lần gọi LLM là một dòng,
 * kèm tổng hợp trong bộ nhớ theo agent / phòng ban / task / dự án / model / ngày.
 */
export class UsageLedger {
  readonly file: string;
  private records: UsageRecord[] = [];

  constructor(dataDir: string, private logs?: LogStore, private bus?: EventBus) {
    this.file = path.join(dataDir, 'usage', 'ledger.jsonl');
    this.records = readJsonl<UsageRecord>(this.file);
  }

  reload(): void {
    this.records = readJsonl<UsageRecord>(this.file);
  }

  record(rec: UsageRecord): void {
    this.records.push(rec);
    if (this.logs) this.logs.append(this.file, rec);
    this.bus?.publish({ type: 'usage', record: rec });
  }

  all(filter: UsageFilter = {}): UsageRecord[] {
    return this.records.filter(
      (r) =>
        (!filter.agent || r.agentId === filter.agent) &&
        (!filter.department || r.department === filter.department) &&
        (!filter.task || r.taskId === filter.task) &&
        (!filter.project || r.projectId === filter.project) &&
        (!filter.since || r.ts >= filter.since),
    );
  }

  total(filter: UsageFilter = {}): Usage {
    const u = emptyUsage();
    for (const r of this.all(filter)) addUsage(u, { ...r, calls: 1 });
    return u;
  }

  summary(by: UsageDim, filter: UsageFilter = {}): UsageRow[] {
    const map = new Map<string, Usage>();
    for (const r of this.all(filter)) {
      const k = keyOf[by](r);
      const u = map.get(k) ?? emptyUsage();
      addUsage(u, { ...r, calls: 1 });
      map.set(k, u);
    }
    return [...map.entries()]
      .map(([key, u]) => ({ key, ...u, total: totalTokens(u) }))
      .sort((a, b) => b.total - a.total);
  }

  /** Ma trận phòng ban × agent — dùng cho dashboard. */
  byDepartmentAgent(filter: UsageFilter = {}): Record<string, UsageRow[]> {
    const out: Record<string, UsageRow[]> = {};
    for (const dept of new Set(this.all(filter).map((r) => r.department))) {
      out[dept] = this.summary('agent', { ...filter, department: dept });
    }
    return out;
  }
}
