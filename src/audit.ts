/**
 * Trang Kiểm toán (UX-4d): ai làm gì lúc nào — chọn từ nhật ký hệ thống (data/logs/system.jsonl, có chuỗi băm) các sự kiện
 * thay đổi trạng thái hoặc liên quan an toàn: giao/hủy/tiếp tục nhiệm vụ, duyệt kế hoạch/kết quả, đẩy nhánh, cấu hình dự án,
 * góp ý agent, việc định kỳ, tải tệp, lệnh bị chặn, khởi động server. Chỉ đọc; không ghi gì thêm.
 */

export type AuditCat = 'task' | 'decision' | 'ship' | 'config' | 'data' | 'security' | 'system';

export const AUDIT_CATS: Record<AuditCat, string> = {
  task: 'Nhiệm vụ',
  decision: 'Duyệt & quyết định',
  ship: 'Đẩy mã',
  config: 'Cấu hình',
  data: 'Dữ liệu',
  security: 'An toàn',
  system: 'Hệ thống',
};

/** Loại nhật ký → nhóm + nhãn; actor "director" = do giám đốc thao tác trên giao diện/API. */
const KINDS: Record<string, { cat: AuditCat; label: string; actor?: 'director' | 'system' }> = {
  'task.created': { cat: 'task', label: 'Giao nhiệm vụ', actor: 'director' },
  'task.cancelled': { cat: 'task', label: 'Hủy nhiệm vụ', actor: 'director' },
  'task.resumed': { cat: 'task', label: 'Tiếp tục nhiệm vụ', actor: 'director' },
  'task.pause.requested': { cat: 'task', label: 'Yêu cầu tạm dừng', actor: 'director' },
  'task.autoresume': { cat: 'task', label: 'Tự tiếp tục', actor: 'system' },
  'task.split': { cat: 'decision', label: 'Tách nhiệm vụ', actor: 'director' },
  'task.rerun': { cat: 'decision', label: 'Chạy lại hạng mục', actor: 'director' },
  'plan.approved': { cat: 'decision', label: 'Duyệt kế hoạch', actor: 'director' },
  'plan.edited': { cat: 'decision', label: 'Sửa kế hoạch', actor: 'director' },
  'review.director': { cat: 'decision', label: 'Quyết định review', actor: 'director' },
  'accept.done': { cat: 'decision', label: 'CTO nghiệm thu' },
  'accept.error': { cat: 'decision', label: 'CTO chưa nghiệm thu được' },
  'ship.push': { cat: 'ship', label: 'Đẩy nhánh / gộp', actor: 'director' },
  'project.saved': { cat: 'config', label: 'Lưu dự án', actor: 'director' },
  'agent.feedback': { cat: 'config', label: 'Góp ý agent', actor: 'director' },
  'agent.feedback.cleared': { cat: 'config', label: 'Xóa góp ý agent' },
  'kpi.finding': { cat: 'config', label: 'Đánh dấu mục KPI', actor: 'director' },
  'routine.saved': { cat: 'config', label: 'Lưu việc định kỳ', actor: 'director' },
  'routine.deleted': { cat: 'config', label: 'Xóa việc định kỳ', actor: 'director' },
  'routine.run': { cat: 'task', label: 'Chạy việc định kỳ', actor: 'system' },
  'routine.skip': { cat: 'task', label: 'Bỏ qua việc định kỳ', actor: 'system' },
  'routine.error': { cat: 'task', label: 'Việc định kỳ lỗi', actor: 'system' },
  upload: { cat: 'data', label: 'Tải tệp lên', actor: 'director' },
  'upload.purge': { cat: 'data', label: 'Xóa tệp tải lên cũ', actor: 'system' },
  'checks.regression': { cat: 'security', label: 'Lệnh kiểm tra hồi quy', actor: 'system' },
  'review.unverified': { cat: 'security', label: 'Review không chạy kiểm tra', actor: 'system' },
  'server.start': { cat: 'system', label: 'Khởi động server', actor: 'system' },
  'server.stop': { cat: 'system', label: 'Dừng server', actor: 'system' },
  registry: { cat: 'system', label: 'Hồ sơ agent lỗi', actor: 'system' },
};

export interface AuditRow {
  ts: string;
  seq?: number;
  kind: string;
  cat: AuditCat;
  label: string;
  level: string;
  /** "director" (giám đốc), "system", hoặc id agent. */
  actor: string;
  msg: string;
  taskId?: string;
  projectId?: string;
  agentId?: string;
}

/** Một dòng nhật ký có thuộc trang Kiểm toán không (null nếu không). Lệnh bị chặn lấy từ tool.call lỗi "bị chặn". */
export function auditOf(e: Record<string, unknown>): AuditRow | null {
  const kind = String(e.kind ?? '');
  let k = KINDS[kind];
  if (!k && kind === 'tool.call') {
    const err = String((e.data as Record<string, unknown> | undefined)?.error ?? '');
    if (e.level === 'warn' && /bị chặn|denied|không được phép/i.test(err)) k = { cat: 'security', label: 'Lệnh bị chặn' };
  }
  if (!k && /^alert\.task\.paused/.test(kind)) k = { cat: 'task', label: 'Tạm dừng', actor: 'system' };
  if (!k) return null;
  const agentId = e.agentId ? String(e.agentId) : undefined;
  const data = (e.data ?? {}) as Record<string, unknown>;
  // tự tiếp tục / giao bởi việc định kỳ không phải giám đốc bấm
  const actor = kind === 'task.resumed' && data.auto ? 'system' : kind === 'task.created' && data.routineId ? 'system' : (k.actor ?? agentId ?? 'system');
  return {
    ts: String(e.ts ?? ''),
    seq: typeof e.seq === 'number' ? e.seq : undefined,
    kind,
    cat: k.cat,
    label: k.label,
    level: String(e.level ?? 'info'),
    actor,
    msg: String(e.msg ?? '').slice(0, 600),
    taskId: e.taskId ? String(e.taskId) : undefined,
    projectId: e.projectId ? String(e.projectId) : undefined,
    agentId,
  };
}
