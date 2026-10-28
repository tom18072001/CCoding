import type { Classification, Task } from './types.js';

const RANK: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

/** Lấy nội dung một mục Markdown (theo tên tiêu đề, mọi cấp #) cho tới tiêu đề cùng cấp hoặc cao hơn kế tiếp. */
export function sectionOf(md: string, name: RegExp, max: number): string {
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,4})\s+(.*)$/.exec(lines[i]);
    if (!m || !name.test(m[2])) continue;
    const level = m[1].length;
    const out: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const h = /^(#{1,4})\s/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      out.push(lines[j]);
    }
    const text = out.join('\n').trim();
    if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
  }
  return '';
}

export interface HistoryItem {
  task: Task;
  final?: string;
}

const STATUS: Record<string, string> = { done: 'xong', failed: 'lỗi', cancelled: 'đã hủy', paused: 'tạm dừng', running: 'đang chạy', queued: 'chờ' };

/**
 * P8 — ghi chú giữa các nhiệm vụ: các nhiệm vụ gần nhất của cùng dự án (đã xong/lỗi/hủy) cho pha lập kế hoạch,
 * để trưởng phòng biết việc đã làm, nhánh đã có, việc còn mở — không lập lại hay khảo sát lại từ đầu.
 * Chỉ lấy nhiệm vụ có phân loại dữ liệu ≤ nhiệm vụ hiện tại (không đưa dữ liệu mức cao hơn vào nhiệm vụ mức thấp hơn).
 */
export function selectHistory(all: Task[], current: Task, limit = 3): Task[] {
  if (!current.projectId) return [];
  return all
    .filter((t) => t.id !== current.id && t.projectId === current.projectId && ['done', 'failed', 'cancelled'].includes(t.status))
    .filter((t) => (RANK[t.classification] ?? 3) <= (RANK[current.classification] ?? 3))
    .sort((a, b) => (b.finishedAt ?? b.updatedAt).localeCompare(a.finishedAt ?? a.updatedAt))
    .slice(0, limit);
}

/** Khối "Nhiệm vụ trước của dự án" (ngắn, đưa vào prompt) và bản đầy đủ hơn (ghi ra tệp để đọc khi cần). */
export function historyText(items: HistoryItem[], perTask: number): string {
  return items
    .map(({ task: t, final }) => {
      const head = `### ${t.id} — ${t.title} (${STATUS[t.status] ?? t.status}${t.finishedAt ? `, ${t.finishedAt.slice(0, 10)}` : ''})`;
      const meta = [
        t.branch ? `nhánh \`${t.branch}\`${t.commit ? ` (${t.commit.slice(0, 7)})` : ''}` : '',
        t.attention ? `⚠ cần xem: ${t.attention.detail.slice(0, 160)}` : '',
        t.error ? `lỗi: ${t.error.slice(0, 160)}` : '',
        t.projectChecks?.latest?.length ? `kiểm tra sau cùng: ${t.projectChecks.latest.map((c) => `\`${c.command}\` → ${c.ok ? 'đạt' : `lỗi (exit ${c.code ?? '?'})`}${c.summary ? ` — ${c.summary.slice(0, 80)}` : ''}`).join('; ')}` : '',
      ].filter(Boolean);
      const summary = final ? sectionOf(final, /^Tóm tắt/i, Math.floor(perTask * 0.6)) : '';
      const open = final ? sectionOf(final, /Việc còn (mở|lại)|Bước tiếp theo/i, Math.floor(perTask * 0.4)) : '';
      return [head, ...meta.map((m) => `- ${m}`), summary && `Tóm tắt: ${summary}`, open && `Còn mở: ${open}`].filter(Boolean).join('\n');
    })
    .join('\n\n');
}
