#!/usr/bin/env node
// E7b: phân tích theo §9 "Đăng ký trước E7b", Phụ lục (1) và Phụ lục sai lệch E7b (2) (bảng Quy tắc hiệu lực QH1…QH36). Mã QH cố định, ghi cạnh từng luật.
// Chỉ chạy khi đợt E7b đã xong. Chưa có dữ liệu thật hoặc dữ liệu chưa đủ → không in số nào. Kiểm hạ tầng sai (QH35) → chỉ in lỗi kiểm, không in nhãn hay nhánh.
//   node docs/research/analysis/e7b-analyze.mjs --runs bench/vs-claude/results/e7b-cto/run/runs.jsonl \
//        [--items bench/vs-claude/results/e7-cto/items.json] [--selected bench/vs-claude/results/e7-cto/selected.json] \
//        [--sums bench/vs-claude/results/e7b-cto/SHA256SUMS] [--data <--ccoding-data, có w1/w2: chỉ để đối chiếu calls.jsonl>] [--final] [--json]
//   node docs/research/analysis/e7b-analyze.mjs --smoke <runs.jsonl của lượt thử>   (QH34: chỉ trường hạ tầng, không đọc verdict)
// MỘT runs.jsonl của MỘT tiến trình xen kẽ (QH3). Arm trên dòng: R1 → R1b, R2 → R2b. Dùng lại (không sửa) mcnemarExact, latestDone, bootDiff của bench/vs-claude/e7/analyze.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cp } from './g-analyze.mjs';
import { bootDiff, latestDone, mcnemarExact } from '../../../bench/vs-claude/e7/analyze.mjs';

/** Hằng khóa. QH8/QH24 (ngưỡng), QH17/QH18 (Holm, bootstrap), QH20 (minDisc), QH25 (6/128), QH26 (10 %), QH12 (trần), QH21/QH22 (cặp thiếu), QH1 (mẫu). */
export const LOCK = { seed: '20261104', B: 4000, alphaTotal: 0.05, ceilFp: 6 / 64, floorRecall: 58 / 64, maxDrop: 6 / 64, fpRef: 0.1, cappedLimitShare: 6 / 128, minDisc: 10, turns: { R1b: 6, R2b: 16 }, missingMax: 3, missingDiff: 3, nSelected: 128, selectedBlob: '5b3e8fcf', auth: ['none'], missAfterInfra: 3 };
/** QH13 (S1), QH14 (S2), QH15 (S3a: hết giờ như unread không chặn; S3b: hết giờ như unread theo S1, chặn). Không có cặp hết giờ thì S3a trùng chính, S3b trùng S1. */
export const MODES = ['chính', 'S1', 'S2', 'S3a', 'S3b'];
const ARM_OF = { R1: 'R1b', R2: 'R2b' };
const ARMS = ['R1b', 'R2b'];

/** QH17: Holm hai phép. p nhỏ so với α/2, p lớn so với α (bước xuống). Trả p đã hiệu chỉnh (không vượt 1). */
export function holm2(p1, p2, alpha = LOCK.alphaTotal) {
  const order = p1 <= p2 ? [0, 1] : [1, 0];
  const ps = [p1, p2];
  const lo = Math.min(1, 2 * ps[order[0]]);
  const hi = Math.min(1, Math.max(lo, ps[order[1]]));
  const adj = [0, 0]; adj[order[0]] = lo; adj[order[1]] = hi;
  return { adj, alpha };
}

/**
 * QH19/QH20 (P5): nhãn ba giá trị.
 * QH20: số cặp bất đồng < 10 ⇒ "chưa phân biệt được" (p chỉ mô tả).
 * QH19: "khác nhau" = p Holm < α ∧ CI bootstrap không chứa 0 ∧ cùng chiều; "chưa phân biệt được" = cả hai phép không có ý nghĩa;
 *       "chưa kết luận" = một phép có ý nghĩa còn phép kia không, hoặc hai phép ngược chiều.
 */
export function labelOf({ aOnly, bOnly, pAdj, ci }) {
  if (aOnly + bOnly < LOCK.minDisc) return 'chưa phân biệt được';
  const bootSig = Number.isFinite(ci[0]) && (ci[0] > 0 || ci[1] < 0);
  const mcSig = pAdj < LOCK.alphaTotal;
  if (!mcSig && !bootSig) return 'chưa phân biệt được';
  if (mcSig !== bootSig) return 'chưa kết luận';
  const mcDir = Math.sign(bOnly - aOnly); // dương: R2b chặn nhiều hơn
  const bootDir = ci[0] > 0 ? 1 : -1;
  return mcDir === bootDir ? 'khác nhau' : 'chưa kết luận';
}

const verdictBlocked = (v, mode) => v === 'block' || ((mode === 'S1' || mode === 'S3b') && v === 'unparsed'); // QH9, QH13, QH15

