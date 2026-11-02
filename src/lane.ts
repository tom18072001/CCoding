/**
 * Chọn làn xử lý theo tín hiệu tính trước (B-01, backlog §3.1) — hàm thuần, không gọi LLM, không đọc đĩa.
 * Giai đoạn 1: quy tắc thứ tự 1–4. Ước lượng T̂_đơn và hệ số k× (giai đoạn 2) chưa dùng ở đây.
 */

export type LaneName = 'single' | 'fast' | 'full';

export interface LaneSignals {
  /** task.brief.length */
  briefChars: number;
  /** Số phần độc lập: mục đánh số/gạch đầu dòng cấp cao nhất, hoặc số module/phần/tầng được nêu tên hoặc nêu bằng số. */
  parts: number;
  /** Số đường dẫn trong đề bài (khớp git ls-files hoặc dạng `thư-mục/tệp.đuôi` sẽ tạo) + số thư mục được nêu. */
  filesTouched: number;
  repoFiles: number;
  repoBytes: number;
  forced?: LaneName;
  /** Dấu hiệu chuỗi phụ thuộc tuần tự (tầng sau dùng đầu ra tầng trước): song song không có ích ⇒ giữ làn đơn. */
  sequential: boolean;
}

export interface LaneConfig {
  fastLane: { maxBriefChars: number; maxRepoFiles: number; maxRepoBytes: number };
  lanes?: { single?: { enabled: boolean; maxParts: number; maxFilesTouched: number } };
}

export interface LaneChoice {
  lane: LaneName;
  /** Quy tắc §3.1 đã quyết định (1–4). */
  rule: 1 | 2 | 3 | 4;
  why: string;
}

const NUM_WORDS: Record<string, number> = {
  hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9, mười: 10,
};
const PART_NOUN = '(?:module|mô-đun|phần|tầng|thành phần|hạng mục|hàm|lớp|thư viện|công cụ|dịch vụ|endpoint|trang)';
const PATH_RE = /(?:[\w.-]+\/)+[\w.-]*\w/g;
const BARE_FILE_RE = /(?<![\w/.-])[\w-]+\.[a-z][a-z0-9]{0,4}(?![\w/-])/gi;

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/[.,;:)]+$/, '');
}

/** Số phần độc lập nêu trong đề bài. */
function countParts(brief: string): number {
  // 1) mục đánh số / gạch đầu dòng ở cấp thụt lề nhỏ nhất
  const items = [...brief.matchAll(/^([ \t]*)(?:\d+[.)]|[-*•])[ \t]+\S/gm)].map((m) => m[1].replace(/\t/g, '    ').length);
  const top = items.length ? items.filter((n) => n === Math.min(...items)).length : 0;
  // 2) "năm module", "5 phần", "bốn tầng"
  let declared = 0;
  const lower = brief.toLowerCase();
  for (const m of lower.matchAll(new RegExp(`(?<![\\p{L}\\d])(\\d{1,2}|${Object.keys(NUM_WORDS).join('|')})\\s+${PART_NOUN}(?![\\p{L}])`, 'gu'))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
    if (n) declared = Math.max(declared, n);
  }
  // 3) module nêu tên trong ngoặc ngay sau "module"/"phần" (money, calendar, …) — chỉ khi liệt kê ≥ 2 mục
  let named = 0;
  for (const m of brief.matchAll(new RegExp(`${PART_NOUN}[^:().\\n]{0,12}(?::|\\()([^)\\n]{3,400})`, 'giu'))) {
    const list = m[1].split(/\s*(?:,|;|\bvà\b)\s*/i).map((s) => s.trim()).filter((s) => /^[\p{L}\d_-]{2,24}$/u.test(s));
    if (list.length >= 2) named = Math.max(named, list.length);
  }
  return Math.max(top, declared, named);
}

