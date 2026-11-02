#!/usr/bin/env node
// Phân tích token / cache / thời gian cho benchtest CCoding vs Claude Code thuần (RQ3).
// Node >= 22, không phụ thuộc ngoài, chạy offline. Chỉ đọc bench/vs-claude/results/, in Markdown ra stdout.
//
//   node docs/research/performance/scripts/token-analysis.mjs                 # in toàn bộ bảng T-0 … T-i
//   node docs/research/performance/scripts/token-analysis.mjs --table T-b     # in một bảng
//   node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
//        # kiểm tra mọi bảng trong tệp .md trùng từng ký tự với đầu ra script (exit 1 nếu lệch)
//
// Tham số giả định: xem khối CONFIG.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ri = args.indexOf('--results'); // chỉ đường dẫn results/ khác (dùng để thử trên bản sao có vòng giả)
const RESULTS = ri >= 0 ? path.resolve(args[ri + 1]) : path.resolve(HERE, '../../../../bench/vs-claude/results');
// Tự phát hiện vòng và hệ từ tên thư mục results/C<n>/<bài>.<hệ>.<lượt> (dữ liệu, không phải lựa chọn của người phân tích).
const roundNo = (R) => +R.slice(1);
const scan = Object.fromEntries(fs.readdirSync(RESULTS, { withFileTypes: true }).filter((d) => d.isDirectory() && /^C\d+$/.test(d.name)).map((d) => [d.name, new Set(fs.readdirSync(path.join(RESULTS, d.name)).map((n) => n.replace(/^[^.]+\./, '').replace(/\.\d+$/, '')))]));
const dirRounds = Object.keys(scan).sort((a, b) => roundNo(a) - roundNo(b));
const withSys = (test) => dirRounds.filter((R) => [...scan[R]].some(test));
const isFastSys = (s) => s.startsWith('ccoding-fastlane');
const pairedFast = withSys(isFastSys).filter((R) => [...scan[R]].some((s) => s.startsWith('claude'))); // làn nhanh có đối chứng Claude cùng vòng
// c6-extract/ (bản trích C6 từ commit 5866cda) KHÔNG còn dùng làm dữ liệu: results/ đã có C6; T-0 chỉ kiểm đồng nhất từng dòng.
const EXTRA = path.resolve(HERE, '../c6-extract');

const CONFIG = {
  seed: 20261102, // seed bootstrap cố định
  bootstrapB: 10000,
  charsPerToken: 3.5, // GIẢ ĐỊNH: ký tự/token (tiếng Việt + mã trộn); dùng đổi *_chars → token
  o3CtxCut: 0.3, // O3: cắt 30% context_chars
  o4PromptCut: 0.5, // O4: reviewer giảm 50% context+prompt+tool_output
  o5OutCut: 0.2, // O5: giảm 20% token đầu ra ở pha plan/review/synthesize
  sourceCommit: 'bb7b477 (nhánh nhiệm vụ T-20261102-134405-b2c; results/ gồm C1–C8, C8 thêm ở d7cf900)',
  // --- tự phát hiện từ results/ (D4): thêm vòng mới thì không phải sửa ở đây ---
  rounds: dirRounds,
  opusRounds: pairedFast.filter((R) => scan[R].has('claude')), // hệ claude (Opus) cùng vòng với làn nhanh: đối chứng ở T-h, T-i
  sonnetRound: withSys((s) => s === 'claude-sonnet').at(-1), // vòng mới nhất có claude-sonnet
  fastRounds: pairedFast, // làn nhanh có cặp Claude cùng vòng (bỏ lượt treo); vòng chỉ có làn nhanh (C4, C8) không vào đây
  // --- lựa chọn của người phân tích (khai báo tường minh) ---
  permMaxExact: 3e7, // vượt ngưỡng này thì lấy mẫu Monte Carlo
  permMc: 200000,
  briefTimes: { 't1-duration': [126, 66, 108], 't2-orders': [91, 42, 94], 't3-api': [205, 108, 199], 't4-perf': [203, 49, 142], 't5-logq': [259, 166, 165] }, // BRIEF-2: Opus C5–C6 / Sonnet C7 / làn nhanh C5–C7 bỏ lượt treo (s)
  briefCostRatio: [2.5, 3.8], // BRIEF-2: chi phí làn nhanh / Sonnet đơn
  pooledRounds: ['C5', 'C6'], // gộp độ nhạy: cùng làn nhanh (C6 sau d7600f6: maxParallel 4)
  hung: (r) => r.run === 'C5' && r.task === 't3-api' && r.rep === 1 && r.system.startsWith('ccoding'), // lượt treo stdin 579 s
  phaseTableRounds: [dirRounds[0], ...pairedFast], // vòng đầu (CCoding gốc) + các vòng làn nhanh có cặp
  costBasisRound: 'C5', // vòng làm nền cho T-e (thiết kế hiện hành)
};
// Nhãn vòng Sonnet đơn trong lời văn của T-d, T-h, T-i = vòng mới nhất có `claude-sonnet` (CONFIG.sonnetRound), không viết cứng.
// Căn cứ: SR-27 (docs/research/suite-review.md): nhãn "C7" viết cứng là lỗi khi thêm C9; mọi nhãn phải sinh từ dữ liệu.
const SONNET_RD = CONFIG.sonnetRound;

// ---------- đọc dữ liệu ----------
function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const num = (v) => (v === '' || v === undefined ? NaN : Number(v));
const load = (n) => parseCsv(fs.readFileSync(path.join(RESULTS, n), 'utf8'));
// Đối chiếu c6-extract/ với results/ (chỉ để báo cáo ở T-0; không đưa vào dữ liệu phân tích).
const c6Check = ['runs', 'phases', 'calls', 'claude_turns'].map((n) => {
  const main = fs.readFileSync(path.join(RESULTS, n + '.csv'), 'utf8').replace(/\r/g, '').split('\n');
  const f = path.join(EXTRA, 'C6-' + n + '.csv');
  if (!fs.existsSync(f)) return null;
  const ex = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
  const set = new Set(main);
  return { n, rows: ex.length - 1, same: main[0] === ex[0] && ex.slice(1).every((l) => set.has(l)) };
});
const runs = load('runs.csv').map((r) => ({ ...r, rep: +r.rep, wall: num(r.wall_s), cost: num(r.cost_usd), hp: num(r.hidden_pass), ht: num(r.hidden_total), inp: num(r.input), out: num(r.output), cr: num(r.cache_read), cw: num(r.cache_write) }));
const calls = load('calls.csv').map((c) => ({ ...c, rep: +c.rep, t: Date.parse(c.ts), dur: num(c.duration_s) }));
const phasesCsv = load('phases.csv');
const turns = load('claude_turns.csv').map((t) => ({ ...t, rep: +t.rep }));
const summary = JSON.parse(fs.readFileSync(path.join(RESULTS, 'summary.json'), 'utf8'));

const isCC = (s) => s.startsWith('ccoding');
const isCL = (s) => s.startsWith('claude'); // claude (Opus) và claude-sonnet
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const mean = (a) => (a.length ? sum(a) / a.length : NaN);
const uniq = (a) => [...new Set(a)];
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US').replace(/,/g, ' ') : '–');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '–');
const rk = (r) => `${r.run}|${r.task}|${r.system}|${r.rep}`;
const gk = (c) => `${c.task}|${c.system}|${c.rep}`;
const md = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i < 2 ? '---' : '---:')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const callsOf = (r) => calls.filter((c) => c.run === r.run && c.task === r.task && c.system === r.system && c.rep === r.rep);
const turnsOf = (r) => turns.filter((t) => t.run === r.run && t.task === r.task && t.rep === r.rep);
const roundsPresent = uniq(runs.map((r) => r.run));
const hasRound = (R) => roundsPresent.includes(R);
const NODATA = 'chưa có dữ liệu';

const T = {}; // tên bảng → Markdown