/** QH30: luật "hết giờ", ba điều kiện trên dòng infra, theo chuỗi/trường mã thật ghi; không theo nội dung kết luận. Trả 1, 2, 3 hoặc 0 (không tính). */
export function timeoutCond(r) {
  if (!r || r.status !== 'infra' || r.infra === 'rate-limit') return 0;
  const e = String(r.error ?? '');
  if (!e && r.errorKind !== 'timeout') return 0;
  if (/^quá hạn chờ \d+s/.test(e)) return 1; // bench/vs-claude/e7/lib.mjs:262 (harness)
  if (e.includes('Hết thời gian (')) return 2; // src/runtimes/claude-cli.ts:384 (runtime, theo chuỗi)
  if (/^timeout:/.test(e) || r.errorKind === 'timeout') return 3; // errorKind của callErrors/errors.ts (runtime, theo loại lỗi)
  return 0;
}

const eqArr = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const dist = (vals) => {
  const nums = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return { n: nums.length, nNull: vals.length - nums.length, sum: nums.reduce((s, v) => s + v, 0), min: nums[0] ?? null, median: nums.length ? (nums[(nums.length - 1) >> 1] + nums[nums.length >> 1]) / 2 : null, max: nums.at(-1) ?? null };
};

/**
 * rows: dòng của MỘT runs.jsonl (arm R1, R2; dòng chuẩn bị hỏng có arm "R1+R2"). sums: { R1b: sha256 đầy đủ, R2b: ... } từ SHA256SUMS.
 * Trả { status: 'checks-failed', checks } | { status: 'insufficient', unfinished } | { status: 'ok', ... }.
 */
