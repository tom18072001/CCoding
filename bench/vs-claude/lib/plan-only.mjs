// E9-lite (BRIEF-D19 K2): arm chỉ lập kế hoạch (P-H/P-S/P-O). Hàm thuần để test; không chấm điểm, không gọi judge.
import crypto from 'node:crypto';

/** Arm chạy CCoding với options.planOnly: true. */
export const isPlanOnlyArm = (spec) => spec?.kind === 'ccoding' && spec?.options?.planOnly === true;

/** Xáo tất định theo seed (cùng thuật toán với run.mjs cũ: băm chuỗi sha256 liên tiếp). */
export function shuffled(arr, seed) {
  const a = [...arr]; let h = crypto.createHash('sha256').update(seed).digest();
  for (let i = a.length - 1; i > 0; i--) { h = crypto.createHash('sha256').update(h).digest(); const j = h.readUInt32BE(0) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Lịch xáo theo khối bài: thứ tự bài xáo theo seed; trong mỗi bài, các cặp arm×rep xáo theo seed + bài.
 * Mỗi bài là một khối liền nhau (các arm/lần lặp của cùng bài không bị xen với bài khác).
 */
export function planOnlySchedule(taskIds, armIds, repeats, seed) {
  const out = [];
  for (const task of shuffled(taskIds, `${seed}/tasks`)) {
    const pairs = [];
    for (let rep = 1; rep <= repeats; rep++) for (const arm of armIds) pairs.push({ arm, rep });
    for (const p of shuffled(pairs, `${seed}/block/${task}`)) out.push({ task, arm: p.arm, rep: p.rep, key: `${task}__${p.arm}__r${p.rep}` });
  }
  return out;
}

const EXTS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'md', 'py', 'sh', 'css', 'html', 'yml', 'yaml', 'toml', 'txt', 'csv', 'sql', 'go', 'rs', 'java', 'rb', 'c', 'h', 'cpp', 'xml', 'ini', 'cfg', 'lock']);
const NOT_FILES = new Set(['node.js', 'vue.js', 'next.js', 'express.js', 'react.js', 'd3.js']);

/** Tệp nêu trong mô tả hạng mục: chuỗi dạng `a/b/c.ext` hoặc `c.ext` với đuôi thông dụng; bỏ URL, trùng; giữ thứ tự xuất hiện. */
export function extractFiles(description) {
  const text = String(description ?? '').replace(/https?:\/\/\S+/g, ' ');
  const seen = new Set(); const out = [];
  for (const m of text.matchAll(/(?<![\w./-])((?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@-][\w@.-]*\.([A-Za-z][A-Za-z0-9]{0,4}))(?![\w-])/g)) {
    const f = m[1].replace(/^\.\//, '');
    if (!EXTS.has(m[2].toLowerCase()) || NOT_FILES.has(f.toLowerCase()) || seen.has(f)) continue;
    seen.add(f); out.push(f);
  }
  return out;
}

/** Rút gọn kế hoạch: {id, title, assignee, dependsOn, files}. Không phải mảng → null. */
export function slimPlan(items) {
  if (!Array.isArray(items)) return null;
  return items.map((x) => ({ id: x?.id ?? null, title: x?.title ?? null, assignee: x?.assignee ?? null, dependsOn: Array.isArray(x?.dependsOn) ? [...x.dependsOn] : [], files: extractFiles(x?.description) }));
}

/** Mã băm cấu hình của arm (sha256 hex, 16 ký tự đầu): spec arm + seed + runtime. Không chứa bí mật. */
export function configHash(spec, extra = {}) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(canon({ spec, ...extra }))).digest('hex').slice(0, 16);
}

/** Model thật của lượt plan khớp với planModel của arm? Khớp khi tên model thật chứa 'haiku'|'sonnet'|'opus' đúng của arm (mock-haiku, claude-haiku-… đều khớp). */
export const planModelMatches = (armModel, actual) => !!armModel && !!actual && String(actual).toLowerCase().includes(String(armModel).toLowerCase());

/**
 * Dòng runs.jsonl của một lượt planOnly. KHÔNG có score/pass. r: kết quả runCcoding (r.plan = run planOnly của task.json).
 * Model lệch hoặc thiếu kế hoạch ⇒ status 'error' kèm `error` (lượt chạy lại khi chạy tiếp, nhãn arm không được sai).
 */
export function planOnlyRow({ s, spec, r, meta, runtime, seed, at = new Date().toISOString() }) {
  const p = r?.plan ?? null;
  const armModel = spec.options?.planModel ?? null;
  const actual = p?.planModel ?? r?.research?.byPhaseModel?.plan?.[0] ?? null;
  const match = planModelMatches(armModel, actual);
  let error = r?.error ?? null;
  if (!error && r?.status === 'done' && !p) error = 'task.json không có run planOnly (engine chưa hỗ trợ planOnly?)';
  else if (!error && r?.status === 'done' && !match) error = `model thật của lượt plan (${actual ?? 'không rõ'}) không khớp planModel của arm (${armModel})`;
  const status = error ? 'error' : r?.status ?? 'failed';
  return {
    key: s.key, task: s.task, arm: s.arm, rep: s.rep, at, status, planOnly: true, ...(error ? { error: String(error).slice(0, 300) } : {}),
    planRaw: slimPlan(p?.planRaw), planFinal: slimPlan(p?.planFinal), planGate: p?.planGate ?? null, replanCount: p?.planReplans ?? null,
    usage: { tokens: r?.tokens ?? null, byPhase: r?.byPhase ?? {}, calls: r?.calls ?? 0 },
    planModel: { arm: armModel, actual, source: p?.planModelSource ?? null, match },
    authSource: p?.authSource ?? r?.authSource ?? (runtime === 'mock' ? 'mock' : null),
    configHash: configHash(spec, { runtime, seed }),
    ccodingCommit: meta.ccodingCommit ?? null, claudeCliVersion: meta.claudeCliVersion ?? null,
    window: meta.window ?? null, quotaState: meta.quotaState ?? null, timeoutMin: meta.timeoutMin, wallSec: r?.wallSec ?? null,
  };
}
