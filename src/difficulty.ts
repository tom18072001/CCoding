import type { LaneSignals } from './lane.js';

/** B-17: ngưỡng chấm độ khó (đủ ngưỡng thì cộng 1 điểm). Hàm thuần, tất định, không gọi LLM. */
export const DIFFICULTY_THRESHOLDS = { parts: 3, filesTouched: 4, briefChars: 2000, repoFiles: 150, repoBytes: 750_000 } as const;

export type DifficultyLevel = 1 | 2 | 3;

/**
 * Độ khó 1–3 từ LaneSignals: 0 điểm → 1; 1–2 điểm → 2; ≥ 3 điểm → 3. Không có tín hiệu → 2 (mặc định).
 * Điểm: parts ≥ 3, filesTouched ≥ 4, briefChars ≥ 2000, repoFiles ≥ 150, repoBytes ≥ 750 000 (mỗi tín hiệu +1). Chuỗi tuần tự trừ 1 (không song song hóa được nên kế hoạch đơn giản).
 */
export function scoreDifficulty(s: LaneSignals | undefined): { level: DifficultyLevel; points: number; reason: string } {
  if (!s) return { level: 2, points: 0, reason: 'không có tín hiệu — dùng mức 2' };
  const t = DIFFICULTY_THRESHOLDS;
  const hit = [s.parts >= t.parts && 'parts', s.filesTouched >= t.filesTouched && 'filesTouched', s.briefChars >= t.briefChars && 'briefChars', s.repoFiles >= t.repoFiles && 'repoFiles', s.repoBytes >= t.repoBytes && 'repoBytes'].filter(Boolean) as string[];
  const points = Math.max(0, hit.length - (s.sequential ? 1 : 0));
  const level: DifficultyLevel = points === 0 ? 1 : points >= 3 ? 3 : 2;
  return { level, points, reason: `${points} điểm${hit.length ? ` (${hit.join(', ')})` : ''}${s.sequential ? ', tuần tự −1' : ''}` };
}

/** Mức → model theo cấu hình; mức không khai báo trả undefined (giữ model hiện hành của pha plan). */
export function modelForDifficulty(level: DifficultyLevel, models: { 1?: string; 2?: string; 3?: string } | undefined): string | undefined {
  const m = models?.[level];
  return m && m.trim() ? m.trim() : undefined;
}
