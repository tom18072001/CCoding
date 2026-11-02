import type { LogEntry, Phase, Task } from './types.js';

/**
 * Dòng thời gian (Gantt) của một nhiệm vụ — dựng từ dữ liệu đã có, không gọi model:
 * - calls.jsonl: mỗi lượt gọi agent (ts = lúc xong, durationMs) → một thanh trên làn của hạng mục (hoặc làn "điều phối" của phòng);
 * - nhật ký nhiệm vụ: call.start chưa có bản ghi xong → thanh đang chạy (đợt hiện tại) hoặc bị ngắt; phase → các pha của phòng;
 *   checks.run/checks.setup → lệnh kiểm tra/chuẩn bị; task.paused/done/failed → task.start/resumed (và lúc server bị dừng giữa chừng)
 *   → khoảng tạm dừng; workspace.merge → mốc gộp worktree con;
 * - đường găng (theo lượt thực thi): từ hạng mục xong muộn nhất lần ngược theo phụ thuộc xong muộn nhất.
 */

export interface TimelineBar {
  start: number;
  end: number;
  phase: Phase | 'checks' | 'setup';
  agentId?: string;
  /** Lượt gọi lỗi / đang chạy (chưa xong). */
  error?: boolean;
  open?: boolean;
  label?: string;
}

export interface TimelineLane {
  key: string;
  department: string;
  /** undefined = làn "điều phối" của phòng (lập kế hoạch, họp, review, tổng hợp) hoặc làn hệ thống. */
  subtask?: string;
  title: string;
  assignee?: string;
  status?: string;
  dependsOn: string[];
  bars: TimelineBar[];
  /** Mốc gộp worktree con vào nhánh nhiệm vụ. */
  merges: number[];
  /** Lúc mọi phụ thuộc đã xong (có thể bắt đầu) — để thấy hạng mục chờ bao lâu. */
  readyAt?: number;
  critical?: boolean;
}

export interface Timeline {
  start: number;
  end: number;
  now: number;
  live: boolean;
  lanes: TimelineLane[];
  phases: Array<{ department: string; phase: Phase; start: number; end: number }>;
  pauses: Array<{ start: number; end: number; reason?: string }>;
  critical: { lanes: string[]; ms: number };
  stats: { wallMs: number; pausedMs: number; busyMs: number; executeMs: number; maxParallel: number; calls: number };
}

type CallRow = { ts: string; callId?: string; subtaskId?: string; department?: string; agentId?: string; phase?: Phase; durationMs?: number; error?: string };

const t = (s?: string) => (s ? Date.parse(s) : NaN);
const ok = (n: number) => Number.isFinite(n);

/** Hợp các khoảng → tổng thời gian có ít nhất một thanh chạy. */
function unionMs(iv: Array<[number, number]>): number {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cs = -Infinity;
  let ce = -Infinity;
  for (const [a, b] of s) {
    if (a > ce) {
      if (ce > cs) total += ce - cs;
      cs = a;
      ce = b;
    } else ce = Math.max(ce, b);
  }
  if (ce > cs) total += ce - cs;
  return total;
}

/** Số thanh chạy đồng thời lớn nhất. */
function maxOverlap(iv: Array<[number, number]>): number {
  const ev: Array<[number, number]> = [];
  for (const [a, b] of iv) if (b > a) ev.push([a, 1], [b, -1]);
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0;
  let best = 0;
  for (const [, d] of ev) best = Math.max(best, (cur += d));
  return best;
}