export function analyzeE7b({ items, selected, rows, sums = null, final = false, expectN = null }) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const sel = selected.map((id) => byId.get(id));
  const selIds = new Set(selected);
  const armOf = (r) => ARM_OF[r.arm] ?? null;

  // ---- QH35: kiểm hạ tầng TRƯỚC mọi tính toán. Bất kỳ kiểm nào sai ⇒ chỉ trả lỗi kiểm.
  const checks = [];
  const add = (qh, name, arm, n, seen) => checks.push({ qh, name, arm, rows: n, seen });
  if (expectN != null && selected.length !== expectN) add('QH1', 'mẫu: số mục của danh sách chốt', '—', selected.length, `${selected.length} ≠ ${expectN}`);
  if (sel.some((x) => !x)) add('QH1', 'mục chốt không có trong items.json', '—', sel.filter((x) => !x).length, 'thiếu');
  const strange = rows.filter((r) => !ARM_OF[r.arm] && !(r.infra === 'prep' && /^R[12](\+R[12])*$/.test(String(r.arm))));
  if (strange.length) add('QH34', 'arm lạ (không có lượt R3, chỉ R1/R2)', '—', strange.length, JSON.stringify([...new Set(strange.map((r) => r.arm))]));
  for (const arm of ARMS) {
    const mine = rows.filter((r) => armOf(r) === arm);
    const done = mine.filter((r) => r.status === 'done');
    const bad = (pred) => done.filter(pred);
    const want = LOCK.turns[arm];
    let b = bad((r) => r.maxTurns !== want); // QH12
    if (b.length) add('QH12', `maxTurns phải là ${want}`, arm, b.length, JSON.stringify([...new Set(b.map((r) => r.maxTurns ?? null))]));
    b = bad((r) => !eqArr(r.acceptAuthSources, LOCK.auth)); // QH11 (P3): mảng đúng ["none"]; thiếu trường ⇒ không xác nhận được ⇒ lỗi
    if (b.length) add('QH11', 'acceptAuthSources phải là ["none"]', arm, b.length, JSON.stringify([...new Set(b.map((r) => (r.acceptAuthSources === undefined ? '(thiếu)' : r.acceptAuthSources)))]));
    b = bad((r) => r.acceptCalls !== 1); // QH5 (P1)
    if (b.length) add('QH5', 'acceptCalls phải là 1', arm, b.length, JSON.stringify([...new Set(b.map((r) => r.acceptCalls ?? null))]));
    const x = [...new Set(mine.map((r) => r.extraConfigSha256 ?? null))]; // QH6
    if (!sums?.[arm]) add('QH6', 'thiếu SHA256SUMS của arm', arm, mine.length, '(không đọc được)');
    else if (x.length !== 1 || x[0] !== sums[arm]) add('QH6', `extraConfigSha256 phải khớp SHA256SUMS (${sums[arm].slice(0, 8)}…)`, arm, mine.length, JSON.stringify(x.map((h) => (h ? `${h.slice(0, 8)}…` : null))));
    b = bad((r) => /Failed to authenticate|API Error:? ?403|Cloudflare/i.test(String(r.text ?? ''))); // QH31: dòng done có văn bản 403 ⇒ dừng
    if (b.length) add('QH31', 'dòng done có văn bản lỗi xác thực/403', arm, b.length, 'dừng, báo người điều phối');
  }
  const commits = [...new Set(rows.filter((r) => armOf(r)).map((r) => r.ccodingCommit ?? null))]; // QH6: một bản ghim chung cho hai arm
  if (commits.length !== 1 || commits[0] == null) add('QH6', 'ccodingCommit phải là một giá trị duy nhất cho cả hai arm', '—', rows.length, JSON.stringify(commits));
  if (checks.length) return { status: 'checks-failed', checks };

  // ---- Trạng thái từng cặp (mục, arm). QH7: dòng cuối là done; 3 lần infra ⇒ cặp thiếu; QH23: không dựng lại được ⇒ loại cả mục.
  const last = latestDone(rows.map((r) => (armOf(r) ? { ...r, arm: armOf(r) } : r)));
  const get = (x, arm) => last.get(`${x.id}__${arm}`);
  const infraRows = (id, arm) => rows.filter((r) => r.id === id && r.status === 'infra' && (armOf(r) === arm || (r.infra === 'prep' && String(r.arm).split('+').map((a) => ARM_OF[a]).includes(arm))));
  const prepExcluded = [], unfinished = [], missing = { R1b: [], R2b: [] };
  const timeoutMissing = { R1b: new Map(), R2b: new Map() };
  for (const x of sel) {
    const prepN = rows.filter((r) => r.id === x.id && r.status === 'infra' && r.infra === 'prep').length;
    if (!get(x, 'R1b') && !get(x, 'R2b') && prepN >= LOCK.missAfterInfra) { prepExcluded.push(x.id); continue; } // QH23
    for (const arm of ARMS) {
      if (get(x, arm)) continue;
      const inf = infraRows(x.id, arm);
      if (inf.length < LOCK.missAfterInfra && !final) { unfinished.push(`${x.id}__${arm}`); continue; }
      missing[arm].push(x.id); // QH7 (hoặc --final)
      const conds = inf.map(timeoutCond); // QH30: chọn "mọi dòng infra của cặp" đều thỏa một điều kiện hết giờ
      if (inf.length && conds.every((c) => c > 0)) timeoutMissing[arm].set(x.id, conds.at(-1));
    }
  }
  if (unfinished.length) return { status: 'insufficient', unfinished };

  const live = sel.filter((x) => !prepExcluded.includes(x.id));
  const planned = { faulty: live.filter((x) => x.kind === 'faulty').length, clean: live.filter((x) => x.kind === 'clean').length };
  const miss = { R1b: missing.R1b.length, R2b: missing.R2b.length };
  const tmo = Object.fromEntries(ARMS.map((a) => [a, { total: timeoutMissing[a].size, byCond: [1, 2, 3].map((c) => [...timeoutMissing[a].values()].filter((v) => v === c).length) }]));
  // QH21 (một arm > 3 cặp thiếu) và QH22 (chênh ≥ 3) ⇒ nhánh F, nhãn "chưa kết luận"
  const forcedBy = [];
  for (const a of ARMS) if (miss[a] > LOCK.missingMax) forcedBy.push(`QH21: ${a} có ${miss[a]} cặp thiếu > ${LOCK.missingMax}`);
  if (Math.abs(miss.R1b - miss.R2b) >= LOCK.missingDiff) forcedBy.push(`QH22: chênh ${Math.abs(miss.R1b - miss.R2b)} cặp thiếu giữa hai arm ≥ ${LOCK.missingDiff}`);

  const per = {};
  for (const arm of ARMS) {
    const rs = live.flatMap((x) => { const r = get(x, arm); return r ? [{ x, r }] : []; });
    const unread = rs.filter(({ r }) => r.verdict === 'unparsed'); // QH9
    const hasFlag = rs.every(({ r }) => typeof r.acceptTurnCapped === 'boolean'); // QH10: thiếu trường ⇒ "suy ra"
    const capped = hasFlag ? unread.filter(({ r }) => r.acceptTurnCapped === true).length : unread.length;
    const o = { arm, done: rs.length, unread: unread.length, capped, cappedBasis: hasFlag ? 'ghi' : 'suy ra', missing: miss[arm], timeoutMissing: tmo[arm], models: [...new Set(rs.flatMap(({ r }) => r.models ?? []))].sort(), maxTurns: [...new Set(rs.map(({ r }) => r.maxTurns))] };
    for (const kind of ['faulty', 'clean']) o[`unread_${kind}`] = rs.filter(({ x, r }) => x.kind === kind && r.verdict === 'unparsed').length;
    o.acceptTurns = dist(rs.map(({ r }) => (r.acceptTurns == null ? NaN : r.acceptTurns))); // QH29: chỉ mô tả
    o.acceptToolCalls = dist(rs.map(({ r }) => (r.acceptToolCalls == null ? NaN : r.acceptToolCalls))); // QH29
    o.usd = rs.length && rs.every(({ r }) => r.costUsd != null) ? rs.reduce((s, { r }) => s + r.costUsd, 0) : null;
    o.usdMean = o.usd == null ? null : o.usd / rs.length;
    o.wtokMean = rs.length ? rs.reduce((s, { r }) => s + (r.tokens?.weighted ?? 0), 0) / rs.length : NaN;
    o.wallSecMean = rs.length ? rs.reduce((s, { r }) => s + (r.wallSec ?? 0), 0) / rs.length : NaN;
    per[arm] = o;
  }

  const byMode = {};
  for (const mode of MODES) {
    const res = { mode };
    for (const kind of ['faulty', 'clean']) {
      const pairs = [];
      for (const x of live.filter((y) => y.kind === kind)) {
        const va = get(x, 'R1b')?.verdict ?? (mode.startsWith('S3') && timeoutMissing.R1b.has(x.id) ? 'unparsed' : null); // QH15: giữ cặp hết giờ như unread
        const vb = get(x, 'R2b')?.verdict ?? (mode.startsWith('S3') && timeoutMissing.R2b.has(x.id) ? 'unparsed' : null);
        if (va == null || vb == null) continue;
        if (mode === 'S2' && (va === 'unparsed' || vb === 'unparsed')) continue; // QH14
        pairs.push({ task: x.task, a: verdictBlocked(va, mode), b: verdictBlocked(vb, mode) });
      }
      const aOnly = pairs.filter((p) => p.a && !p.b).length; // chỉ R1b chặn
      const bOnly = pairs.filter((p) => !p.a && p.b).length; // chỉ R2b chặn
      const ka = pairs.filter((p) => p.a).length, kb = pairs.filter((p) => p.b).length;
      res[kind] = { n: pairs.length, planned: planned[kind], R1b: { k: ka, rate: pairs.length ? ka / pairs.length : NaN, cp: cp(ka, pairs.length) }, R2b: { k: kb, rate: pairs.length ? kb / pairs.length : NaN, cp: cp(kb, pairs.length) }, aOnly, bOnly, p: mcnemarExact(aOnly, bOnly), diff: pairs.length ? (kb - ka) / pairs.length : NaN, diffBoot: bootDiff(pairs.map((p) => ({ task: p.task, d: (p.b ? 1 : 0) - (p.a ? 1 : 0) })), LOCK.B, LOCK.seed) }; // QH8, QH17, QH18
    }
    const h = holm2(res.faulty.p, res.clean.p);
    res.faulty.pAdj = h.adj[0]; res.clean.pAdj = h.adj[1];
    res.faulty.label = labelOf({ ...res.faulty, ci: res.faulty.diffBoot });
    res.clean.label = labelOf({ ...res.clean, ci: res.clean.diffBoot });
    res.youden = Object.fromEntries(ARMS.map((a) => [a, res.faulty[a].rate - res.clean[a].rate]));
    res.branch = branchOf(res, per, forcedBy);
    if (forcedBy.length) { res.faulty.label = 'chưa kết luận'; res.clean.label = 'chưa kết luận'; } // QH21, QH22
    byMode[mode] = res;
  }
  // QH16: nhãn và nhánh phải đứng được ở cả chính, S1, S2, S3 (a và b); không thì "chưa kết luận"
  const branches = MODES.map((m) => byMode[m].branch.id);
  const stable = new Set(branches).size === 1;
  const labelsStable = (kind) => new Set(MODES.map((m) => byMode[m][kind].label)).size === 1;
  const mainRes = byMode['chính'];
  const unst = 'chưa kết luận (nhãn khác nhau giữa các cách tính)';
  const decision = { branch: stable ? branches[0] : 'chưa kết luận (nhánh khác nhau giữa các cách tính)', stable, branches: Object.fromEntries(MODES.map((m) => [m, byMode[m].branch.id])), labels: { P1: labelsStable('faulty') ? mainRes.faulty.label : unst, P2: labelsStable('clean') ? mainRes.clean.label : unst }, forcedBy };
  const perTask = [...new Set(live.map((x) => x.task))].sort().map((task) => {
    const row = { task };
    for (const arm of ARMS) for (const kind of ['faulty', 'clean']) {
      const us = live.filter((x) => x.task === task && x.kind === kind).flatMap((x) => { const r = get(x, arm); return r ? [r] : []; });
      row[`${arm}|${kind}`] = { blocked: us.filter((r) => r.verdict === 'block').length, n: us.length, unread: us.filter((r) => r.verdict === 'unparsed').length };
    }
    return row;
  });
  return { status: 'ok', nSelected: sel.length, prepExcluded, planned, per, miss, byMode, decision, perTask, checks, usdRatio: per.R1b.usd && per.R2b.usd != null ? per.R2b.usd / per.R1b.usd : null };
}

