import type { CheckResult, Classification } from './types.js';
import { headingKey, templateCoverage, templateHeadings } from './kpi.js';
import { git } from './git.js';

/**
 * B-02 — Cổng chất lượng (backlog §4). Các hàm thuần, không gọi LLM; Orchestrator nối vào vòng review/sửa.
 *
 * Chữ ký chính thức cho luồng ngoài (làn đơn của S4): `Orchestrator.runQualityGate(task, run, project, agent, opts)` → `QualityGateResult`.
 * Log kind: 'gate.classify' · 'gate.fix' · 'gate.template' · 'gate.review'.
 */

export type CheckClass = 'regression-or-new' | 'red-required' | 'red-unrelated' | 'green';

export interface ClassifiedCheck {
  command: string;
  cls: CheckClass;
}

/** Đề bài nhắc lệnh: so khớp chuỗi tên lệnh trong brief (kể cả trong dấu `), không phân biệt hoa thường. */
export function briefMentions(brief: string, command: string): boolean {
  const c = command.trim().toLowerCase();
  return !!c && brief.toLowerCase().includes(c);
}

/**
 * §4.1 bước 2 — xếp từng lệnh kiểm tra sau thực thi vào một trong bốn nhánh rời nhau.
 * - xanh ở lần mới nhất → 'green'
 * - đỏ mà baseline xanh (hồi quy) hoặc không có baseline (đỏ mới) → 'regression-or-new'
 * - đỏ → đỏ và brief nhắc tên lệnh → 'red-required'; không nhắc → 'red-unrelated'
 * Lệnh bị chặn theo chính sách (denied) không có bằng chứng nên coi như 'red-unrelated' (buộc gọi reviewer).
 */
export function classifyChecks(baseline: CheckResult[] | undefined, latest: CheckResult[] | undefined, brief: string, checkCommands: string[] = []): ClassifiedCheck[] {
  const names = checkCommands.length ? checkCommands : (latest ?? []).map((r) => r.command);
  return names.map((command) => {
    const now = latest?.find((r) => r.command === command);
    if (!now) return { command, cls: 'red-unrelated' as const };
    if (now.ok) return { command, cls: 'green' as const };
    if (now.denied) return { command, cls: 'red-unrelated' as const };
    const before = baseline?.find((r) => r.command === command);
    if (!before || before.ok) return { command, cls: 'regression-or-new' as const };
    return { command, cls: briefMentions(brief, command) ? ('red-required' as const) : ('red-unrelated' as const) };
  });
}

export interface TemplateGateResult {
  ok: boolean;
  coverage: number;
  missing: string[];
  summaryOk: boolean;
}

/** Dòng nội dung (không rỗng, không phải tiêu đề) ngay dưới tiêu đề — tiêu đề "đệm" không có nội dung coi như thiếu. */
function hasBody(text: string, key: string): boolean {
  const lines = text.split('\n');
  const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[`*_#:]/g, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < lines.length; i++) {
    if (!/^#{1,4}\s+/.test(lines[i])) continue;
    const t = norm(lines[i].replace(/^#{1,4}\s+/, ''));
    if (!(t.startsWith(key) || t.includes(key))) continue;
    for (let j = i + 1; j < lines.length && !/^#{1,4}\s+/.test(lines[j]); j++) if (lines[j].trim() && !/^[-*_]{3,}$/.test(lines[j].trim())) return true;
  }
  return false;
}

/** §4.2 — cùng phép kiểm với KPI (templateHeadings/templateCoverage/headingKey, regex "Tóm tắt" của kpi.ts) + tiêu đề phải có nội dung. */
export function templateGate(text: string, agentBody: string): TemplateGateResult {
  const headings = templateHeadings(agentBody);
  const cov = templateCoverage(text, headings);
  const empty = headings.filter((h) => {
    if (cov.missing.includes(h)) return false;
    const k = headingKey(h);
    return k.length > 2 && !hasBody(text, k);
  });
  const missing = [...cov.missing, ...empty];
  const coverage = headings.length ? (headings.length - missing.length) / headings.length : 1;
  const summaryOk = /^#{1,3}\s*Tóm tắt/im.test(text);
  return { ok: coverage === 1 && summaryOk, coverage, missing, summaryOk };
}

/** §4.3 — đường dẫn chạm bảo mật/dữ liệu (so khớp trên đường dẫn dùng dấu /). */
const SENSITIVE: RegExp[] = [/^src\/tools\//, /^src\/runtimes\//, /^src\/kpi\.ts$/, /^src\/store\.ts$/, /(^|\/)\.env/, /^data\//, /^agents\//, /(^|\/)(ccoding\.)?config[^/]*$/i];

export function sensitivePaths(files: string[]): string[] {
  return files.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, '')).filter((f) => SENSITIVE.some((re) => re.test(f)));
}

export interface ReviewerNeed {
  hasCheckCommands: boolean;
  changedFiles: string[];
  classification?: Classification;
  classes: CheckClass[];
  /** Hết N vòng sửa mà cổng (lệnh hoặc mẫu) vẫn chưa đạt. */
  failedAfterRounds?: boolean;
}

/** §4.3 — true nếu phải gọi reviewer; `reasons` để ghi log. */
export function needsReviewer(n: ReviewerNeed): boolean {
  return reviewerReasons(n).length > 0;
}

export function reviewerReasons(n: ReviewerNeed): string[] {
  const r: string[] = [];
  if (!n.hasCheckCommands) r.push('dự án không có checkCommands');
  const sens = sensitivePaths(n.changedFiles);
  if (sens.length) r.push(`diff chạm vùng bảo mật/dữ liệu: ${sens.slice(0, 4).join(', ')}`);
  if (n.classification === 'confidential' || n.classification === 'restricted') r.push(`nhãn dữ liệu ${n.classification}`);
  if (n.classes.includes('red-unrelated')) r.push('có lệnh đỏ kéo dài không liên quan đề bài');
  if (n.failedAfterRounds) r.push('chưa đạt sau các vòng sửa');
  return r;
}

/** Tệp thay đổi so với baseRef (gồm tệp mới chưa theo dõi). */
export function changedFiles(workspace: string | undefined, baseRef?: string): string[] {
  if (!workspace) return [];
  git(workspace, ['add', '-A', '--intent-to-add'], 30_000);
  const r = git(workspace, ['diff', '--name-only', baseRef ?? 'HEAD'], 30_000);
  return r.ok && r.out ? r.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

export interface QualityGateOptions {
  /** Phòng đang chạy (để ghi log/tin hệ thống). */
  dept: string;
  /** Hạng mục để giao vòng sửa (mặc định: hạng mục done cuối cùng do người có quyền ghi phụ trách). */
  target?: string;
  /** Bỏ qua kiểm mẫu đầu ra (vd. báo cáo dựng từ mẫu). */
  skipTemplate?: boolean;
}

export interface QualityGateResult {
  /** Còn lệnh 'red-required' đỏ ⇒ cấm approved. */
  forceUnapproved: boolean;
  /** Lệnh đề bài đòi xanh mà còn đỏ. */
  stillRed: string[];
  classes: ClassifiedCheck[];
  fixRounds: number;
  templateOk: boolean;
  /** Cần gọi reviewer (§4.3). */
  needReviewer: boolean;
  reasons: string[];
  /** Hết N vòng sửa mà còn đỏ/lệch mẫu — người gọi (làn đơn) nâng lên multi-agent (§3.3). */
  exhausted: boolean;
}