// ---------- T-0: schema + đối chiếu ----------
{
  const schema = [
    ['runs.csv', 'wall_s', 'giây (đồng hồ tường của harness)', 'cả hai hệ'],
    ['runs.csv', 'cost_usd', 'USD theo giá niêm yết do Claude Code báo', 'cả hai hệ'],
    ['runs.csv', 'input / output / cache_read / cache_write', 'token, tổng cả lượt chạy (CCoding: cộng mọi lượt gọi agent)', 'cả hai hệ'],
    ['runs.csv', 'hidden_pass / hidden_total', 'số test ẩn đạt / tổng', 'cả hai hệ'],
    ['calls.csv', 'duration_s', 'giây của một lượt gọi agent; ts = thời điểm KẾT THÚC (ts − duration_s ≈ bắt đầu; lượt 1 khớp `started` của runs.csv)', 'CCoding'],
    ['calls.csv', 'input / output / cache_read / cache_write', 'token của cả lượt gọi agent (gồm nhiều lượt mô hình bên trong; số công cụ ở tool_calls)', 'CCoding'],
    ['calls.csv', 'system_chars / context_chars / prompt_chars', `ký tự (không phải token); đổi token bằng charsPerToken = ${CONFIG.charsPerToken} (giả định)`, 'CCoding'],
    ['calls.csv', 'tool_output_chars', 'ký tự kết quả công cụ đưa lại vào hội thoại', 'CCoding'],
    ['calls.csv', 'max_tokens / retries', 'trần đầu ra cấu hình theo pha / số lần thử lại', 'CCoding'],
    ['claude_turns.csv', 'input / cache_read / cache_write (_1h, _5m)', 'token theo TỪNG lượt mô hình của Claude Code; cache_write = _1h + _5m', `Claude (chỉ ${uniq(turns.map((t) => t.run)).sort().join(', ')})`],
    ['claude_turns.csv', 'output_partial', 'token đầu ra từ luồng sự kiện từng phần — KHÔNG dùng (≪ output thật trong runs.csv)', 'Claude'],
  ];
  const ccRuns = runs.filter((x) => isCC(x.system)), clRuns = runs.filter((x) => isCL(x.system));
  const badCC = ccRuns.filter((r) => { const cs = callsOf(r); return !(cs.length && sum(cs, (c) => num(c.input)) === r.inp && sum(cs, (c) => num(c.output)) === r.out && sum(cs, (c) => num(c.cache_read)) === r.cr && sum(cs, (c) => num(c.cache_write)) === r.cw); }).map(rk);
  const badCl = clRuns.filter((r) => { const ts = turnsOf(r); return !(ts.length && sum(ts, (t) => num(t.cache_read)) === r.cr && sum(ts, (t) => num(t.cache_write)) === r.cw && sum(ts, (t) => num(t.cache_write_1h) + num(t.cache_write_5m)) === r.cw); }).map(rk);
  // hai hệ có chạy chồng thời gian nhau không (theo started + wall_s)?
  const ov = (R) => { const rs = runs.filter((r) => r.run === R); const iv = (r) => [Date.parse(r.started), Date.parse(r.started) + r.wall * 1000]; const cc = rs.filter((r) => isCC(r.system)); const cl = rs.filter((r) => isCL(r.system)); return `${R} ${cc.filter((a) => cl.some((b) => iv(a)[0] < iv(b)[1] && iv(b)[0] < iv(a)[1])).length}/${cc.length}`; };
  const overlapLine = `Giao thức chạy (kiểm từ started + wall_s): số lượt CCoding có khoảng chạy chồng với ít nhất một lượt Claude cùng vòng — ${CONFIG.fastRounds.filter(hasRound).map(ov).join('; ')}. Tức hai hệ chạy song song nhau (mỗi hệ tuần tự trong chính nó, --concurrency 1); khác biệt C5 → C6 không phải "tuần tự → cùng lúc" mà là mã (C6 sau d7600f6: maxParallel 4) và thời điểm chạy. Ở C7 đối chứng là claude-sonnet (Claude Code một mình bằng Sonnet) chạy cùng lúc với làn nhanh.`;
  const w1h = sum(turns, (t) => num(t.cache_write_1h)), w5 = sum(turns, (t) => num(t.cache_write_5m));
  T['T-0'] = [
    md(['Tệp', 'Cột', 'Đơn vị / ý nghĩa', 'Áp dụng'], schema),
    '',
    `Đối chiếu: ${ccRuns.length - badCC.length}/${ccRuns.length} lượt CCoding có Σ(calls.csv) = runs.csv về input/output/cache_read/cache_write${badCC.length ? ' (lệch: ' + badCC.join('; ') + ')' : ''}; ${clRuns.length - badCl.length}/${clRuns.length} lượt Claude có Σ(claude_turns.csv) = runs.csv về cache_read/cache_write${badCl.length ? ' (lệch: ' + badCl.join('; ') + ')' : ''}.`,
    '',
    `Quy đổi: runs.csv là nguồn chuẩn cho tổng. calls.csv (CCoding, theo lượt gọi agent = một tiến trình) và claude_turns.csv (Claude, theo lượt mô hình) KHÔNG cùng độ mịn, nên so sánh chỉ ở mức tổng theo lượt chạy hoặc "mỗi lượt gọi agent" (CCoding) với "mỗi lượt chạy" (Claude). claude_turns.csv có ở các vòng: ${uniq(turns.map((t) => t.run)).sort().join(', ')}; không có events.jsonl trong results/C*/. Nguồn: bench/vs-claude/results/ ở commit ${CONFIG.sourceCommit}. Đối chiếu bản trích c6-extract/C6-*.csv (commit 5866cda) với các dòng C6 trong results/: ${c6Check.every(Boolean) ? c6Check.map((c) => `${c.n} ${c.rows} dòng ${c.same ? 'trùng từng ký tự' : 'LỆCH'}`).join('; ') + (c6Check.every((c) => c.same) ? ' ⇒ c6-extract/ bị bỏ khỏi pipeline (script không đọc nó làm dữ liệu).' : ' ⇒ cần xem lại, không tự gộp.') : 'không có c6-extract/'}.`,
    overlapLine,
    '',
    `Ghi cache của Claude theo TTL: 1 giờ = ${f0(w1h)} token, 5 phút = ${f0(w5)} token (${f1((100 * w1h) / (w1h + w5))}% là 1 giờ). calls.csv không tách TTL cho CCoding.`,
    '',
    `Dữ liệu có: ${runs.length} lượt chạy, ${calls.length} dòng calls.csv, ${phasesCsv.length} dòng phases.csv, ${turns.length} dòng claude_turns.csv; vòng có trong runs.csv: ${roundsPresent.join(', ')}.`,
  ].join('\n');
}

// ---------- T-a ----------
{
  const head = ['Vòng', 'Bài', 'Hệ', 'n', 'Test ẩn đạt/tổng', 'Đạt trọn', 'Thời gian TB (s)', 'min', 'max', 'Chi phí TB (USD)', 'Input TB', 'Output TB', 'Cache đọc TB', 'Cache ghi TB'];
  const rows = [];
  for (const R of CONFIG.rounds) {
    if (!hasRound(R)) { rows.push([R, '–', '–', ...Array(head.length - 3).fill(NODATA)]); continue; }
    const rs = runs.filter((r) => r.run === R);
    for (const k of uniq(rs.map((r) => `${r.task}|${r.system}`)).sort()) {
      const [task, system] = k.split('|');
      const g = rs.filter((r) => r.task === task && r.system === system);
      rows.push([R, task, system, g.length, `${sum(g, (r) => r.hp)}/${sum(g, (r) => r.ht)}`, `${g.filter((r) => r.hp === r.ht).length}/${g.length}`,
        f0(mean(g.map((r) => r.wall))), f0(Math.min(...g.map((r) => r.wall))), f0(Math.max(...g.map((r) => r.wall))),
        f3(mean(g.map((r) => r.cost))), f0(mean(g.map((r) => r.inp))), f0(mean(g.map((r) => r.out))), f0(mean(g.map((r) => r.cr))), f0(mean(g.map((r) => r.cw)))]);
    }
  }
  T['T-a'] = md(head, rows);
}