/** QH24–QH28: nhánh diễn giải, thứ tự D → E → A → B → C → F, nhánh đầu thỏa thì dừng. "≥" làm tròn xuống, "≤" làm tròn lên (n = 64 ra 58, 6, 6). forcedBy (QH21/QH22) ⇒ F. */
export function branchOf(res, per, forcedBy = []) {
  const f = res.faulty, c = res.clean;
  const maxFp = Math.ceil(LOCK.ceilFp * c.n - 1e-9), minRecall = Math.floor(LOCK.floorRecall * f.n + 1e-9), maxDrop = Math.ceil(LOCK.maxDrop * f.n - 1e-9);
  const thr = { maxFp, minRecall, maxDrop };
  if (forcedBy.length) return { id: 'F', text: `F. Chưa kết luận: ${forcedBy.join('; ')}`, thr };
  const cappedLimit = Math.floor(LOCK.cappedLimitShare * (f.planned + c.planned) + 1e-9);
  if (per.R2b.capped > cappedLimit) return { id: 'D', text: `D. Đọc chưa sạch: ${per.R2b.capped} lượt R2b chạm trần (${per.R2b.cappedBasis}) > ${cappedLimit}`, thr }; // QH25
  if (c.R1b.cp[0] <= LOCK.fpRef) return { id: 'E', text: 'E. (i) đã đổi: cận dưới CP chặn nhầm R1b ≤ 10 %', thr }; // QH26
  const m1 = c.R2b.k <= maxFp;
  const m2 = f.R2b.k >= minRecall && f.R1b.k - f.R2b.k <= maxDrop;
  const m3 = c.label === 'khác nhau' && c.R2b.k < c.R1b.k;
  if (m1 && m2 && m3) return { id: 'A', text: 'A. Đề xuất đổi model CTO sang Opus (chủ dự án quyết)', thr }; // QH27
  if (m1 && !m2) return { id: 'B', text: 'B. Opus giữ chặn nhầm thấp, mất recall', thr }; // QH28
  if (!m1) return { id: 'C', text: 'C. Opus vẫn chặn nhầm cao', thr };
  return { id: 'F', text: 'F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4))', thr };
}

