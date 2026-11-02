import path from 'node:path';
import type { LogStore } from './logger.js';
import type { Orchestrator } from './orchestrator.js';
import type { Registry } from './registry.js';
import type { Store } from './store.js';
import type { Routine, RoutineSchedule, Task, TaskMode } from './types.js';
import { readJsonFile, writeJsonAtomic } from './util/fsx.js';
import { nowIso, shortId } from './util/ids.js';

/**
 * Việc định kỳ (UX-4d): giao lại một nhiệm vụ mẫu theo lịch (hằng ngày HH:MM, các thứ trong tuần, mỗi N giờ). Lưu ở
 * data/routines.json; bộ lập lịch chỉ chạy trong tiến trình server (`ccoding serve`). Nhiệm vụ tạo ra đi qua đúng đường
 * giao việc thường (Orchestrator.submit → mọi lượt gọi model qua Orchestrator.call) và mang routineId.
 * - Lần chạy trước chưa xong (chờ/đang chạy/tạm dừng chờ giám đốc hoặc chờ hạn mức) → bỏ qua lần này, ghi "routine.skip".
 *   Riêng lần trước bị GIÁN ĐOẠN do server khởi động lại thì không chặn: lần mới vẫn giao, lần cũ để nguyên (tạm dừng).
 * - Server tắt lỡ lịch: trễ ≤ 6 giờ thì chạy bù một lần; trễ hơn thì bỏ qua tới lịch kế tiếp.
 * - Nhiệm vụ mẫu giữ dự án ở MỌI chế độ giao việc → nhiệm vụ tạo ra mang nhãn dữ liệu, runtime được phép, ngân sách và
 *   worktree của dự án như giao tay (không hạ nhãn dữ liệu qua đường việc định kỳ).
 */

export const CATCH_UP_MS = 6 * 3600e3;
const MODES: TaskMode[] = ['auto', 'department', 'project', 'joint', 'agent'];
const PAUSE_VI: Record<string, string> = { budget: 'hết ngân sách', quota: 'chờ hạn mức', manual: 'tạm dừng tay', plan: 'chờ duyệt kế hoạch', interrupted: 'bị gián đoạn' };

/** Lần chạy trước còn "chiếm chỗ" không: đang chờ/chạy, hoặc tạm dừng mà vẫn chờ (giám đốc xử lý, hạn mức mở lại). */
function blocking(t: Task | undefined): string | undefined {
  if (!t) return undefined;
  if (t.status === 'queued' || t.status === 'running') return `lần chạy trước (${t.id}) chưa xong`;
  if (t.status === 'paused' && t.pause?.reason !== 'interrupted')
    return `lần chạy trước (${t.id}) đang tạm dừng (${PAUSE_VI[t.pause?.reason ?? ''] ?? 'tạm dừng'}) — cần xử lý: tiếp tục hoặc hủy nhiệm vụ đó`;
  return undefined;
}

const hm = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? { h, mi } : undefined;
};

/** Lần chạy kế tiếp SAU mốc `from` (giờ địa phương của máy chạy server). */
export function nextRun(s: RoutineSchedule, from: Date, lastRunAt?: string): Date | undefined {
  if (s.kind === 'interval') {
    const h = Number(s.everyHours);
    if (!(h >= 1 && h <= 168)) return undefined;
    const last = lastRunAt ? Date.parse(lastRunAt) : NaN;
    const step = h * 3600e3;
    // lần chạy trước "ở tương lai" (đồng hồ máy bị chỉnh lùi) → không đợi quá một chu kỳ
    let t = Number.isFinite(last) ? Math.min(last + step, from.getTime() + step) : from.getTime() + step;
    // lỡ nhiều chu kỳ → lấy chu kỳ đầu tiên sau `from`
    if (t <= from.getTime()) t += Math.ceil((from.getTime() - t + 1) / step) * step;
    return new Date(t);
  }
  const at = hm(s.time);
  if (!at) return undefined;
  const days = s.kind === 'weekly' ? new Set((s.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)) : undefined;
  if (days && !days.size) return undefined;
  for (let i = 0; i <= 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, at.h, at.mi, 0, 0);
    if (d.getTime() <= from.getTime()) continue;
    if (days && !days.has(d.getDay())) continue;
    return d;
  }
  return undefined;
}

const DAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** Mô tả lịch bằng tiếng Việt: "Hằng ngày 08:30", "T2, T4, T6 lúc 09:00", "Mỗi 6 giờ". */
export function describeSchedule(s: RoutineSchedule): string {
  if (s.kind === 'interval') return `Mỗi ${s.everyHours} giờ`;
  if (s.kind === 'weekly') return `${[...(s.days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_VI[d]).join(', ')} lúc ${s.time}`;
  return `Hằng ngày ${s.time}`;
}

export class RoutineError extends Error {}

export class Routines {
  private list: Routine[] = [];
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private dataDir: string,
    private d: { store: Store; registry: Registry; logs: LogStore; orchestrator: Orchestrator },
  ) {
    const raw = readJsonFile<unknown>(this.file(), []);
    // tệp hỏng / sai dạng không được làm hỏng mọi lệnh CLI (createApp nạp lớp này)
    this.list = (Array.isArray(raw) ? raw : []).filter((r): r is Routine => !!r && typeof r === 'object' && !!r.id && !!r.schedule && !!r.template);
  }

  private file(): string {
    return path.join(this.dataDir, 'routines.json');
  }
  private save(): void {
    writeJsonAtomic(this.file(), this.list);
  }

  all(): Routine[] {
    return [...this.list].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }
  get(id: string): Routine | undefined {
    return this.list.find((r) => r.id === id);
  }

  /** Kiểm tra và chuẩn hóa dữ liệu từ API — lỗi báo bằng tiếng Việt. */
  private normalize(b: Record<string, unknown>, existing?: Routine): Omit<Routine, 'id' | 'createdAt' | 'updatedAt'> {
    const name = String(b.name ?? existing?.name ?? '').trim().slice(0, 120);
    if (!name) throw new RoutineError('Đặt tên cho việc định kỳ');
    const sIn = (b.schedule ?? existing?.schedule ?? {}) as Record<string, unknown>;
    const kind = String(sIn.kind ?? '');
    if (!['daily', 'weekly', 'interval'].includes(kind)) throw new RoutineError('Lịch phải là hằng ngày, theo thứ trong tuần hoặc mỗi N giờ');
    const schedule: RoutineSchedule = { kind: kind as RoutineSchedule['kind'] };
    if (kind === 'interval') {
      const h = Math.floor(Number(sIn.everyHours));
      if (!(h >= 1 && h <= 168)) throw new RoutineError('Mỗi N giờ: N từ 1 đến 168');
      schedule.everyHours = h;
    } else {
      if (!hm(String(sIn.time ?? ''))) throw new RoutineError('Giờ chạy dạng HH:MM (00:00–23:59)');
      const { h, mi } = hm(String(sIn.time))!;
      schedule.time = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      if (kind === 'weekly') {
        const days = [...new Set((Array.isArray(sIn.days) ? sIn.days : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))];
        if (!days.length) throw new RoutineError('Chọn ít nhất một thứ trong tuần');
        schedule.days = days.sort();
      }
    }
    const tIn = (b.template ?? existing?.template ?? {}) as Record<string, unknown>;
    const brief = typeof tIn.brief === 'string' ? tIn.brief.trim() : '';
    if (!brief) throw new RoutineError('Nhiệm vụ mẫu cần nội dung (brief)');
    if (brief.length > 20000) throw new RoutineError('Nội dung nhiệm vụ mẫu quá dài (tối đa 20.000 ký tự)');
    const mode = (tIn.mode ? String(tIn.mode) : 'auto') as TaskMode;
    if (!MODES.includes(mode)) throw new RoutineError('Chế độ giao việc không hợp lệ');
    const department = tIn.department ? String(tIn.department) : undefined;
    const projectId = tIn.projectId ? String(tIn.projectId) : undefined;
    const agentId = tIn.agentId ? String(tIn.agentId) : undefined;
    if (mode === 'department' && (!department || !this.d.registry.departments.has(department))) throw new RoutineError('Chọn phòng ban nhận việc');
    if (mode === 'project' && !projectId) throw new RoutineError('Chọn dự án');
    if (projectId && !this.d.store.project(projectId)) throw new RoutineError(`Dự án "${projectId}" không còn — chọn dự án khác hoặc bỏ gắn dự án`);
    if (mode === 'agent') {
      const a = agentId ? this.d.registry.agents.get(agentId) : undefined;
      // chỉ agent thuộc một phòng ban mới nhận việc riêng được (điều phối, CTO… thì không)
      if (!a || !this.d.registry.departments.has(a.department)) throw new RoutineError('Chọn agent nhận việc (thuộc một phòng ban)');
    }
    const o = (tIn.options ?? {}) as Record<string, unknown>;
    const options: Routine['template']['options'] = {};
    if (Number(o.budgetTokens) >= 1000) options.budgetTokens = Math.floor(Number(o.budgetTokens));
    if (o.budgetMode === 'pause' || o.budgetMode === 'complete') options.budgetMode = o.budgetMode;
    if (typeof o.review === 'boolean') options.review = o.review;
    if (typeof o.acceptance === 'boolean') options.acceptance = o.acceptance;
    if (Number.isFinite(Number(o.discussionRounds))) options.discussionRounds = Math.max(0, Math.min(3, Math.floor(Number(o.discussionRounds))));
    const title = typeof tIn.title === 'string' && tIn.title.trim() ? tIn.title.trim().slice(0, 120) : undefined;
    return {
      name,
      enabled: typeof b.enabled === 'boolean' ? b.enabled : (existing?.enabled ?? true),
      schedule,
      // dự án giữ ở mọi chế độ: nhãn dữ liệu, runtime được phép, ngân sách, worktree theo dự án
      template: { brief, title, mode, department: mode === 'department' ? department : undefined, projectId, agentId: mode === 'agent' ? agentId : undefined, options },
      lastRunAt: existing?.lastRunAt,
      lastTaskId: existing?.lastTaskId,
      lastSkip: existing?.lastSkip,
    };
  }

  upsert(b: Record<string, unknown>, id?: string, now = new Date()): Routine {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new RoutineError('Dữ liệu việc định kỳ không hợp lệ');
    const existing = id ? this.get(id) : undefined;
    if (id && !existing) throw new RoutineError('Không có việc định kỳ này');
    // chỉ TẮT: luôn được, kể cả khi dự án/phòng ban/agent của mẫu đã bị xóa (nếu không sẽ lỗi mãi mỗi lần tới lịch)
    if (existing && b.enabled === false && Object.keys(b).every((k) => k === 'enabled')) {
      existing.enabled = false;
      existing.nextRunAt = undefined;
      existing.updatedAt = nowIso();
      this.save();
      this.d.logs.write({ level: 'info', kind: 'routine.saved', msg: `Tắt việc định kỳ "${existing.name}"`, projectId: existing.template.projectId, data: { id: existing.id, enabled: false } });
      return existing;
    }
    const n = this.normalize(b, existing);
    const r: Routine = { ...n, id: existing?.id ?? shortId('r'), createdAt: existing?.createdAt ?? nowIso(), updatedAt: nowIso() };
    r.nextRunAt = r.enabled ? nextRun(r.schedule, now, r.lastRunAt)?.toISOString() : undefined;
    if (existing) this.list[this.list.indexOf(existing)] = r;
    else this.list.push(r);
    this.save();
    this.d.logs.write({ level: 'info', kind: 'routine.saved', msg: `${existing ? 'Sửa' : 'Tạo'} việc định kỳ "${r.name}" — ${describeSchedule(r.schedule)}${r.enabled ? '' : ' (đang tắt)'}`, projectId: r.template.projectId, data: { id: r.id, enabled: r.enabled, schedule: r.schedule, mode: r.template.mode, briefChars: r.template.brief.length } });
    return r;
  }

  remove(id: string): boolean {
    const r = this.get(id);
    if (!r) return false;
    this.list = this.list.filter((x) => x !== r);
    this.save();
    this.d.logs.write({ level: 'info', kind: 'routine.deleted', msg: `Xóa việc định kỳ "${r.name}"`, data: { id } });
    return true;
  }

  /** Giao nhiệm vụ từ mẫu ngay (bấm "Chạy ngay" hoặc tới lịch). */
  run(id: string, opts: { manual?: boolean; now?: Date } = {}): { taskId: string } {
    const r = this.get(id);
    if (!r) throw new RoutineError('Không có việc định kỳ này');
    const prev = r.lastTaskId ? this.d.store.get(r.lastTaskId) : undefined;
    const busy = blocking(prev);
    if (busy) throw new RoutineError(`${busy[0].toUpperCase()}${busy.slice(1)}${prev!.status === 'paused' ? '' : ' — đợi xong hoặc hủy rồi chạy lại'}`);
    const now = opts.now ?? new Date();
    const t = this.d.orchestrator.submit({ ...r.template, title: r.template.title || r.name, routineId: r.id, routineManual: !!opts.manual });
    r.lastRunAt = now.toISOString();
    r.lastTaskId = t.id;
    r.nextRunAt = r.enabled ? nextRun(r.schedule, now, r.lastRunAt)?.toISOString() : undefined;
    this.save();
    this.d.logs.write({ level: 'info', kind: 'routine.run', msg: `Việc định kỳ "${r.name}" → giao ${t.id}${opts.manual ? ' (chạy ngay)' : ''}`, taskId: t.id, projectId: t.projectId, data: { id: r.id, manual: !!opts.manual } });
    return { taskId: t.id };
  }

  private skip(r: Routine, reason: string, now: Date): void {
    r.lastSkip = { at: now.toISOString(), reason };
    r.nextRunAt = nextRun(r.schedule, now, r.lastRunAt)?.toISOString();
    this.d.logs.write({ level: 'warn', kind: 'routine.skip', msg: `Bỏ qua việc định kỳ "${r.name}": ${reason}`, data: { id: r.id, next: r.nextRunAt } });
  }

  /** Một nhịp lập lịch: giao các việc đã tới giờ. Trả về số nhiệm vụ đã giao. */
  tick(now = new Date()): number {
    if (this.ticking) return 0;
    this.ticking = true;
    let n = 0;
    let dirty = false;
    try {
      for (const r of this.list) {
        if (!r.enabled) continue;
        if (!r.nextRunAt) {
          r.nextRunAt = nextRun(r.schedule, now, r.lastRunAt)?.toISOString();
          dirty = true;
          continue;
        }
        const due = Date.parse(r.nextRunAt);
        if (!(due <= now.getTime())) continue;
        dirty = true;
        if (now.getTime() - due > CATCH_UP_MS) {
          this.skip(r, `lỡ lịch ${new Date(due).toLocaleString('vi-VN')} quá 6 giờ (server tắt)`, now);
          continue;
        }
        const busy = blocking(r.lastTaskId ? this.d.store.get(r.lastTaskId) : undefined);
        if (busy) {
          this.skip(r, busy, now);
          continue;
        }
        try {
          this.run(r.id, { now });
          n++;
        } catch (e) {
          r.lastSkip = { at: now.toISOString(), reason: (e as Error).message.slice(0, 300) };
          r.nextRunAt = nextRun(r.schedule, now, r.lastRunAt)?.toISOString();
          this.d.logs.write({ level: 'error', kind: 'routine.error', msg: `Việc định kỳ "${r.name}" lỗi khi giao: ${(e as Error).message.slice(0, 300)}`, data: { id: r.id } });
        }
      }
      if (dirty) this.save();
    } finally {
      this.ticking = false;
    }
    return n;
  }

  /** Chạy bộ lập lịch (chỉ trong tiến trình server). */
  start(everyMs = 30_000): void {
    this.stop();
    this.tick();
    this.timer = setInterval(() => this.tick(), everyMs);
    this.timer.unref?.();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