/** Số tệp/thư mục được nêu: đường dẫn trong đề bài (khớp ls-files hoặc có dạng thư-mục/tệp.đuôi) + tên tệp trần khớp ls-files + thư mục. */
function countFiles(brief: string, repoFiles: readonly string[]): number {
  const known = new Set(repoFiles.map(norm));
  const dirs = new Set<string>();
  for (const f of known) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const base = new Map<string, number>();
  for (const f of known) base.set(f.split('/').pop()!, (base.get(f.split('/').pop()!) ?? 0) + 1);
  const hit = new Set<string>();
  for (const m of brief.matchAll(PATH_RE)) {
    const p = norm(m[0]);
    if (p.includes('<') || p.includes('>')) continue;
    if (known.has(p) || /\.[a-z][a-z0-9]{0,4}$/i.test(p)) hit.add(p);
    else if (dirs.has(p) || /\/\s*$/.test(m[0])) hit.add(`${p}/`);
  }
  // thư mục viết dạng `test/` hoặc `src/`
  for (const m of brief.matchAll(/(?<![\w/.-])([\w-]+(?:\/[\w-]+)*)\/(?![\w.-])/g)) hit.add(`${norm(m[1])}/`);
  for (const m of brief.matchAll(BARE_FILE_RE)) {
    const p = norm(m[0]);
    if (known.has(p) || base.has(p)) hit.add(p);
  }
  // bỏ tệp trần đã tính qua đường dẫn đầy đủ
  for (const p of [...hit]) if (!p.includes('/') && [...hit].some((q) => q !== p && q.endsWith(`/${p}`))) hit.delete(p);
  return hit.size;
}

/** Chuỗi phụ thuộc tuần tự: tầng sau dùng đầu ra của tầng trước (ĐK-P6, l2-chain). */
function isSequential(brief: string): boolean {
  return /nối tiếp|tuần tự|lần lượt|(?:tầng|bước|giai đoạn)\s+sau\s+dùng|(?:đầu ra|kiểu và đầu ra|đầu vào)\s+(?:của\s+)?(?:tầng|bước|giai đoạn)\s+(?:trước|kia)|(?:pipeline|đường ống)\s+(?:đầu cuối|nối tiếp)|phụ thuộc\s+(?:tuần tự|nối tiếp)/i.test(brief);
}

/** Làn bị ép: options.lane > project.lane > auto. 'auto' hoặc không có = không ép (undefined). */
export function forcedLane(optionsLane?: string, projectLane?: string): LaneName | undefined {
  for (const v of [optionsLane, projectLane]) {
    if (v === 'single' || v === 'fast' || v === 'full') return v;
    if (v === 'auto') return undefined;
  }
  return undefined;
}

export function laneSignals(brief: string, repoFiles: readonly string[], repoBytes: number, forced?: LaneName): LaneSignals {
  return {
    briefChars: brief.length,
    parts: countParts(brief),
    filesTouched: countFiles(brief, repoFiles),
    repoFiles: repoFiles.length,
    repoBytes,
    forced,
    sequential: isSequential(brief),
  };
}

/**
 * Quy tắc 1–4 (§3.1). Việc 'lớn' trả 'full' khi đề/repo vượt ngưỡng làn nhanh (như pickLane trước đây), ngược lại 'fast'.
 * Nếu `lanes.single.enabled` = false thì việc nhỏ cũng đi làn nhanh.
 */
export function chooseLane(s: LaneSignals, cfg: LaneConfig): LaneChoice {
  const single = cfg.lanes?.single ?? { enabled: true, maxParts: 5, maxFilesTouched: 6 };
  if (s.forced) return { lane: s.forced, rule: 1, why: 'theo yêu cầu' };
  const fl = cfg.fastLane;
  if (s.briefChars > fl.maxBriefChars) return { lane: 'full', rule: 2, why: 'đề bài dài' };
  if (s.repoFiles > fl.maxRepoFiles || s.repoBytes > fl.maxRepoBytes) return { lane: 'full', rule: 2, why: 'repo lớn' };
  const small = single.enabled ? 'single' : 'fast';
  const big = s.parts >= single.maxParts ? `${s.parts} phần độc lập` : s.filesTouched >= single.maxFilesTouched ? `${s.filesTouched} tệp/thư mục` : '';
  if (big) {
    if (s.sequential) return { lane: small, rule: 3, why: `${big} nhưng nối tiếp phụ thuộc — song song không có ích` };
    return { lane: 'fast', rule: 3, why: `việc lớn: ${big}` };
  }
  return { lane: small, rule: 4, why: `việc nhỏ: ${s.parts} phần, ${s.filesTouched} tệp/thư mục nêu, repo ${s.repoFiles} tệp` };
}