/** QH1: git blob sha1 (LF) của một tệp, để đối chiếu selected.json (`5b3e8fcf…`). */
export function gitBlobSha(buf) {
  const b = Buffer.from(String(buf.toString('utf8')).replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
}

/** Đọc SHA256SUMS: `<sha256> *config-R1b.json` → { R1b, R2b }. */
export function readSums(file) {
  const m = {};
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const g = /^([0-9a-f]{64}) \*?config-(R[12]b)\.json$/.exec(l.trim()); if (g) m[g[2]] = g[1]; }
  return m;
}

/**
 * Đối chiếu (không phải nguồn chính, QH-PL2 (b)) dòng done với calls.jsonl trong <data>/w1 hoặc w2: số lượt accept, authSource, turnCapped.
 * Trả mảng lệch (ghi vào báo cáo; không chọn nguồn theo kết quả). Thiếu tệp ⇒ ghi "không thấy".
 */
export function reconcileWithCalls(dataDirs, rows) {
  const diffs = [];
  for (const r of rows) {
    if (r.status !== 'done' || !r.taskId) continue;
    const f = dataDirs.map((d) => path.join(d, 'runs', r.taskId, 'calls.jsonl')).find((p) => fs.existsSync(p));
    if (!f) { diffs.push({ id: r.id, arm: r.arm, what: 'không thấy calls.jsonl' }); continue; }
    const acc = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((c) => c.phase === 'accept');
    const auth = [...new Set(acc.map((c) => c.authSource ?? null))];
    const capped = acc.some((c) => c.turnCapped === true);
    if (acc.length !== r.acceptCalls) diffs.push({ id: r.id, arm: r.arm, what: `acceptCalls ${r.acceptCalls} ≠ calls.jsonl ${acc.length}` });
    if (!eqArr(auth, r.acceptAuthSources ?? [])) diffs.push({ id: r.id, arm: r.arm, what: `acceptAuthSources ${JSON.stringify(r.acceptAuthSources)} ≠ calls.jsonl ${JSON.stringify(auth)}` });
    if (typeof r.acceptTurnCapped === 'boolean' && r.acceptTurnCapped !== capped) diffs.push({ id: r.id, arm: r.arm, what: `acceptTurnCapped ${r.acceptTurnCapped} ≠ calls.jsonl ${capped}` });
  }
  return diffs;
}

