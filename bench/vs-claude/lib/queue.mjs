// Hàng đợi của runner: lượt nào đã xong, lane nào CCoding hỗ trợ, và kiểm arm trước khi gửi task. Hàm thuần để test.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const EXIT_RATE_LIMIT = 3;

/** Dòng infra (hạn mức, lỗi hạ tầng) không phải kết quả của arm: lượt đó phải chạy lại. */
export const isDoneRow = (row) => row.status === 'done' || !!row.excluded; // SR-01a: failed/error/infra phải chạy lại; khóa bị loại thì không

export function doneKeys(runsText) {
  const keys = new Set();
  for (const l of String(runsText).split('\n')) {
    if (!l.trim()) continue;
    let row;
    try { row = JSON.parse(l); } catch { continue; }
    if (row.key && isDoneRow(row)) keys.add(row.key);
  }
  return keys;
}

/** Các giá trị lane mà CCoding hiểu, đọc từ union `lane?:` trong TaskOptions (src/types.ts hoặc dist/types.d.ts). */
export function supportedLanes(repoRoot) {
  for (const f of ['src/types.ts', 'dist/types.d.ts']) {
    const p = path.join(repoRoot, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^\s*lane\?:\s*((?:'[\w-]+'\s*\|?\s*)+);/m);
    if (m) return [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
  }
  return [];
}

/** B-12: tên bài của một bộ trong arms.json `_suites` (khớp tiền tố trong kinds), theo thứ tự tên. Bộ lạ → ném lỗi. */
export function suiteTaskIds(suites, name, allTasks) {
  const s = suites?.[name];
  if (!s?.kinds) throw new Error(`Không có bộ bài "${name}". Có: ${Object.keys(suites ?? {}).filter((k) => !k.startsWith('_')).join(', ') || '(không)'}`);
  const prefixes = Object.values(s.kinds).flatMap((k) => k.prefixes ?? []);
  return allTasks.filter((t) => prefixes.some((p) => t.startsWith(p)));
}

/** Trả về danh sách lỗi (rỗng nếu ổn). Không tự lùi sang lane khác. */
export function checkArms(armIds, arms, lanes) {
  const errs = [];
  for (const id of armIds) {
    const lane = arms[id]?.options?.lane;
    if (arms[id]?.kind === 'ccoding' && lane && !lanes.includes(lane)) {
      errs.push(`Arm ${id} cần lane '${lane}'${arms[id].pending ? ` (${arms[id].pending})` : ''} — CCoding hiện chưa hỗ trợ`);
    }
  }
  return errs;
}

// ---------- SR-01: lượt xong, lượt bị loại, lượt thay ----------

function parseRows(runsText) {
  const rows = [];
  for (const l of String(runsText).split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); if (r?.key) rows.push(r); } catch { /* bỏ dòng hỏng */ }
  }
  return rows;
}

/**
 * Phân loại một lượt đã chạy xong (không phải infra) thành { failReason, excluded } theo D1 / preregistration §4.3.
 * failReason ∈ quota|timeout|error|null (chỉ khi không done). excluded ∈ quota|leak|timeout|null.
 * Timeout do hệ không xong thì GIỮ (excluded null); chỉ timeout kèm chứng cứ hạ tầng mới bị loại.
 */
export function classifyRun(r, { timeoutMin, error, infraTimeout = false } = {}) {
  const status = error ? 'error' : r?.status;
  let failReason = null;
  if (status !== 'done') {
    const timedOut = !!r?.timedOut || (status === 'failed' && timeoutMin > 0 && (r?.wallSec ?? 0) >= 0.98 * timeoutMin * 60);
    failReason = r?.infra === 'rate-limit' ? 'quota' : timedOut ? 'timeout' : 'error';
  }
  const excluded = failReason === 'quota' ? 'quota' : r?.leak ? 'leak' : failReason === 'timeout' && infraTimeout ? 'timeout' : null;
  return { failReason, excluded };
}

/** Lượt xong khi status === 'done' HOẶC bị loại (excluded): khóa bị loại không chạy lại, chỗ của nó do lượt thay. */
export function isFinishedRow(row) {
  return row.status === 'done' || !!row.excluded;
}

/**
 * Lượt cần chạy thêm ngoài `repeats` mặc định cho các ô (task × arm): (1) khóa rep > repeats đã có nhưng chưa xong;
 * (2) lượt thay cho mỗi khóa bị loại chưa có thay, nhận rep = max(rep của ô) + 1.
 */
export function replacementRuns(runsText, repeats, cells) {
  const rows = parseRows(runsText);
  const out = [];
  for (const { task, arm } of cells) {
    const mine = rows.filter((r) => r.task === task && r.arm === arm);
    if (!mine.length) continue;
    const excluded = new Set(mine.filter((r) => r.excluded).map((r) => r.key));
    const extra = new Map();
    for (const r of mine) if (r.rep > repeats) extra.set(r.key, Math.max(extra.get(r.key) ?? 0, r.rep));
    let maxRep = Math.max(repeats, ...mine.map((r) => r.rep ?? 0));
    for (const rep of extra.values()) if (!doneKeys(runsText).has(`${task}__${arm}__r${rep}`)) out.push({ task, arm, rep });
    for (let k = excluded.size - extra.size; k > 0; k--) out.push({ task, arm, rep: ++maxRep });
  }
  return out;
}

