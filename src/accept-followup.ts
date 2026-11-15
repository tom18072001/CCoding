import type { AcceptResult } from './planner.js';
import type { TaskStatus } from './types.js';

/** Tiêu chí chưa đạt kèm phân loại phạm vi (thiếu scope = decision). */
type Criterion = AcceptResult['criteria'][number];

export interface FollowupInput {
  acceptance: Pick<AcceptResult, 'parsed' | 'criteria'> & { error?: string };
  /** Số vòng bổ sung đã mở (task.acceptFollowups). */
  roundsDone: number;
  /** defaults.acceptFollowupRounds; 0 = tắt. */
  maxRounds: number;
  budgetLeft: number;
  /** Ước lượng token của kế hoạch bổ sung. */
  estimate: number;
  taskStatus: TaskStatus;
  aborted: boolean;
}

export interface FollowupDecision {
  open: boolean;
  /** Tiêu chí chưa đạt, phòng tự làm được. */
  inScope: Criterion[];
  /** Tiêu chí chưa đạt cần quyết định của giám đốc/người ngoài (gồm cả tiêu chí thiếu scope). */
  decision: Criterion[];
  reason: string;
}

/** Tách tiêu chí chưa đạt theo phạm vi và quyết định có mở vòng bổ sung hay không. Hàm thuần, không I/O. */
export function followupDecision(i: FollowupInput): FollowupDecision {
  const unmet = i.acceptance.criteria.filter((c) => c.result !== 'pass');
  const inScope = unmet.filter((c) => c.scope === 'in');
  const decision = unmet.filter((c) => c.scope !== 'in');
  const no = (reason: string): FollowupDecision => ({ open: false, inScope, decision, reason });
  if (i.acceptance.error) return no('Lượt nghiệm thu bị lỗi, không mở vòng bổ sung.');
  if (!i.acceptance.parsed) return no('Không đọc được kết luận nghiệm thu, không mở vòng bổ sung.');
  if (i.maxRounds <= 0) return no('Vòng bổ sung đang tắt (acceptFollowupRounds = 0).');
  if (i.roundsDone >= i.maxRounds) return no(`Đã dùng hết ${i.maxRounds} vòng bổ sung.`);
  if (!inScope.length) return no(decision.length ? 'Các tiêu chí còn lại đều cần quyết định, không có việc trong phạm vi.' : 'Không có tiêu chí chưa đạt trong phạm vi.');
  if (i.taskStatus === 'cancelled' || i.taskStatus === 'paused') return no(`Nhiệm vụ đang ở trạng thái ${i.taskStatus}.`);
  if (i.aborted) return no('Nhiệm vụ đã bị ngắt (abort).');
  if (i.budgetLeft < i.estimate) return no(`Ngân sách còn lại (${i.budgetLeft}) nhỏ hơn ước lượng vòng bổ sung (${i.estimate}).`);
  return { open: true, inScope, decision, reason: `Mở vòng bổ sung cho ${inScope.length} tiêu chí trong phạm vi.` };
}

/** Bảng Markdown các tiêu chí chưa đạt (tên, kết quả, bằng chứng, scope) làm đầu vào cho trưởng phòng. */
export function criteriaTable(criteria: Criterion[]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const rows = criteria.map((c) => `| ${cell(c.name)} | ${c.result} | ${cell(c.evidence) || '—'} | ${c.scope ?? 'decision'} |`);
  return ['| Tiêu chí | Kết quả | Bằng chứng | Phạm vi |', '|---|---|---|---|', ...rows].join('\n');
}