/**
 * QH34: kiểm lượt thử (1 mục dự phòng, mỗi arm 1 dòng done), CHỈ trường hạ tầng, không đọc verdict/text.
 * Kiểm: extraConfigSha256 từng arm khớp SHA256SUMS (phát hiện bản ghim thiếu D24: không có trường hoặc dùng một cấu hình chung), maxTurns 6/16,
 * acceptCalls = 1, acceptAuthSources = ["none"], models (R1 Sonnet, R2 Opus), promptSha giống nhau, ccodingCommit giống nhau, có acceptTurnCapped.
 * Trả { ok, lines }; lines có tiền tố "OK"/"LỖI".
 */
export function smokeCheck(rows, sums) {
  const lines = [];
  const rec = (ok, qh, msg) => lines.push(`${ok ? 'OK ' : 'LỖI'} ${qh} · ${msg}`);
  const dn = {};
  for (const arm of ARMS) {
    const mine = rows.filter((r) => armOf2(r) === arm);
    const done = mine.filter((r) => r.status === 'done');
    dn[arm] = done;
    rec(done.length === 1 && mine.length === done.length, 'QH34', `${arm}: đúng một dòng done và không dòng nào khác (thấy ${done.length} done / ${mine.length} dòng)`);
    const r = done[0] ?? {};
    const h = (s) => (s ? `${String(s).slice(0, 8)}…` : String(s));
    rec(!!sums?.[arm] && mine.length > 0 && mine.every((x) => x.extraConfigSha256 === sums[arm]), 'QH6', `${arm}: extraConfigSha256 ${h(r.extraConfigSha256)} khớp SHA256SUMS ${h(sums?.[arm])}${r.extraConfigSha256 == null ? ' (thiếu trường: bản ghim thiếu D24 ⇒ hoãn E7b)' : ''}`);
    rec(r.maxTurns === LOCK.turns[arm], 'QH12', `${arm}: maxTurns ${r.maxTurns ?? null} (khóa ${LOCK.turns[arm]})`);
    rec(r.acceptCalls === 1, 'QH5', `${arm}: acceptCalls ${r.acceptCalls ?? null} (khóa 1)`);
    rec(eqArr(r.acceptAuthSources, LOCK.auth), 'QH11', `${arm}: acceptAuthSources ${JSON.stringify(r.acceptAuthSources ?? null)} (khóa ["none"])`);
    rec(typeof r.acceptTurnCapped === 'boolean', 'QH10', `${arm}: acceptTurnCapped ${JSON.stringify(r.acceptTurnCapped ?? null)} (phải là boolean; thiếu ⇒ chỉ "suy ra")`);
    rec((r.models ?? []).length > 0 && (r.models ?? []).every((m) => (arm === 'R1b' ? /sonnet/i : /opus/i).test(m)), 'QH2', `${arm}: models ${JSON.stringify(r.models ?? null)} (R1 Sonnet, R2 Opus)`);
  }
  const p1 = dn.R1b[0]?.promptSha, p2 = dn.R2b[0]?.promptSha;
  rec(!!p1 && p1 === p2, 'QH34', `promptSha giống nhau giữa hai arm (${p1 ? String(p1).slice(0, 8) : null} / ${p2 ? String(p2).slice(0, 8) : null})`);
  const c1 = dn.R1b[0]?.ccodingCommit, c2 = dn.R2b[0]?.ccodingCommit;
  rec(!!c1 && c1 === c2, 'QH6', `ccodingCommit giống nhau giữa hai arm (${c1 ? String(c1).slice(0, 8) : null} / ${c2 ? String(c2).slice(0, 8) : null})`);
  return { ok: lines.every((l) => l.startsWith('OK')), lines };
}
const armOf2 = (r) => ARM_OF[r.arm] ?? null;