// ---------- T-b ----------
{
  const rows = [], cells = [], pooled = [];
  for (const R of CONFIG.rounds) {
    if (!hasRound(R)) { rows.push([R, '–', '–', NODATA, '', '', '', '', '', '', '']); continue; }
    const rs = runs.filter((r) => r.run === R);
    const acc = {};
    for (const task of uniq(rs.map((r) => r.task)).sort()) {
      const cl = rs.filter((r) => r.task === task && r.system === 'claude');
      if (!cl.length) continue;
      for (const sys of uniq(rs.filter((r) => r.task === task && isCC(r.system)).map((r) => r.system))) {
        const cc = rs.filter((r) => r.task === task && r.system === sys);
        const m = (g, k) => mean(g.map((r) => r[k]));
        const ncalls = mean(cc.map((r) => callsOf(r).length));
        const ratio = m(cc, 'cw') / m(cl, 'cw');
        cells.push(ratio);
        (acc[sys] ||= []).push({ cc: Object.fromEntries(['cw', 'cr', 'out', 'cost'].map((k) => [k, m(cc, k)])), cl: Object.fromEntries(['cw', 'cr', 'out', 'cost'].map((k) => [k, m(cl, k)])), ncalls });
        rows.push([R, task, sys, f0(m(cc, 'cw')), f0(m(cl, 'cw')), f2(ratio), f2(m(cc, 'cr') / m(cl, 'cr')), f2(m(cc, 'out') / m(cl, 'out')), f2(m(cc, 'cost') / m(cl, 'cost')), f1(ncalls), f0(m(cc, 'cw') / ncalls)]);
      }
    }
    for (const [sys, a] of Object.entries(acc)) {
      const S = (side, k) => sum(a, (x) => x[side][k]);
      const pr = S('cc', 'cw') / S('cl', 'cw');
      pooled.push({ R, sys, ratio: pr });
      rows.push([R, `GỘP ${a.length} bài`, sys, f0(S('cc', 'cw') / a.length), f0(S('cl', 'cw') / a.length), f2(pr), f2(S('cc', 'cr') / S('cl', 'cr')), f2(S('cc', 'out') / S('cl', 'out')), f2(S('cc', 'cost') / S('cl', 'cost')), f1(mean(a.map((x) => x.ncalls))), f0(S('cc', 'cw') / sum(a, (x) => x.ncalls))]);
    }
  }
  const pin = pooled.filter((p) => p.ratio >= 2.8 && p.ratio <= 4).length;
  const verdict = pin === pooled.length ? 'ĐÚNG: mọi tỷ lệ gộp theo vòng nằm trong 2,8–4' : pin === 0 ? 'LỆCH: không tỷ lệ gộp theo vòng nào nằm trong 2,8–4' : `ĐÚNG MỘT PHẦN: ${pin}/${pooled.length} tỷ lệ gộp theo vòng nằm trong 2,8–4`;
  T['T-b'] = [
    md(['Vòng', 'Bài', 'Hệ CCoding', 'Ghi cache CC TB', 'Ghi cache Claude TB', 'Tỷ lệ ghi cache CC/Claude', 'Tỷ lệ đọc cache', 'Tỷ lệ output', 'Tỷ lệ chi phí', 'Lượt gọi agent / lượt chạy (CC)', 'Ghi cache / lượt gọi agent (CC)'], rows),
    '',
    `Kiểm lại "gấp 2,8–4 lần": theo từng ô (vòng × bài × hệ có đối chứng Claude cùng vòng) tỷ lệ ghi cache nằm trong ${f2(Math.min(...cells))}–${f2(Math.max(...cells))}; ${cells.filter((x) => x >= 2.8 && x <= 4).length}/${cells.length} ô trong khoảng 2,8–4. Tỷ lệ gộp: ${pooled.map((p) => `${p.R}/${p.sys} ${f2(p.ratio)}×`).join('; ')}. Kết luận: ${verdict}. C3, C4 không có đối chứng Claude cùng vòng nên không có hàng tỷ lệ; C6 (2 bài t3, t5) có đối chứng.`,
  ].join('\n');
}

// ---------- T-c ----------
{
  const order = ['route', 'plan', 'discuss', 'finalize', 'execute', 'review', 'revise', 'synthesize'];
  const blocks = [];
  for (const R of CONFIG.phaseTableRounds) {
    const cs = calls.filter((c) => c.run === R);
    if (!cs.length) { blocks.push(`**${R}**: ${NODATA}`); continue; }
    const nRuns = uniq(cs.map(gk)).length;
    const keys = uniq(cs.map((c) => `${c.phase}|${c.agent}`)).sort((a, b) => order.indexOf(a.split('|')[0]) - order.indexOf(b.split('|')[0]) || a.localeCompare(b));
    const rows = keys.map((k) => {
      const [phase, agent] = k.split('|');
      const g = cs.filter((c) => c.phase === phase && c.agent === agent);
      const M = (key) => f0(mean(g.map((c) => num(c[key]))));
      return [phase, agent, g.length, f1(mean(g.map((c) => num(c.tool_calls)))), M('cache_write'), M('cache_read'), M('output'), M('system_chars'), M('context_chars'), M('prompt_chars'), M('tool_output_chars'), uniq(g.map((c) => c.max_tokens)).join('/'), sum(g, (c) => num(c.retries)), f1(mean(g.map((c) => c.dur)))];
    });
    const tot = (k) => sum(cs, (c) => num(c[k]));
    blocks.push(`**${R}** — ${nRuns} lượt chạy CCoding, ${cs.length} lượt gọi agent ("Công cụ" = tool_calls TB; *_chars là ký tự; mọi cột "/ lượt gọi" là trung bình)\n\n` +
      md(['Pha', 'Agent', 'Lượt gọi', 'Công cụ TB', 'Ghi cache / lượt gọi', 'Đọc cache / lượt gọi', 'Output / lượt gọi', 'system_chars', 'context_chars', 'prompt_chars', 'tool_output_chars', 'max_tokens', 'retries (Σ)', 'Thời gian TB (s)'], rows) +
      `\n\nTổng ${R}: ghi cache ${f0(tot('cache_write'))}, đọc cache ${f0(tot('cache_read'))}, output ${f0(tot('output'))} token. Tỷ trọng ghi cache theo pha: ` +
      order.filter((p) => cs.some((c) => c.phase === p)).map((p) => `${p} ${f1((100 * sum(cs.filter((c) => c.phase === p), (c) => num(c.cache_write))) / tot('cache_write'))}%`).join(', ') + '.');
  }
  T['T-c'] = blocks.join('\n\n');
}