// ---------- SR-23: bảng Latin thật ----------

/** Các thứ tự arm cho k arm: bảng Latin cân bằng bậc nhất (Williams); k lẻ thì thêm bản đảo → 2k hàng. Mỗi arm đứng mỗi vị trí đều nhau, mỗi cặp liền kề đều nhau. */
export function latinOrders(k) {
  if (k <= 1) return [[0]];
  const first = [0]; let lo = 1, hi = k - 1;
  while (first.length < k) { first.push(lo++); if (first.length < k) first.push(hi--); }
  const rows = Array.from({ length: k }, (_, i) => first.map((x) => (x + i) % k));
  return k % 2 ? [...rows, ...rows.map((r) => [...r].reverse())] : rows;
}

// ---------- SR-21: dò rò rỉ chỉ trên đường dẫn và tham số công cụ ----------

/** needles: danh sách chuỗi bộ đo (đường dẫn suite, hidden/…). Chỉ xét tool_use của transcript stream-json; dòng không phải JSON thì xét nguyên dòng. */
export function leakInTranscript(lines, needles) {
  const hit = (s) => needles.some((n) => String(s).includes(n));
  return lines.some((l) => {
    let ev; try { ev = JSON.parse(l); } catch { return hit(l); }
    if (ev?.type !== 'assistant') return false; // system/init, user tool_result, result: không phải thao tác của agent
    return (ev.message?.content ?? []).some((b) => b?.type === 'tool_use' && hit(JSON.stringify(b.input ?? {})));
  });
}

/** calls.jsonl của CCoding: chỉ xét `tools` (thao tác công cụ), không xét `text`/prompt hệ thống. */
export function leakInCalls(callsText, needles) {
  const hit = (s) => needles.some((n) => String(s).includes(n));
  return String(callsText).split('\n').some((l) => {
    if (!l.trim()) return false;
    let c; try { c = JSON.parse(l); } catch { return hit(l); }
    return c.tools ? hit(JSON.stringify(c.tools)) : false;
  });
}

// ---------- SR-03 / SR-19: nguồn gốc của từng dòng runs.jsonl (hợp đồng D1) ----------

/** Hash commit CCoding đang chạy (git rev-parse HEAD); không lấy được ⇒ null, không điền giả. Gọi một lần lúc khởi động. */
export function gitCommit(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 && /^[0-9a-f]{7,64}$/.test(r.stdout.trim()) ? r.stdout.trim() : null;
}

/** Phiên bản CLI: dòng đầu của `<bin> --version`; lỗi/không có ⇒ null. prefixArgs dùng cho bin giả trong test (node script.mjs). */
export function cliVersion(bin, prefixArgs = []) {
  const shell = process.platform === 'win32' && /\.(cmd|bat)$|^[^\\/.]+$/i.test(bin);
  const r = spawnSync(bin, [...prefixArgs, '--version'], { encoding: 'utf8', timeout: 15000, shell });
  const v = r.status === 0 ? String(r.stdout).split(/\r?\n/).find((l) => l.trim()) : null;
  return v ? v.trim() : null;
}

/** models theo pha (D1): CCoding lấy từ byPhaseModel (nhiều model trong một pha ⇒ nối bằng '+'); arm claude ghi model thực của phiên vào pha exec. Không biết ⇒ {}. */
export function modelsOf(spec, r) {
  const by = r?.research?.byPhaseModel;
  if (spec?.kind === 'ccoding' && by) return Object.fromEntries(Object.entries(by).map(([ph, m]) => [ph, Array.isArray(m) ? m.join('+') : String(m)]));
  return r?.model ? { exec: r.model } : {};
}

/** Các trường nguồn gốc chép vào mỗi dòng. quotaState: giá trị người vận hành khai (--quota-state), dòng hạn mức tự ghi 'rate-limited'. */
export function provenance(meta, spec, r, { quotaState } = {}) {
  return {
    ccodingCommit: meta.ccodingCommit ?? null, claudeCliVersion: meta.claudeCliVersion ?? null, models: modelsOf(spec, r),
    window: meta.window ?? null, quotaState: quotaState ?? meta.quotaState ?? null, timeoutMin: meta.timeoutMin,
  };
}

/** SR-21, bước chọn của A2 (best-of-n): prompt người chọn chỉ được chứa bản giao nộp; có chuỗi của bộ đo (đường dẫn suite, hidden/…) ⇒ true. */
export function leakInSelectorPrompt(prompt, needles) {
  return needles.some((n) => String(prompt).includes(n));
}

/** Chuỗi bộ đo dùng chung cho mọi dò rò rỉ. */
export function leakNeedles(suiteDir, sep) {
  return [suiteDir, `${sep}hidden${sep}`, 'hidden/answer.json', 'hidden/solution', 'checklist.json', 'issues.json'];
}