export function buildTimeline(task: Task, calls: CallRow[], events: LogEntry[], now = Date.now()): Timeline {
  const live = task.status === 'running' || task.status === 'queued';
  const lanes = new Map<string, TimelineLane>();
  const multi = task.runs.length > 1;
  for (const r of task.runs) {
    lanes.set(`${r.department}|_`, { key: `${r.department}|_`, department: r.department, title: 'Lập kế hoạch · họp · review · tổng hợp', dependsOn: [], bars: [], merges: [] });
    for (const s of r.subtasks)
      lanes.set(`${r.department}|${s.id}`, { key: `${r.department}|${s.id}`, department: r.department, subtask: s.id, title: s.title, assignee: s.assignee, status: s.status, dependsOn: s.dependsOn, bars: [], merges: [] });
  }
  const laneFor = (dept: string | undefined, sub: string | undefined): TimelineLane | undefined => {
    const d = dept ?? task.runs[0]?.department;
    if (!d) return undefined;
    if (sub && lanes.has(`${d}|${sub}`)) return lanes.get(`${d}|${sub}`);
    if (!sub && lanes.has(`${d}|_`)) return lanes.get(`${d}|_`);
    // hạng mục đã bỏ khỏi kế hoạch / định tuyến (chưa có phòng) → làn hệ thống
    const key = sub ? `${d}|${sub}` : '_|_';
    if (!lanes.has(key)) lanes.set(key, { key, department: sub ? d : '_', subtask: sub, title: sub ? `${sub} (không còn trong kế hoạch)` : 'Điều phối', dependsOn: [], bars: [], merges: [] });
    return lanes.get(key);
  };

  // 1) lượt gọi đã xong (bản ghi thử lại "-p2", bản ghi bù khi lỗi chậm "-lost1" cũng tính là xong lượt gốc)
  const done = new Set<string>();
  const callEnds: number[] = [];
  for (const c of calls) {
    const end = t(c.ts);
    if (!ok(end)) continue;
    if (c.callId) done.add(c.callId.replace(/-(?:p|lost)\d+$/, ''));
    callEnds.push(end);
    const start = end - Math.max(0, Number(c.durationMs) || 0);
    const lane = laneFor(c.department, c.subtaskId);
    lane?.bars.push({ start, end, phase: c.phase ?? 'execute', agentId: c.agentId, error: !!c.error || undefined });
  }
  callEnds.sort((x, y) => x - y);
  // 2) nhật ký, chia theo "đợt chạy" (task.start → task.paused/done/failed/cancelled). Đợt không có sự kiện kết thúc mà gặp
  //    task.start/task.resumed mới (hoặc nhiệm vụ không còn chạy) = server bị dừng giữa chừng: đợt kết thúc ở hoạt động cuối cùng,
  //    lượt gọi dở của đợt đó là "bị ngắt", khoảng tới lần chạy sau tính là tạm dừng.
  const phases: Timeline['phases'] = [];
  const pauses: Timeline['pauses'] = [];
  const openPhase = new Map<string, { phase: Phase; start: number }>();
  const closePhases = (at: number, except?: string) => {
    for (const [d, p] of openPhase) {
      if (d === except) continue;
      phases.push({ department: d, phase: p.phase, start: p.start, end: Math.max(p.start, at) });
      openPhase.delete(d);
    }
  };
  type Start = { at: number; e: LogEntry; epoch: number };
  const starts = new Map<string, Start>();
  const epochEnd = new Map<number, number>();
  let epoch = 0;
  let active = false;
  let epochFrom = -Infinity;
  let lastSeen = -Infinity;
  let gap: { at: number; reason?: string } | undefined;
  /** Hoạt động cuối cùng của đợt hiện tại (sự kiện hoặc lượt gọi xong) trước mốc `before`. */
  const lastActivity = (before: number) => {
    let m = lastSeen;
    for (let i = callEnds.length - 1; i >= 0; i--)
      if (callEnds[i] < before) {
        if (callEnds[i] > epochFrom) m = Math.max(m, callEnds[i]);
        break;
      }
    return Number.isFinite(m) ? m : epochFrom;
  };
  const endEpoch = (at: number, reason?: string) => {
    closePhases(at);
    epochEnd.set(epoch, at);
    active = false;
    gap = { at, reason };
  };
  for (const e of events) {
    const at = t(e.ts);
    if (!ok(at)) continue;
    const data = (e.data ?? {}) as Record<string, unknown>;
    if (e.kind === 'task.start' || e.kind === 'task.resumed') {
      if (active) endEpoch(lastActivity(at), 'interrupted');
      if (gap) {
        if (at > gap.at) pauses.push({ start: gap.at, end: at, reason: gap.reason });
        gap = undefined;
      }
      if (e.kind === 'task.start') {
        epoch += 1;
        active = true;
        epochFrom = at;
      }
    } else if (e.kind === 'task.paused' || e.kind === 'task.done' || e.kind === 'task.failed' || e.kind === 'task.cancelled') {
      const reason = e.kind === 'task.paused' ? /\((\w+)\)/.exec(e.msg)?.[1] : e.kind.slice(5);
      if (active) endEpoch(at, reason);
      else gap = { at: gap?.at ?? at, reason };
    } else if (e.kind === 'call.start' && typeof data.callId === 'string') starts.set(data.callId, { at, e, epoch });
    else if (e.kind === 'phase' && e.department && e.phase) {
      // các phòng chạy lần lượt: pha mới của một phòng cũng khép pha còn mở của phòng trước
      closePhases(at);
      openPhase.set(e.department, { phase: e.phase as Phase, start: at });
    } else if ((e.kind === 'checks.run' || e.kind === 'checks.setup') && Array.isArray(data.results)) {
      // lệnh chạy lần lượt → thời lượng = tổng; lệnh chuẩn bị của dự án (nếu vừa chạy) nằm ngay trước lệnh kiểm tra
      const res = data.results as Array<{ ok?: boolean; ms?: number }>;
      const ms = res.reduce((n, r) => n + (Number(r.ms) || 0), 0);
      const setupMs = Number(data.setupMs) || 0;
      const lane = laneFor(e.department, e.subtaskId);
      const when = String(data.when ?? '');
      const label = e.kind === 'checks.setup' ? 'chuẩn bị worktree con' : when === 'baseline' ? 'kiểm tra trước khi sửa' : when === 'execute' ? 'kiểm tra sau thực thi' : 'kiểm tra sau vòng sửa';
      if (setupMs) lane?.bars.push({ start: at - ms - setupMs, end: at - ms, phase: 'setup', label: 'lệnh chuẩn bị' });
      lane?.bars.push({ start: at - ms, end: at, phase: e.kind === 'checks.setup' ? 'setup' : 'checks', label, error: res.some((r) => r.ok === false) || undefined });
    } else if (e.kind === 'workspace.merge' && e.subtaskId && e.level === 'info') laneFor(e.department, e.subtaskId)?.merges.push(at);
    if (active) lastSeen = Math.max(lastSeen, at);
  }
  // nhiệm vụ không còn chạy mà đợt cuối chưa có sự kiện kết thúc = server khởi động lại giữa chừng (store đánh dấu tạm dừng)
  if (active && !live) endEpoch(lastActivity(Infinity), task.pause?.reason ?? 'interrupted');
  // đang tạm dừng: khoảng dừng kéo tới bây giờ (nhiệm vụ đã xong/lỗi/hủy thì không tính phần sau)
  if (gap && task.status === 'paused') pauses.push({ start: gap.at, end: Math.max(gap.at, now), reason: gap.reason ?? task.pause?.reason });
  for (const [d, p] of openPhase) phases.push({ department: d, phase: p.phase, start: p.start, end: live ? now : p.start });
  // lượt gọi đã bắt đầu mà chưa có bản ghi xong: đang chạy (chỉ ở đợt đang chạy) hoặc bị ngắt (đợt trước / nhiệm vụ đã dừng)
  for (const [callId, { at, e, epoch: ep }] of starts) {
    if (done.has(callId)) continue;
    const lane = laneFor(e.department, e.subtaskId);
    const running = live && active && ep === epoch;
    const end = running ? now : Math.max(at, epochEnd.get(ep) ?? at);
    lane?.bars.push({ start: at, end, phase: (e.phase as Phase) ?? 'execute', agentId: e.agentId, open: running || undefined, error: !running || undefined });
  }

  for (const l of lanes.values()) l.bars.sort((a, b) => a.start - b.start);
  const all = [...lanes.values()].flatMap((l) => l.bars.map((b) => [b.start, b.end] as [number, number]));
  const start = Math.min(t(task.startedAt ?? task.createdAt), ...all.map((x) => x[0]), ...phases.map((p) => p.start));
  const endCands = [...all.map((x) => x[1]), ...phases.map((p) => p.end), ...pauses.map((p) => p.end), t(task.finishedAt)].filter(ok);
  const end = live ? Math.max(now, ...endCands) : Math.max(start, ...endCands);

  // 3) sẵn sàng lúc nào + đường găng theo từng phòng
  // chỉ tính lượt thực thi: lượt sửa theo review chạy sau, không làm hạng mục phụ thuộc phải chờ
  const execOf = (l?: TimelineLane) => (l ? l.bars.filter((b) => b.phase === 'execute') : []);
  const endOf = (l?: TimelineLane) => {
    const b = execOf(l);
    return b.length ? Math.max(...b.map((x) => x.end)) : NaN;
  };
  const critical: string[] = [];
  let critMs = 0;
  for (const r of task.runs) {
    const subs = r.subtasks.map((s) => lanes.get(`${r.department}|${s.id}`)!).filter(Boolean);
    for (const l of subs) {
      const deps = l.dependsOn.map((d) => endOf(lanes.get(`${r.department}|${d}`))).filter(ok);
      if (deps.length) l.readyAt = Math.max(...deps);
    }
    let cur = subs.filter((l) => ok(endOf(l))).sort((a, b) => endOf(b) - endOf(a))[0];
    const chain: TimelineLane[] = [];
    const seen = new Set<string>();
    while (cur && !seen.has(cur.key)) {
      seen.add(cur.key);
      chain.unshift(cur);
      cur = cur.dependsOn
        .map((d) => lanes.get(`${r.department}|${d}`))
        .filter((x): x is TimelineLane => !!x && ok(endOf(x)))
        .sort((a, b) => endOf(b) - endOf(a))[0];
    }
    if (chain.length) {
      for (const l of chain) l.critical = true;
      critical.push(...chain.map((l) => l.key));
      const first = Math.min(...execOf(chain[0]).map((b) => b.start));
      critMs += endOf(chain.at(-1)) - first;
    }
  }

  const pausedMs = unionMs(pauses.map((p) => [Math.max(p.start, start), Math.min(p.end, end)]));
  const execBars = [...lanes.values()].filter((l) => l.subtask).flatMap((l) => l.bars.filter((b) => b.phase === 'execute' || b.phase === 'revise').map((b) => [b.start, b.end] as [number, number]));
  const orderedLanes = [...lanes.values()].filter((l) => l.bars.length || l.subtask);
  // làn điều phối của phòng lên đầu phòng; phòng theo thứ tự chạy
  const deptOrder = new Map(task.runs.map((r, i) => [r.department, i]));
  orderedLanes.sort((a, b) => (deptOrder.get(a.department) ?? -1) - (deptOrder.get(b.department) ?? -1) || Number(!!a.subtask) - Number(!!b.subtask));
  if (!multi) for (const l of orderedLanes) if (!l.subtask && l.department !== '_') l.title = 'Lập kế hoạch · họp · review · tổng hợp';
  return {
    start,
    end,
    now,
    live,
    lanes: orderedLanes,
    phases: phases.filter((p) => p.end > p.start).sort((a, b) => a.start - b.start),
    pauses,
    critical: { lanes: critical, ms: critMs },
    stats: {
      wallMs: Math.max(0, end - start),
      pausedMs,
      busyMs: unionMs(all),
      executeMs: unionMs(execBars),
      maxParallel: maxOverlap(execBars),
      calls: calls.length,
    },
  };
}