// ---------- T-d: đường găng ----------
const unionLen = (iv) => { const s = [...iv].sort((a, b) => a[0] - b[0]); let tot = 0, cur = null; for (const [a, b] of s) { if (!cur || a > cur[1]) { if (cur) tot += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); } if (cur) tot += cur[1] - cur[0]; return tot / 1000; };
{
  const order = ['route', 'plan', 'discuss', 'finalize', 'execute', 'review', 'revise', 'synthesize'];
  const cp = [];
  for (const r of runs.filter((x) => isCC(x.system))) {
    const cs = callsOf(r);
    if (!cs.length) continue;
    const per = {};
    for (const ph of uniq(cs.map((c) => c.phase))) {
      const g = cs.filter((c) => c.phase === ph);
      per[ph] = { n: g.length, serial: sum(g, (c) => c.dur), span: unionLen(g.map((c) => [c.t - c.dur * 1000, c.t])) };
    }
    cp.push({ r, wall: r.wall, serial: sum(Object.values(per), (p) => p.serial), span: sum(Object.values(per), (p) => p.span), per });
  }
  const rowsP = [], rowsR = [];
  for (const R of CONFIG.rounds) {
    const ks = cp.filter((x) => x.r.run === R);
    if (!ks.length) { rowsR.push([R, NODATA, '', '', '', '', '', '']); continue; }
    for (const ph of order) {
      const g = ks.filter((x) => x.per[ph]);
      if (!g.length) continue;
      const s = mean(g.map((x) => x.per[ph].serial)), p = mean(g.map((x) => x.per[ph].span));
      rowsP.push([R, ph, g.length, f1(mean(g.map((x) => x.per[ph].n))), f1(s), f1(p), f2(s / p)]);
    }
    rowsR.push([R, ks.length, f0(mean(ks.map((x) => x.wall))), f0(mean(ks.map((x) => x.serial))), f0(mean(ks.map((x) => x.span))), f0(mean(ks.map((x) => x.serial - x.span))), f0(mean(ks.map((x) => x.wall - x.span))), f1(100 * mean(ks.map((x) => (x.serial - x.span) / x.serial)))]);
  }
  // (3) chi phí cố định của điều phối so với thời gian Sonnet đơn cần cho cả bài
  const sonnetWall = (t) => mean(runs.filter((r) => r.run === CONFIG.sonnetRound && r.system === 'claude-sonnet' && r.task === t).map((r) => r.wall));
  const sonnetN = (t) => runs.filter((r) => r.run === CONFIG.sonnetRound && r.system === 'claude-sonnet' && r.task === t).length;
  const G = { plan: ['route', 'plan', 'discuss', 'finalize'], review: ['review', 'revise'], exec: ['execute'] };
  const split = (x) => { const sp = (phs) => sum(phs, (ph) => (x.per[ph] ? x.per[ph].span : 0)); const plan = sp(G.plan), rev = sp(G.review), exe = sp(G.exec); const merge = x.wall - plan - rev - exe; return { plan, rev, merge, exe, ovh: plan + rev + merge, wall: x.wall }; };
  const tasksD = uniq(runs.filter((r) => r.run === CONFIG.sonnetRound).map((r) => r.task)).sort();
  const rowsO = [];
  const mkSet = (label, rounds) => {
    const parts = [];
    for (const t of tasksD) {
      const ks = cp.filter((x) => x.r.task === t && rounds.includes(x.r.run) && !CONFIG.hung(x.r)).map(split);
      if (!ks.length) continue;
      const m = (k) => mean(ks.map((x) => x[k]));
      const sw = sonnetWall(t);
      parts.push({ t, n: ks.length, plan: m('plan'), rev: m('rev'), merge: m('merge'), exe: m('exe'), ovh: m('ovh'), wall: m('wall'), sw });
      rowsO.push([label, t, ks.length, f1(m('plan')), f1(m('rev')), f1(m('merge')), f1(m('ovh')), f1(m('exe')), f1(m('wall')), `${f1(sw)} (n=${sonnetN(t)})`, f1((100 * m('ovh')) / sw), f1((100 * m('exe')) / sw)]);
    }
    const S = (k) => sum(parts, (x) => x[k]);
    rowsO.push([label, 'Σ 5 bài', '', f1(S('plan')), f1(S('rev')), f1(S('merge')), f1(S('ovh')), f1(S('exe')), f1(S('wall')), f1(S('sw')), f1((100 * S('ovh')) / S('sw')), f1((100 * S('exe')) / S('sw'))]);
    return { S, parts };
  };
  const dC7 = mkSet(CONFIG.sonnetRound + ' (cùng thời điểm với Sonnet đơn)', [CONFIG.sonnetRound]);
  const dAll = mkSet(CONFIG.fastRounds[0] + '–' + CONFIG.fastRounds[CONFIG.fastRounds.length - 1] + ' (bỏ lượt treo)', CONFIG.fastRounds);
  const part3 = [
    '**(3) Chi phí cố định của điều phối (làn nhanh) so với thời gian Sonnet đơn cần cho cả bài** — chia thời gian tường của làn nhanh thành: lập kế hoạch = Σ đường găng pha route/plan/discuss/finalize; review = pha review + revise; gộp + ngoài LLM = thời gian tường − (kế hoạch + review + execute), gồm pha tổng hợp, tạo/gộp worktree, chạy kiểm tra dự án, chờ (là phần dư, có thể gồm nhiễu); execute = đường găng pha execute. "Cố định" = kế hoạch + review + gộp/ngoài LLM, tức phần một agent đơn không phải trả. Mẫu số = TB thời gian tường của claude-sonnet ở ' + SONNET_RD + ' (n ghi trong ngoặc). Lượt treo C5 t3 lượt 1 bị bỏ khỏi tập gộp.',
    '',
    md(['Tập', 'Bài', 'n làn nhanh', 'Kế hoạch (s)', 'Review (s)', 'Gộp + ngoài LLM (s)', 'Cố định (s)', 'Execute (s)', 'Thời gian tường (s)', 'Sonnet đơn TB (s)', 'Cố định / Sonnet đơn (%)', 'Execute / Sonnet đơn (%)'], rowsO),
    '',
    `Đọc: ở ${SONNET_RD} (cùng thời điểm) phần cố định bằng ${f1((100 * dC7.S('ovh')) / dC7.S('sw'))}% tổng thời gian Sonnet đơn cần cho 5 bài; gộp ${CONFIG.fastRounds[0]}–${CONFIG.fastRounds.at(-1)} là ${f1((100 * dAll.S('ovh')) / dAll.S('sw'))}%. Ở ${SONNET_RD}, riêng phần execute của làn nhanh đã dài hơn cả bài Sonnet đơn ở: ${dC7.parts.filter((x) => x.exe > x.sw).map((x) => x.t.split('-')[0]).join(', ') || 'không bài nào'} (cột "Execute / Sonnet đơn" > 100%); làn nhanh chỉ có thể thắng khi execute song song + phần cố định < thời gian một agent.`,
  ];
  T['T-d'] = [
    '**(1) Theo pha** — "tuần tự" = Σ thời gian các lượt gọi trong pha; "đường găng pha" = độ dài hợp các khoảng [ts − duration_s, ts] (thời gian thực khi các lượt chạy song song); hệ số = tuần tự / găng.',
    '',
    md(['Vòng', 'Pha', 'Số lượt chạy có pha', 'Lượt gọi / lượt chạy', 'Tuần tự TB (s)', 'Đường găng pha TB (s)', 'Hệ số song song'], rowsP),
    '',
    '**(2) Theo lượt chạy** — đường găng LLM = Σ đường găng các pha (giả định các pha nối tiếp nhau); "ngoài LLM" = thời gian tường − đường găng LLM (chạy kiểm tra, tạo/gộp worktree, chờ, điều phối; có thể âm do làm tròn duration_s).',
    '',
    md(['Vòng', 'Số lượt chạy', 'Thời gian tường TB (s)', 'Σ tuần tự LLM TB (s)', 'Đường găng LLM TB (s)', 'Tiết kiệm nhờ song song TB (s)', 'Ngoài LLM TB (s)', 'Tiết kiệm / tuần tự (%)'], rowsR),
    '',
    ...part3,
  ].join('\n');
}