export function report(a) {
  if (a.status === 'checks-failed') { // QH35: chỉ lỗi kiểm
    return ['# E7b: LỖI KIỂM HẠ TẦNG (QH35)', '', 'Dừng và ghi khối "Sai lệch" (§9 E7b (j)). Không in kết quả nào cho đến khi kiểm đạt.', '', ...a.checks.map((c) => `- ${c.qh} · ${c.name} · arm ${c.arm} · ${c.rows} dòng · thấy ${c.seen}`)].join('\n');
  }
  if (a.status === 'insufficient') return `chưa đủ dữ liệu: còn ${a.unfinished.length} cặp (mục, arm) chưa có dòng done và chưa đủ ${LOCK.missAfterInfra} lần infra. Không in số. Chạy lại cho đủ, hoặc thêm --final nếu đã dừng chủ định (ghi lý do vào RUNLOG).`;
  const f = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') : '—');
  const ci = (v) => `[${f(v[0])}; ${f(v[1])}]`;
  const pp = (x) => x.toFixed(4).replace('.', ',');
  const usd = (x) => (x == null ? '—' : x.toFixed(2).replace('.', ','));
  const num = (x) => (x == null ? '—' : String(Math.round(x * 10) / 10).replace('.', ','));
  const m = a.byMode['chính'];
  const L = ['# E7b: CTO nghiệm thu, đo lại trên bản mã hiện tại', '', `Mục chốt: ${a.nSelected} (lỗi ${a.planned.faulty}, đúng ${a.planned.clean} sau khi loại ${a.prepExcluded.length} mục không dựng lại được, QH23). Một tiến trình xen kẽ theo bảng Latin (QH3). R1b: Sonnet, trần accept 6. R2b: Opus, trần accept 16 (khác nhau ở cả model lẫn trần; không tách được).`, ''];
  L.push('## Cặp thiếu (QH7, QH21, QH22, QH30)', '', '| Arm | cặp thiếu | trong đó hết giờ: `quá hạn chờ` / `Hết thời gian (` / `timeout` |', '|---|--:|---|');
  for (const arm of ARMS) L.push(`| ${arm} | ${a.miss[arm]} | ${a.per[arm].timeoutMissing.total}: ${a.per[arm].timeoutMissing.byCond.join(' / ')} |`);
  L.push('', `Ngưỡng: một arm > ${LOCK.missingMax} cặp thiếu hoặc chênh ≥ ${LOCK.missingDiff} ⇒ nhánh F. ${a.decision.forcedBy.length ? `**Đã kích hoạt: ${a.decision.forcedBy.join('; ')}.**` : 'Chưa kích hoạt.'} Cặp thiếu chọn "hết giờ" khi mọi dòng infra của cặp thỏa một điều kiện QH30.`, '');
  L.push('## Thước đo chính (unread = không chặn; QH8, QH9, QH10)', '', '| Arm | Recall | CP 95 % | Chặn nhầm | CP 95 % | Youden J (mô tả) | unread | capped | USD | USD/mục | wtok TB |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const arm of ARMS) {
    const p = a.per[arm];
    L.push(`| ${arm} | ${m.faulty[arm].k}/${m.faulty.n} = ${f(m.faulty[arm].rate)} % | ${ci(m.faulty[arm].cp)} | ${m.clean[arm].k}/${m.clean.n} = ${f(m.clean[arm].rate)} % | ${ci(m.clean[arm].cp)} | ${f(m.youden[arm])} | ${p.unread} | ${p.capped} (${p.cappedBasis}) | ${usd(p.usd)} | ${usd(p.usdMean)} | ${Math.round(p.wtokMean).toLocaleString('vi-VN')} |`);
  }
  L.push('', `Tỉ số USD R2b/R1b: ${a.usdRatio == null ? '—' : a.usdRatio.toFixed(2).replace('.', ',')}. Mô tả, không là tiêu chí.`, '', '## Mô tả lượt accept (QH29; không vào phép kiểm hay nhánh)', '', '| Arm | acceptTurns: n / thiếu / trung vị / max | acceptToolCalls: n / thiếu / trung vị / max |', '|---|---|---|');
  for (const arm of ARMS) { const t = a.per[arm].acceptTurns, c = a.per[arm].acceptToolCalls; L.push(`| ${arm} | ${t.n} / ${t.nNull} / ${num(t.median)} / ${num(t.max)} | ${c.n} / ${c.nNull} / ${num(c.median)} / ${num(c.max)} |`); }
  L.push('', '## Phép kiểm (McNemar chính xác hai phía, R2b so với R1b; Holm hai phép; bootstrap theo bài B = 4000; QH17, QH18)', '', '| Cách tính | Phép | n | chỉ R1b chặn | chỉ R2b chặn | p thô | p Holm | hiệu R2b − R1b (điểm %) [CI bootstrap] | nhãn |', '|---|---|--:|--:|--:|--:|--:|---|---|');
  for (const mode of MODES) {
    const r = a.byMode[mode];
    for (const [name, kind] of [['P1 recall', 'faulty'], ['P2 chặn nhầm', 'clean']]) { const k = r[kind]; L.push(`| ${mode} | ${name} | ${k.n} | ${k.aOnly} | ${k.bOnly} | ${pp(k.p)} | ${pp(k.pAdj)} | ${f(k.diff)} ${ci(k.diffBoot)} | ${k.label} |`); }
  }
  L.push('', `Nhãn P1: **${a.decision.labels.P1}**; nhãn P2: **${a.decision.labels.P2}**. Số cặp bất đồng < ${LOCK.minDisc} thì p chỉ mô tả (QH20).`, 'Cách tính: chính (unread = không chặn), S1 (unread = chặn), S2 (bỏ cặp có unread ở bất kỳ arm nào), S3a (cặp thiếu do hết giờ giữ lại như unread, không chặn), S3b (như S3a nhưng unread, kể cả hết giờ, tính là chặn như S1). Không có cặp hết giờ thì S3a trùng chính và S3b trùng S1 (QH15).', '', '## Nhánh diễn giải (§9 (h); QH24–QH28)', '', ...MODES.map((mode) => `- ${mode}: ${a.byMode[mode].branch.text} (ngưỡng quy theo n: chặn nhầm ≤ ${a.byMode[mode].branch.thr.maxFp}, recall ≥ ${a.byMode[mode].branch.thr.minRecall}, R1b − R2b ≤ ${a.byMode[mode].branch.thr.maxDrop})`), '', `**Kết luận nhánh: ${a.decision.branch}.** Chỉ đứng được khi cả năm cách tính cùng nhánh (QH16).`);
  L.push('', '## Theo bài', '', '| Bài | R1b lỗi bị chặn | R2b lỗi bị chặn | R1b đúng bị chặn | R2b đúng bị chặn | unread R1b / R2b |', '|---|--:|--:|--:|--:|--:|');
  for (const t of a.perTask) L.push(`| ${t.task} | ${t['R1b|faulty'].blocked}/${t['R1b|faulty'].n} | ${t['R2b|faulty'].blocked}/${t['R2b|faulty'].n} | ${t['R1b|clean'].blocked}/${t['R1b|clean'].n} | ${t['R2b|clean'].blocked}/${t['R2b|clean'].n} | ${t['R1b|faulty'].unread + t['R1b|clean'].unread} / ${t['R2b|faulty'].unread + t['R2b|clean'].unread} |`);
  L.push('', '## So với E7 (chỉ mô tả, KHÁC BẢN MÃ, không gộp, không p/CI giữa hai đợt; QH29)', '', '| | E7 (bản mã trước D15–D23, 13/11/2026) | E7b (bản ghim hiện tại) |', '|---|---|---|', `| Sonnet, trần 6 (R1 / R1b): chặn nhầm; recall | 42,2 %; 98,4 % | ${f(m.clean.R1b.rate)} %; ${f(m.faulty.R1b.rate)} % |`, `| Opus (R2: trần 6 / R2b: trần 16): chặn nhầm; recall | 6,3 %; 85,9 % | ${f(m.clean.R2b.rate)} %; ${f(m.faulty.R2b.rate)} % |`, '', 'Chênh lệch có thể đến từ mã, trần, trôi mô hình hoặc nhiễu; không tách được (§9 E7b (i), (k)).');
  if (a.reconcile) L.push('', '## Đối chiếu với calls.jsonl (nguồn phụ; lệch thì ghi, không chọn nguồn theo kết quả)', '', a.reconcile.length ? a.reconcile.map((d) => `- ${d.id} (${d.arm}): ${d.what}`).join('\n') : 'Không lệch.');
  return L.join('\n');
}

