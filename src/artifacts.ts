import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';
import type { Task } from './types.js';

/**
 * Trang Sản phẩm (UX-4d): mọi thứ agent làm ra, gom từ các nhiệm vụ đã có — báo cáo tổng hợp (FINAL.md), kết luận nghiệm thu
 * (ACCEPTANCE.md), sản phẩm từng hạng mục (outputs/…), thay đổi mã trên nhánh git. Chỉ đọc siêu dữ liệu (đường dẫn, kích thước,
 * thời gian); nội dung mở qua GET /api/tasks/<id>/file như cũ.
 */

export type ArtifactKind = 'report' | 'acceptance' | 'output' | 'code';

export interface Artifact {
  taskId: string;
  seq?: number;
  task: string;
  projectId?: string;
  kind: ArtifactKind;
  name: string;
  /** Đường dẫn trong thư mục chạy của nhiệm vụ (mở bằng /api/tasks/<id>/file?path=); không có với "code". */
  path?: string;
  subtask?: string;
  agent?: string;
  department?: string;
  size?: number;
  at: string;
  /** "code": nhánh, commit, dòng tóm tắt diff --stat. */
  branch?: string;
  commit?: string;
  summary?: string;
}

export interface ArtifactQuery {
  kind?: string;
  project?: string;
  agent?: string;
  q?: string;
  limit?: number;
}

function stat(file: string): fs.Stats | undefined {
  try {
    return fs.statSync(file);
  } catch {
    return undefined;
  }
}

export function taskArtifacts(store: Store, t: Task): Artifact[] {
  const dir = store.runDir(t.id);
  const out: Artifact[] = [];
  const base = { taskId: t.id, seq: t.seq, task: t.title, projectId: t.projectId };
  const file = (rel: string, kind: ArtifactKind, name: string, extra: Partial<Artifact> = {}) => {
    const st = stat(path.join(dir, rel));
    if (st?.isFile()) out.push({ ...base, kind, name, path: rel, size: st.size, at: st.mtime.toISOString(), ...extra });
  };
  file('FINAL.md', 'report', 'Báo cáo tổng hợp');
  if (t.acceptance?.path) file(t.acceptance.path, 'acceptance', 'Kết luận nghiệm thu (CTO)', { agent: t.acceptance.by });
  for (const r of t.runs ?? [])
    for (const s of r.subtasks)
      if (s.output && !s.splitTo) file(s.output, 'output', `${s.id} — ${s.title}`, { subtask: s.id, agent: s.assignee, department: r.department });
  if (t.branch && (t.commit || t.changes))
    out.push({ ...base, kind: 'code', name: `Thay đổi mã trên nhánh ${t.branch}`, branch: t.branch, commit: t.commit, summary: (t.changes ?? '').trim().split('\n').pop()?.trim().slice(0, 200), at: t.finishedAt ?? t.updatedAt });
  return out;
}

export function listArtifacts(store: Store, q: ArtifactQuery = {}): { total: number; items: Artifact[] } {
  const needle = (q.q ?? '').trim().toLowerCase();
  const all = store
    .list()
    .flatMap((t) => taskArtifacts(store, t))
    .filter((a) => (!q.kind || a.kind === q.kind) && (!q.project || (q.project === '_none' ? !a.projectId : a.projectId === q.project)) && (!q.agent || a.agent === q.agent))
    .filter((a) => !needle || `${a.name} ${a.task} ${a.path ?? ''} ${a.branch ?? ''} ${a.agent ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => b.at.localeCompare(a.at));
  const limit = Math.max(1, Math.min(1000, q.limit ?? 300));
  return { total: all.length, items: all.slice(0, limit) };
}