// ---------- T-e ----------
function ols(X, y) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  X.forEach((x, i) => { for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) A[a][b] += x[a] * x[b]; A[a][k] += x[a] * y[i]; } });
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((r, i) => r[k] / r[i]);
}
const price = {}; // mô hình → {out, cr, cw} USD / triệu token
{
  const rows = [];
  for (const m of ['opus', 'sonnet']) {
    const cs = calls.filter((c) => c.requested_model === m);
    const X = cs.map((c) => [num(c.output) / 1e6, num(c.cache_read) / 1e6, num(c.cache_write) / 1e6]);
    const y = cs.map((c) => num(c.cost_usd));
    const b = ols(X, y);
    const ym = mean(y);
    const ssRes = sum(y.map((v, i) => (v - (X[i][0] * b[0] + X[i][1] * b[1] + X[i][2] * b[2])) ** 2)), ssTot = sum(y, (v) => (v - ym) ** 2);
    price[m] = { out: b[0], cr: b[1], cw: b[2] };
    rows.push([m, cs.length, f2(b[0]), f3(b[1]), f2(b[2]), f3(1 - ssRes / ssTot)]);
  }
  T['T-e0'] = md(['Mô hình (requested)', 'Số lượt gọi', 'Giá đầu ra (USD/triệu token)', 'Giá đọc cache', 'Giá ghi cache', 'R²'], rows) +
    '\n\nGiá hiệu dụng suy ra bằng bình phương tối thiểu từ calls.csv (cost_usd ~ output + cache_read + cache_write, không hệ số tự do; input bỏ vì ≈ 0). Nhãn mô hình trộn cả lượt haiku phụ, nên đây là giá HIỆU DỤNG chỉ dùng quy đổi tương đối, không phải bảng giá niêm yết.';
}
const cwModel = {}; // ghi cache của một lượt gọi ~ F + a·token(chars) + b·output
{
  const chars = (c) => num(c.system_chars) + num(c.context_chars) + num(c.prompt_chars) + num(c.tool_output_chars);
  const X = calls.map((c) => [1, chars(c) / CONFIG.charsPerToken, num(c.output)]);
  const y = calls.map((c) => num(c.cache_write));
  const b = ols(X, y);
  const ym = mean(y);
  const ssRes = sum(y.map((v, i) => (v - (X[i][0] * b[0] + X[i][1] * b[1] + X[i][2] * b[2])) ** 2)), ssTot = sum(y, (v) => (v - ym) ** 2);
  Object.assign(cwModel, { F: b[0], a: b[1], b: b[2] });
  T['T-e1'] = md(['Số lượt gọi (mọi vòng)', 'Hệ số chặn F (token / lượt gọi)', 'Hệ số theo token ngữ cảnh+công cụ (a)', 'Hệ số theo token output (b)', 'R²'], [[calls.length, f0(b[0]), f2(b[1]), f2(b[2]), f3(1 - ssRes / ssTot)]]) +
    `

Hồi quy bình phương tối thiểu: cache_write ≈ F + a·(Σ *_chars / ${CONFIG.charsPerToken}) + b·output, trên mọi dòng calls.csv. F là phần ghi cache cố định mỗi lượt gọi agent (tiền tố mà các lượt gọi không dùng chung được); nếu F nhỏ so với ghi cache TB một lượt gọi thì lượng ghi cache lớn của CCoding đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình), không phải từ tiền tố. Tương quan, không phải nhân quả; phụ thuộc giả định charsPerToken.`;
}
{
  const R = CONFIG.costBasisRound;
  const cs = calls.filter((c) => c.run === R);
  const nRuns = uniq(cs.map(gk)).length;
  const cpt = CONFIG.charsPerToken;
  const P = (c) => price[c.requested_model] || price.sonnet;
  const total = sum(cs, (c) => num(c.cost_usd));
  const tok = (ch) => ch / cpt;
  // 1 token ngữ cảnh: ghi cache 1 lần + đọc ở mỗi lượt mô hình sau (xấp xỉ bằng tool_calls)
  const ctxCost = (c, chars) => (tok(chars) / 1e6) * (P(c).cw + Math.max(num(c.tool_calls), 0) * P(c).cr);
  const byRun = {};
  cs.forEach((c) => (byRun[gk(c)] ||= []).push(c));
  const est = [];
  { // O1
    const s = sum(Object.values(byRun), (g) => (g.length - 1) * (cwModel.F / 1e6) * (price.sonnet.cw - price.sonnet.cr));
    est.push(['O1', 'Tiền tố prompt ổn định dùng chung cache', `Trần trên: phần ghi cache cố định mỗi lượt gọi F = ${f0(cwModel.F)} token (T-e1) chuyển thành đọc cache ở mọi lượt gọi sau lượt đầu của mỗi lượt chạy, tính giá sonnet. Phần hệ thống gốc của Claude Code đã được cache chéo tiến trình (claude_turns lượt 1 đọc ~33 nghìn token) nên không tính thêm`, s]);
  }
  { // O2
    let s = 0;
    for (const g of Object.values(byRun)) {
      for (const rv of g.filter((c) => c.phase === 'revise')) {
        const ex = g.filter((c) => c.phase === 'execute' && c.agent === rv.agent);
        if (!ex.length) continue;
        s += (Math.min(num(rv.cache_write), mean(ex.map((c) => num(c.cache_write)))) / 1e6) * (P(rv).cw - P(rv).cr);
      }
    }
    est.push(['O2', 'Tái dùng phiên execute → revise', `Mỗi lượt revise đọc lại tối đa min(ghi cache revise, ghi cache TB execute cùng agent) thay vì ghi; trần trên (giả định phiên còn trong TTL). Dữ liệu ${R} chỉ có ${cs.filter((c) => c.phase === 'revise').length} lượt revise`, s]);
  }
  est.push(['O3', `Rút gọn ngữ cảnh ${CONFIG.o3CtxCut * 100}%`, `Cắt ${CONFIG.o3CtxCut * 100}% context_chars ở mọi lượt gọi; mỗi token ngữ cảnh ghi 1 lần + đọc ở (tool_calls) lượt mô hình sau`, sum(cs, (c) => ctxCost(c, CONFIG.o3CtxCut * num(c.context_chars)))]);
  { // O4
    const rv = cs.filter((c) => c.phase === 'review');
    est.push(['O4', 'Reviewer chỉ nhận diff + kết quả lệnh kiểm tra', `Pha review: giảm ${CONFIG.o4PromptCut * 100}% của (context_chars + prompt_chars + tool_output_chars), giả định reviewer không tự đọc lại tệp; ${rv.length} lượt review. Chồng lấn một phần với O3`, sum(rv, (c) => ctxCost(c, CONFIG.o4PromptCut * (num(c.context_chars) + num(c.prompt_chars) + num(c.tool_output_chars))))]);
  }
  { // O5
    const g = cs.filter((c) => ['plan', 'review', 'synthesize'].includes(c.phase));
    est.push(['O5', 'Giới hạn đầu ra (plan/review/synthesize)', `Giảm ${CONFIG.o5OutCut * 100}% token output ở ${g.length} lượt gọi plan/review/synthesize; execute không đụng vì output là mã cần viết`, sum(g, (c) => (num(c.output) * CONFIG.o5OutCut / 1e6) * P(c).out)]);
  }
  let o6 = null;
  { // O6: nền riêng C1 vì C5 đã dùng sonnet cho mọi pha
    const c1 = calls.filter((c) => c.run === 'C1'), g = c1.filter((c) => c.requested_model === 'opus');
    const s = sum(g, (c) => (num(c.output) / 1e6) * (price.opus.out - price.sonnet.out) + (num(c.cache_read) / 1e6) * (price.opus.cr - price.sonnet.cr) + (num(c.cache_write) / 1e6) * (price.opus.cw - price.sonnet.cw));
    o6 = [s / uniq(c1.map(gk)).length, (100 * s) / sum(c1, (c) => num(c.cost_usd)), `Nền C1 (không phải ${R}): C1 có ${g.length} lượt gọi opus (${uniq(g.map((c) => c.phase)).join(', ')}) tính lại bằng giá hiệu dụng sonnet; ${R} đã dùng sonnet ở mọi pha (${cs.filter((c) => c.requested_model !== 'sonnet').length} lượt gọi khác sonnet) nên phần còn lại của O6 (sonnet → haiku ở review/plan) KHÔNG định giá được (hồi quy haiku không đáng tin) và chưa đo chất lượng`];
  }
  const outShare = (100 * sum(cs, (c) => (num(c.output) / 1e6) * P(c).out)) / total;
  const cwShare = (100 * sum(cs, (c) => (num(c.cache_write) / 1e6) * P(c).cw)) / total;
  const crShare = (100 * sum(cs, (c) => (num(c.cache_read) / 1e6) * P(c).cr)) / total;
  T['T-e'] = md(['Mã', 'Đề xuất', 'Tiết kiệm ước tính / lượt chạy (USD)', '% chi phí CCoding (cùng nền)', 'Giả định'], [...est.map(([id, n, a, s]) => [id, n, f3(s / nRuns), f1((100 * s) / total), a]), ['O6', 'Mô hình theo pha: opus → sonnet ở lượt gọi lead', f3(o6[0]), f1(o6[1]), o6[2]]]) +
    `\n\nNền: ${R}, ${nRuns} lượt chạy CCoding, chi phí Σ calls.csv = ${f3(total)} USD (TB ${f3(total / nRuns)} USD / lượt chạy). Theo giá hiệu dụng, đầu ra = ${f1(outShare)}% chi phí, ghi cache = ${f1(cwShare)}%, đọc cache = ${f1(crShare)}%. O1–O5 trên nền C5, O6 trên nền C1. Mỗi dòng là ước lượng ĐỘC LẬP (không cộng gộp; O3/O4 chồng lấn). Đây là mô hình giả định trên dữ liệu có sẵn, chưa chạy lại hệ thống; thời gian không được ước lượng. charsPerToken = ${cpt} (giả định).`;
}