const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
  const B = path.join('bench', 'vs-claude', 'results', 'e7b-cto'), e7 = path.join('bench', 'vs-claude', 'results', 'e7-cto');
  if (flag('smoke')) { // QH34: kiểm lượt thử, không đọc verdict
    const s = smokeCheck(jl(path.resolve(flag('smoke'))), readSums(path.resolve(flag('sums', path.join(B, 'SHA256SUMS')))));
    console.log(s.lines.join('\n'));
    process.exit(s.ok ? 0 : 2);
  }
  const rows = jl(path.resolve(flag('runs', path.join(B, 'run', 'runs.jsonl'))));
  if (!rows.some((r) => r.status === 'done')) {
    console.log('chưa có dữ liệu: thiếu runs.jsonl (hoặc chưa có dòng done). Không phân tích.');
    process.exit(0);
  }
  const doc = JSON.parse(fs.readFileSync(path.resolve(flag('items', path.join(e7, 'items.json'))), 'utf8'));
  const items = [...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])];
  const selFile = path.resolve(flag('selected', path.join(e7, 'selected.json')));
  const selected = JSON.parse(fs.readFileSync(selFile, 'utf8')).items;
  const sums = readSums(path.resolve(flag('sums', path.join(B, 'SHA256SUMS'))));
  const a = analyzeE7b({ items, selected, rows, sums, final: argv.includes('--final'), expectN: LOCK.nSelected });
  if (gitBlobSha(fs.readFileSync(selFile)).slice(0, 8) !== LOCK.selectedBlob && a.status !== 'checks-failed') { // QH1
    a.checks = [{ qh: 'QH1', name: `selected.json phải có git blob ${LOCK.selectedBlob}…`, arm: '—', rows: selected.length, seen: gitBlobSha(fs.readFileSync(selFile)).slice(0, 8) }];
    a.status = 'checks-failed';
  }
  const data = flag('data');
  if (a.status === 'ok' && data) a.reconcile = reconcileWithCalls([path.join(path.resolve(data), 'w1'), path.join(path.resolve(data), 'w2')], rows);
  console.log(argv.includes('--json') && a.status === 'ok' ? JSON.stringify(a, null, 1) : report(a));
  if (a.status === 'checks-failed') process.exit(2);
}
