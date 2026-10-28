import type { Task } from './types.js';
import { totalTokens } from './types.js';

export interface AgentHistory {
  /** Trung vị token của các hạng mục gần nhất (gồm cả lần sửa theo review). */
  median: number;
  samples: number;
}

/**
 * Token thực tế mỗi hạng mục theo agent, lấy từ các nhiệm vụ đã chạy (hạng mục xong, đã chạy ít nhất một lần).
 * Dùng trung vị của `maxSamples` hạng mục GẦN NHẤT để ước tính theo kiểu làm việc hiện tại (sau các bản vá, số liệu cũ phai dần).
 */
export function subtaskHistory(tasks: Task[], o: { days?: number; maxSamples?: number; now?: number; projectId?: string } = {}): Map<string, AgentHistory> {
  const since = (o.now ?? Date.now()) - (o.days ?? 30) * 864e5;
  const per = new Map<string, Array<{ at: number; tokens: number }>>();
  for (const t of tasks) {
    if (o.projectId && t.projectId !== o.projectId) continue;
    for (const r of t.runs ?? [])
      for (const s of r.subtasks ?? []) {
        if (s.status !== 'done' || !s.attempts || s.splitTo) continue;
        const at = Date.parse(s.finishedAt ?? t.updatedAt ?? t.createdAt);
        const tokens = totalTokens(s.usage);
        if (!Number.isFinite(at) || at < since || tokens <= 0) continue;
        const list = per.get(s.assignee) ?? [];
        list.push({ at, tokens });
        per.set(s.assignee, list);
      }
  }
  const out = new Map<string, AgentHistory>();
  for (const [agent, list] of per) {
    const recent = list.sort((a, b) => b.at - a.at).slice(0, o.maxSamples ?? 8).map((x) => x.tokens).sort((a, b) => a - b);
    const m = recent.length % 2 ? recent[(recent.length - 1) / 2] : (recent[recent.length / 2 - 1] + recent[recent.length / 2]) / 2;
    out.set(agent, { median: Math.round(m), samples: recent.length });
  }
  return out;
}