// ---------- tiện ích: bootstrap + kiểm định hoán vị cho chênh lệch TB-các-bài của (A − B) ----------
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const combos = (n, k) => { const out = []; const rec = (st, cur) => { if (cur.length === k) { out.push([...cur]); return; } for (let i = st; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); } }; rec(0, []); return out; };
function binom(n, k) { let r = 1n; for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i); return r; }
// cells = [{a:[...], b:[...]}] theo bài; thống kê = TB các bài của (TB a − TB b). Hoán nhãn trong từng bài (phân tầng), hai phía.
function permTest(cells) {
  const stat = (cs) => mean(cs.map((c) => mean(c.a) - mean(c.b)));
  const obs = stat(cells);
  const total = cells.reduce((p, c) => p * Number(binom(c.a.length + c.b.length, c.a.length)), 1);
  const eps = 1e-9;
  if (total <= CONFIG.permMaxExact) {
    const lists = cells.map((c) => { const pool = [...c.a, ...c.b], tot = sum(pool); return combos(pool.length, c.a.length).map((ix) => { const sa = sum(ix, (i) => pool[i]); return sa / c.a.length - (tot - sa) / c.b.length; }); });
    let cnt = 0, n = 0;
    const rec = (i, acc) => { if (i === lists.length) { n++; if (Math.abs(acc / lists.length) >= Math.abs(obs) - eps) cnt++; return; } for (const d of lists[i]) rec(i + 1, acc + d); };
    rec(0, 0);
    return { p: cnt / n, n, exact: true };
  }
  const rand = rng(CONFIG.seed + 7);
  let cnt = 0;
  for (let m = 0; m < CONFIG.permMc; m++) {
    const cs = cells.map((c) => { const pool = [...c.a, ...c.b]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return { a: pool.slice(0, c.a.length), b: pool.slice(c.a.length) }; });
    if (Math.abs(stat(cs)) >= Math.abs(obs) - eps) cnt++;
  }
  return { p: (cnt + 1) / (CONFIG.permMc + 1), n: CONFIG.permMc, exact: false };
}
function bootDiff(cells) {
  const rand = rng(CONFIG.seed);
  const stat = (cs) => { const da = mean(cs.map((c) => mean(c.a))), db = mean(cs.map((c) => mean(c.b))); return [da - db, (da - db) / db]; };
  const point = stat(cells), ds = [], rel = [];
  for (let b = 0; b < CONFIG.bootstrapB; b++) {
    const [d, rr] = stat(cells.map((c) => ({ a: c.a.map(() => c.a[Math.floor(rand() * c.a.length)]), b: c.b.map(() => c.b[Math.floor(rand() * c.b.length)]) })));
    ds.push(d); rel.push(rr);
  }
  return { point, lo: quant(ds, 0.025), hi: quant(ds, 0.975), rlo: quant(rel, 0.025), rhi: quant(rel, 0.975) };
}
const fp = (t) => `${t.p < 0.0001 ? '< 0.0001' : t.p.toFixed(4)}${t.exact ? '' : '*'} (${t.n.toLocaleString('en-US').replace(/,/g, ' ')})`;

// ---------- T-f: bootstrap ----------
{
  const rows = [];
  const sets = [];
  for (const R of CONFIG.rounds) {
    if (!hasRound(R)) { sets.push({ R, none: NODATA }); continue; }
    const rs = runs.filter((r) => r.run === R);
    const tasks = uniq(rs.map((r) => r.task)).filter((t) => rs.some((r) => r.task === t && r.system === 'claude') && rs.some((r) => r.task === t && r.system === 'ccoding' || r.task === t && r.system === 'ccoding-fastlane')).sort();
    if (!tasks.length) { sets.push({ R, none: 'không có đối chứng claude (Opus) cùng vòng' + (rs.some((r) => r.system === 'claude-sonnet') ? '; đối chứng là claude-sonnet, xem T-i' : '') }); continue; }
    sets.push({ R, rounds: [R], label: 'tất cả lượt', tasks, keep: () => true });
    if (R === 'C5') sets.push({ R, rounds: [R], label: 'loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy', tasks, keep: (r) => !CONFIG.hung(r) });
  }
  if (CONFIG.pooledRounds.every(hasRound)) { // độ nhạy: gộp C5 + C6 trong từng bài (khác thời điểm, khác mã maxParallel)
    const PR = CONFIG.pooledRounds, rs = runs.filter((r) => PR.includes(r.run));
    const tasks = uniq(rs.map((r) => r.task)).filter((t) => rs.some((r) => r.task === t && r.system === 'claude') && rs.some((r) => r.task === t && isCC(r.system))).sort();
    sets.push({ R: PR.join('+'), rounds: PR, label: 'gộp lượt trong bài, bỏ lượt treo — độ nhạy', tasks, keep: (r) => !CONFIG.hung(r) });
    sets.push({ R: PR.join('+'), rounds: PR, label: 'gộp lượt trong bài, giữ lượt treo — độ nhạy', tasks, keep: () => true });
  }
  for (const s of sets) {
    if (s.none) { rows.push([s.R, '–', s.none, '', '', '', '', '', '']); continue; }
    const rs = runs.filter((r) => s.rounds.includes(r.run) && s.tasks.includes(r.task) && s.keep(r));
    const cells = s.tasks.map((t) => ({ cc: rs.filter((r) => r.task === t && r.system !== 'claude'), cl: rs.filter((r) => r.task === t && r.system === 'claude') }));
    for (const [k, name, fm] of [['wall', 'Thời gian (s)', f1], ['cost', 'Chi phí (USD)', f3]]) {
      const rand = rng(CONFIG.seed);
      const vals = cells.map((c) => ({ cc: c.cc.map((r) => r[k]), cl: c.cl.map((r) => r[k]) }));
      const stat = (cv) => { const dc = mean(cv.map((c) => mean(c.cc))), dl = mean(cv.map((c) => mean(c.cl))); return [dc - dl, (dc - dl) / dl]; };
      const point = stat(vals);
      const ds = [], rel = [];
      for (let b = 0; b < CONFIG.bootstrapB; b++) {
        const [d, rr] = stat(vals.map((c) => ({ cc: c.cc.map(() => c.cc[Math.floor(rand() * c.cc.length)]), cl: c.cl.map(() => c.cl[Math.floor(rand() * c.cl.length)]) })));
        ds.push(d); rel.push(rr);
      }
      const lo = quant(ds, 0.025), hi = quant(ds, 0.975);
      const pt = permTest(vals.map((c) => ({ a: c.cc, b: c.cl })));
      rows.push([s.R, s.label, name, `${s.tasks.length} bài; ${sum(vals, (c) => c.cc.length)} CC / ${sum(vals, (c) => c.cl.length)} Claude`, fm(point[0]), `[${fm(lo)}; ${fm(hi)}]`, `${f1(100 * point[1])}% [${f1(100 * quant(rel, 0.025))}; ${f1(100 * quant(rel, 0.975))}]`, fp(pt), lo > 0 ? 'CC > Claude' : hi < 0 ? 'CC < Claude' : 'CI chứa 0']);
    }
  }
  T['T-f'] = [
    `> **MINH HỌA, n nhỏ — không đủ lực thống kê để khái quát.** Mỗi ô (bài × hệ) chỉ 1–2 lượt. Bootstrap phân tầng theo bài (lấy lại mẫu các lượt trong từng ô; B = ${CONFIG.bootstrapB}, seed = ${CONFIG.seed}, phân vị 2,5/97,5); thống kê = TB các bài của (CCoding − Claude). CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế (thiếu nhiễu giữa bài/ngày/hạn mức). Các hệ ccoding* trong cùng vòng gộp thành "CC".`,
    '',
    md(['Vòng', 'Tập con', 'Chỉ số', 'Cỡ mẫu', 'Chênh lệch (CC − Claude)', 'CI 95% (bootstrap)', 'Chênh lệch tương đối so với Claude [CI]', 'p hoán vị hai phía (số hoán vị)', 'Nhận xét'], rows),
    '',
    `p hoán vị: hoán nhãn hệ trong từng bài (phân tầng), thống kê = TB các bài của chênh lệch TB; liệt kê đủ mọi hoán vị khi ≤ ${CONFIG.permMaxExact.toExponential(0)} (dấu * = lấy mẫu ${CONFIG.permMc} hoán vị). Với n nhỏ, p tối thiểu bị chặn bởi số hoán vị (vd. C6: 2 bài × C(4,2) = 6 mỗi bài ⇒ 36 hoán vị ⇒ p nhỏ nhất 2/36 = 0.0556). "Claude" ở T-f = hệ claude (Opus); vòng C7 không có hệ này nên xem T-i.`,
    '',
    'C6 chỉ có 2 bài (t3, t5), 2 lượt mỗi ô nên CI của dòng C6 càng chỉ là minh họa. Hai dòng "C5+C6" trộn hai thời điểm và hai phiên bản mã (C6 sau d7600f6: maxParallel 4), và được chọn SAU khi thấy dữ liệu: coi là độ nhạy, không phải kết quả chính.',
  ].join('\n');
}

