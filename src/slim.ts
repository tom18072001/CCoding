/**
 * B-11 — công tắc "làm gọn làn đơn" (`lanes.single.slim`). Hợp đồng chung cho S1 (promptDiet/compactTemplate) và S2 (accept).
 * Thứ tự gộp: SLIM_DEFAULTS < config.lanes.single.slim < ProjectDef.slim < task.options.slim. Khóa sai kiểu/giá trị lạ bị bỏ.
 */
import type { Config } from './config.js';
import type { ProjectDef, TaskOptions } from './types.js';

export type AcceptMode = 'full' | 'brief' | 'skip';

export interface Slim {
  /** Nghiệm thu CTO ở làn đơn: full (như cũ) | brief (bảng tiêu chí ngắn) | skip (bỏ khi đủ điều kiện, nếu không lùi về brief). */
  accept: AcceptMode;
  /** Báo cáo gọn: vẫn đủ mọi tiêu đề của "Mẫu đầu ra", mỗi mục 1–3 dòng. */
  compactTemplate: boolean;
  /** Bỏ khỏi prompt thực thi làn đơn các phần chỉ dành cho đa-agent. */
  promptDiet: boolean;
}

export const SLIM_DEFAULTS: Slim = { accept: 'full', compactTemplate: false, promptDiet: true };

const ACCEPT_MODES: readonly string[] = ['full', 'brief', 'skip'];

/** Chỉ giữ khóa đúng kiểu và giá trị hợp lệ; đầu vào không phải object → {}. */
export function sanitizeSlim(raw: unknown): Partial<Slim> {
  const out: Partial<Slim> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  if (typeof o.accept === 'string' && ACCEPT_MODES.includes(o.accept)) out.accept = o.accept as AcceptMode;
  if (typeof o.compactTemplate === 'boolean') out.compactTemplate = o.compactTemplate;
  if (typeof o.promptDiet === 'boolean') out.promptDiet = o.promptDiet;
  return out;
}

export function resolveSlim(
  config?: Pick<Config, 'lanes'> | { lanes?: { single?: { slim?: unknown } } },
  project?: Pick<ProjectDef, 'slim'> | { slim?: unknown },
  options?: Pick<TaskOptions, 'slim'> | { slim?: unknown },
): Slim {
  return {
    ...SLIM_DEFAULTS,
    ...sanitizeSlim(config?.lanes?.single?.slim),
    ...sanitizeSlim(project?.slim),
    ...sanitizeSlim(options?.slim),
  };
}