// ---------- T-g: tỉ lệ thời gian / chi phí theo bài, C5 vs C6 vs gộp ----------
{
  const PR = CONFIG.pooledRounds;
  const ratio = (rs, key) => { const cc = rs.filter((r) => isCC(r.system)), cl = rs.filter((r) => r.system === 'claude'); return cc.length && cl.length ? mean(cc.map((r) => r[key])) / mean(cl.map((r) => r[key])) : NaN; };
  const cell = (rs, key) => { const v = ratio(rs, key); return Number.isFinite(v) ? f2(v) : '–'; };
  const inR = (R) => runs.filter((r) => R.includes(r.run));
  const tasks = uniq(inR(PR).map((r) => r.task)).sort();
  const rowsT = [], rowsC = [];
  for (const t of tasks) {
    const g = (R, keep = () => true) => inR(R).filter((r) => r.task === t && keep(r));
    const n = (rs) => `${rs.filter((r) => isCC(r.system)).length}/${rs.filter((r) => r.system === 'claude').length}`;
    const nh = !g(PR).every((r) => !CONFIG.hung(r));
    rowsT.push([t, `${cell(g(['C5']), 'wall')} (${n(g(['C5']))})`, hasRound('C6') && g(['C6']).length ? `${cell(g(['C6']), 'wall')} (${n(g(['C6']))})` : '–', `${cell(g(PR, (r) => !CONFIG.hung(r)), 'wall')} (${n(g(PR, (r) => !CONFIG.hung(r)))})`, nh ? `${cell(g(PR), 'wall')} (${n(g(PR))})` : '(như cột trước)']);
    rowsC.push([t, cell(g(['C5']), 'cost'), g(['C6']).length ? cell(g(['C6']), 'cost') : '–', cell(g(PR, (r) => !CONFIG.hung(r)), 'cost')]);
  }
  const all = (keep) => { const per = tasks.map((t) => ratio(inR(PR).filter((r) => r.task === t && keep(r)), 'wall')); return mean(per); };
  T['T-g'] = [
    'Tỉ lệ = TB thời gian (CCoding làn nhanh) / TB thời gian (Claude Code) trong cùng ô; < 1 nghĩa là CCoding nhanh hơn. Trong ngoặc: số lượt CCoding/Claude. Cột "C5+C6" gộp mọi lượt của bài trong hai vòng (trộn thời điểm và phiên bản mã; Claude Code t3 chạy 155–160 s ở C5 nhưng 246–258 s ở C6 nên gộp không loại được nhiễu thời điểm).',
    '',
    md(['Bài', 'Tỉ lệ thời gian C5 (mọi lượt)', 'C6', 'C5+C6 (bỏ lượt treo)', 'C5+C6 (giữ lượt treo)'], rowsT),
    '',
    `TB không trọng số các bài của tỉ lệ C5+C6: ${f2(all((r) => !CONFIG.hung(r)))} (bỏ lượt treo), ${f2(all(() => true))} (giữ lượt treo).`,
    '',
    md(['Bài', 'Tỉ lệ chi phí C5', 'C6', 'C5+C6 (bỏ lượt treo)'], rowsC),
  ].join('\n');
}

// ---------- T-h: ba hệ (Opus, Sonnet, làn nhanh) theo bài ----------
const rangeLbl = `${CONFIG.fastRounds[0]}–${CONFIG.fastRounds[CONFIG.fastRounds.length - 1]}`;
const SYS3 = {
  opus: (r) => r.system === 'claude' && CONFIG.opusRounds.includes(r.run),
  sonnet: (r) => r.system === 'claude-sonnet' && r.run === CONFIG.sonnetRound,
  fast: (r) => isCC(r.system) && CONFIG.fastRounds.includes(r.run) && !CONFIG.hung(r),
  fastC7: (r) => isCC(r.system) && r.run === CONFIG.sonnetRound,
};
const tasks3 = uniq(runs.filter(SYS3.sonnet).map((r) => r.task)).sort();
const cell3 = (k, t) => runs.filter((r) => SYS3[k](r) && r.task === t);
{
  const label = { opus: `Claude Code Opus (${CONFIG.opusRounds.join('–')})`, sonnet: `Claude Code Sonnet (${CONFIG.sonnetRound})`, fast: `Làn nhanh (${rangeLbl}, bỏ lượt treo)`, fastC7: `Làn nhanh (chỉ ${CONFIG.sonnetRound})` };
  const rows = [], avg = { opus: [], sonnet: [], fast: [], fastC7: [] };
  for (const t of tasks3) {
    const sw = mean(cell3('sonnet', t).map((r) => r.wall)), sc = mean(cell3('sonnet', t).map((r) => r.cost));
    for (const k of ['opus', 'sonnet', 'fast', 'fastC7']) {
      const g = cell3(k, t);
      if (!g.length) continue;
      const w = mean(g.map((r) => r.wall)), c = mean(g.map((r) => r.cost));
      avg[k].push({ w, c, rw: w / sw, rc: c / sc });
      rows.push([t, label[k], g.length, f0(w), f3(c), `${sum(g, (r) => r.hp)}/${sum(g, (r) => r.ht)}`, `${g.filter((r) => r.hp === r.ht).length}/${g.length}`, f2(w / sw), f2(c / sc)]);
    }
  }
  for (const k of ['opus', 'sonnet', 'fast', 'fastC7']) {
    const a = avg[k];
    rows.push(['TB các bài (không trọng số)', label[k], sum(tasks3, (t) => cell3(k, t).length), f0(mean(a.map((x) => x.w))), f3(mean(a.map((x) => x.c))), '', '', f2(mean(a.map((x) => x.rw))), f2(mean(a.map((x) => x.rc)))]);
  }
  const hungRuns = runs.filter((r) => isCC(r.system) && CONFIG.fastRounds.includes(r.run) && CONFIG.hung(r));
  const brief = tasks3.map((t) => {
    const mine = ['opus', 'sonnet', 'fast'].map((k) => Math.round(mean(cell3(k, t).map((r) => r.wall))));
    const ref = CONFIG.briefTimes[t];
    return `${t.split('-')[0]} ${mine.join('/')}${ref && ref.every((v, i) => v === mine[i]) ? ' khớp' : ' LỆCH (BRIEF-2: ' + (ref ? ref.join('/') : '–') + ')'}`;
  });
  const cr = tasks3.map((t) => mean(cell3('fast', t).map((r) => r.cost)) / mean(cell3('sonnet', t).map((r) => r.cost)));
  const tr = tasks3.map((t) => mean(cell3('fast', t).map((r) => r.wall)) / mean(cell3('sonnet', t).map((r) => r.wall)));
  const tr7 = tasks3.map((t) => mean(cell3('fastC7', t).map((r) => r.wall)) / mean(cell3('sonnet', t).map((r) => r.wall)));
  T['T-h'] = [
    'Trung bình thời gian tường, chi phí và test ẩn theo bài cho ba hệ; mỗi hàng ghi n (số lượt). Hai cột cuối = tỉ lệ so với Sonnet đơn (' + SONNET_RD + ') của cùng bài; > 1 nghĩa là chậm hơn / đắt hơn Sonnet đơn. Opus = hệ `claude` (Claude Code mặc định) ở C5–C6; Sonnet = hệ `claude-sonnet` ở ' + SONNET_RD + ' (cùng lúc với làn nhanh ' + SONNET_RD + '); làn nhanh = hệ `ccoding-fastlane`. **Mẫu rất nhỏ (n = 1–5 mỗi ô, số lượt mỗi ô xem cột n): minh họa.**',
    '',
    md(['Bài', 'Hệ (vòng)', 'n', 'Thời gian TB (s)', 'Chi phí TB (USD)', 'Test ẩn đạt/tổng', 'Đạt trọn', 'Thời gian / Sonnet đơn', 'Chi phí / Sonnet đơn'], rows),
    '',
    `Lượt bị bỏ khỏi "làn nhanh (${rangeLbl})": ${hungRuns.length ? hungRuns.map((r) => `${r.run} ${r.task} lượt ${r.rep} (${r.wall} s, task ${r.task_id}) — treo stdin của harness; lượt còn lại cùng ô chạy ${runs.filter((x) => x.run === r.run && x.task === r.task && isCC(x.system) && x !== r).map((x) => x.wall).join(', ')} s`).join('; ') : 'không có'}. Không lượt nào khác bị bỏ.`,
    '',
    `Đối chiếu số thời gian trong BRIEF-2 (Opus/Sonnet/làn nhanh, làm tròn s): ${brief.join(' · ')}.`,
    '',
    `Tỉ lệ làn nhanh (${rangeLbl}, bỏ lượt treo) / Sonnet đơn: thời gian ${tasks3.map((t, i) => `${t.split('-')[0]} ${f2(tr[i])}`).join(' · ')}; chi phí ${tasks3.map((t, i) => `${t.split('-')[0]} ${f2(cr[i])}`).join(' · ')} (BRIEF-2: chi phí ${CONFIG.briefCostRatio.join('–')}×: ${Math.min(...cr) >= CONFIG.briefCostRatio[0] - 0.05 && Math.max(...cr) <= CONFIG.briefCostRatio[1] + 0.05 ? 'khớp' : 'LỆCH'}). Chỉ dùng lượt ${SONNET_RD} của làn nhanh (cùng thời điểm): thời gian ${tasks3.map((t, i) => `${t.split('-')[0]} ${f2(tr7[i])}`).join(' · ')}.`,
  ].join('\n');
}

// ---------- T-i: chênh lệch kèm CI bootstrap và p hoán vị ----------
{
  const pairs = [
    ['Làn nhanh − Sonnet đơn', SONNET_RD + ', cùng thời điểm', 'fastC7', 'sonnet'],
    ['Làn nhanh − Opus', `${CONFIG.opusRounds.join('–')}, bỏ lượt treo`, null, 'opus', CONFIG.opusRounds],
    ['Làn nhanh − Opus', `làn nhanh ${rangeLbl} (bỏ lượt treo) so với Opus ${CONFIG.opusRounds.join('–')} (như T-h)`, 'fast', 'opus'],
    ['Sonnet đơn − Opus', `${SONNET_RD} so với ${CONFIG.opusRounds.join('–')} (khác thời điểm; tách phần do mô hình)`, 'sonnet', 'opus'],
  ];
  const rows = [];
  for (const [name, set, ka, kb, rounds] of pairs) {
    const A = rounds ? (r) => isCC(r.system) && rounds.includes(r.run) && !CONFIG.hung(r) : SYS3[ka];
    const B = SYS3[kb];
    const ts = tasks3.filter((t) => runs.some((r) => A(r) && r.task === t) && runs.some((r) => B(r) && r.task === t));
    const nCells = ts.map((t) => `${t.split('-')[0]} ${runs.filter((r) => A(r) && r.task === t).length}/${runs.filter((r) => B(r) && r.task === t).length}`).join(' · ');
    for (const [key, mname, fm] of [['wall', 'Thời gian (s)', f1], ['cost', 'Chi phí (USD)', f3]]) {
      const cells = ts.map((t) => ({ a: runs.filter((r) => A(r) && r.task === t).map((r) => r[key]), b: runs.filter((r) => B(r) && r.task === t).map((r) => r[key]) }));
      const bt = bootDiff(cells), pt = permTest(cells);
      rows.push([name, set, mname, nCells, fm(bt.point[0]), `[${fm(bt.lo)}; ${fm(bt.hi)}]`, `${f1(100 * bt.point[1])}% [${f1(100 * bt.rlo)}; ${f1(100 * bt.rhi)}]`, fp(pt), `${bt.lo > 0 ? 'A > B' : bt.hi < 0 ? 'A < B' : 'CI chứa 0'}; p ${pt.p < 0.05 ? '< 0.05' : '≥ 0.05'}`]);
    }
  }
  T['T-i'] = [
    `> **MINH HỌA, n nhỏ.** Thống kê = TB 5 bài của (TB hệ A − TB hệ B); bootstrap phân tầng theo bài (B = ${CONFIG.bootstrapB}, seed = ${CONFIG.seed}, phân vị 2,5/97,5); p hoán vị hai phía bằng cách hoán nhãn hệ trong từng bài (liệt kê đủ mọi hoán vị; số hoán vị trong ngoặc, nên p nhỏ nhất bị chặn bởi số này: dòng có ô nhỏ có ít hoán vị nên p nhỏ nhất lớn). **Cảnh báo:** khi ô chỉ có 1–3 lượt (cột "n mỗi ô"), bootstrap chỉ lấy lại mẫu vài giá trị và CI hẹp một cách giả tạo; dùng p hoán vị và chênh lệch theo bài (T-h) thay vì CI. Cột "n mỗi ô" ghi số lượt A/B theo từng bài. Không hiệu chỉnh so sánh bội (4 cặp × 2 chỉ số); CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế.`,
    '',
    md(['Cặp (A − B)', 'Tập', 'Chỉ số', 'n mỗi ô (A/B)', 'Chênh lệch', 'CI 95% (bootstrap)', 'Tương đối so với B [CI]', 'p hoán vị hai phía (số hoán vị)', 'Nhận xét'], rows),
    '',
    'Hàng 1 là phép so sánh cùng thời điểm, cùng mô hình (Sonnet) nên là kết quả chính cho RQ3; hàng 2–3 trộn hiệu ứng mô hình (Opus so với Sonnet) với hiệu ứng điều phối; hàng 4 đo riêng phần do mô hình (và thời điểm).',
  ].join('\n');
}

// ---------- đầu ra / kiểm tra ----------
const TITLES = {
  'T-0': 'T-0. Schema, đơn vị và đối chiếu giữa các tệp',
  'T-a': 'T-a. Kết quả theo vòng × bài × hệ (trung bình các lượt lặp)',
  'T-b': 'T-b. Tỷ lệ ghi cache CCoding / Claude (kiểm lại "2,8–4 lần")',
  'T-c': 'T-c. Phân rã CCoding theo pha × agent',
  'T-d': 'T-d. Đường găng theo pha (tuần tự so với song song)',
  'T-e0': 'T-e0. Giá hiệu dụng suy ra (nền cho T-e)',
  'T-e1': 'T-e1. Mô hình ghi cache theo lượt gọi (nền cho O1)',
  'T-e': 'T-e. Ước lượng định lượng cho O1–O6',
  'T-f': 'T-f. Bootstrap CI 95% cho chênh lệch thời gian / chi phí',
  'T-g': 'T-g. Tỉ lệ thời gian và chi phí làn nhanh / Claude theo bài: C5, C6, gộp C5+C6',
  'T-h': 'T-h. Ba hệ theo bài: Claude Code Opus, Claude Code Sonnet, làn nhanh CCoding',
  'T-i': 'T-i. Chênh lệch thời gian / chi phí giữa các hệ: CI bootstrap và p hoán vị',
};
const render = (k) => `### ${TITLES[k]}\n\n${T[k]}\n`;
const ti = args.indexOf('--table'), ci = args.indexOf('--check');
if (ci >= 0) {
  const doc = fs.readFileSync(path.resolve(args[ci + 1]), 'utf8').replace(/\r\n/g, '\n');
  // Vòng có trong results/ (thư mục hoặc runs.csv) mà bảng chưa ghi ở T-0 ⇒ bảng cũ: báo rõ, thoát mã 1 (không crash, không im lặng).
  // PHỤ THUỘC LỜI VĂN: regex dưới đây đọc đúng câu "vòng có trong runs.csv: …" do dòng 140 sinh ra trong T-0.
  // Đổi lời văn ở dòng 140 mà không đổi regex này thì --check sẽ báo thiếu mọi vòng.
  const inDoc = (doc.match(/vòng có trong runs\.csv: ([C0-9, ]+)\./) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
  const newer = uniq([...dirRounds, ...roundsPresent]).filter((R) => !inDoc.includes(R)).sort((a, b) => roundNo(a) - roundNo(b));
  if (newer.length) { console.error(`Bảng cũ: results/ có vòng ${newer.join(', ')} chưa có trong T-0 (${inDoc.join(', ') || 'không đọc được danh sách vòng'}); chạy lại script để sinh bảng`); process.exit(1); }
  const miss = Object.keys(T).filter((k) => !doc.includes(render(k)));
  if (miss.length) { console.error(`LỆCH: bảng không trùng đầu ra script: ${miss.join(', ')}`); process.exit(1); }
  console.log(`OK: ${Object.keys(T).length} bảng trong ${args[ci + 1]} trùng đầu ra script.`);
} else if (ti >= 0) {
  const k = args[ti + 1];
  if (!T[k]) { console.error(`Bảng không tồn tại: ${k} (có: ${Object.keys(T).join(', ')})`); process.exit(2); }
  process.stdout.write(render(k));
} else {
  console.log(`<!-- sinh bởi token-analysis.mjs; vòng trong summary.json: ${Object.keys(summary.summary || {}).join(', ')}; C6: ${hasRound('C6') ? 'có' : NODATA}; C7: ${hasRound('C7') ? 'có' : NODATA}; nguồn: ${CONFIG.sourceCommit} -->\n`);
  for (const k of Object.keys(T)) console.log(render(k));
}
