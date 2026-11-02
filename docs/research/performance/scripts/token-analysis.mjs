#!/usr/bin/env node
// Phân tích token / cache / thời gian cho benchtest CCoding vs Claude Code thuần (RQ3).
// Node >= 22, không phụ thuộc ngoài, chạy offline. Chỉ đọc bench/vs-claude/results/, in Markdown ra stdout.
//
//   node docs/research/performance/scripts/token-analysis.mjs                 # in toàn bộ bảng T-0 … T-f
//   node docs/research/performance/scripts/token-analysis.mjs --table T-b     # in một bảng
//   node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
//        # kiểm tra mọi bảng trong tệp .md trùng từng ký tự với đầu ra script (exit 1 nếu lệch)
//
// Tham số giả định: xem khối CONFIG.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.resolve(HERE, '../../../../bench/vs-claude/results');

const CONFIG = {
  seed: 20261102, // seed bootstrap cố định
  bootstrapB: 10000,
  charsPerToken: 3.5, // GIẢ ĐỊNH: ký tự/token (tiếng Việt + mã trộn); dùng đổi *_chars → token
  o3CtxCut: 0.3, // O3: cắt 30% context_chars
  o4PromptCut: 0.5, // O4: reviewer giảm 50% context+prompt+tool_output
  o5OutCut: 0.2, // O5: giảm 20% token đầu ra ở pha plan/review/synthesize
  rounds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  phaseTableRounds: ['C1', 'C5'],
  costBasisRound: 'C5', // vòng làm nền cho T-e (thiết kế hiện hành)
};

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
const runs = load('runs.csv').map((r) => ({ ...r, rep: +r.rep, wall: num(r.wall_s), cost: num(r.cost_usd), hp: num(r.hidden_pass), ht: num(r.hidden_total), inp: num(r.input), out: num(r.output), cr: num(r.cache_read), cw: num(r.cache_write) }));
const calls = load('calls.csv').map((c) => ({ ...c, rep: +c.rep, t: Date.parse(c.ts), dur: num(c.duration_s) }));
const phasesCsv = load('phases.csv');
const turns = load('claude_turns.csv').map((t) => ({ ...t, rep: +t.rep }));
const summary = JSON.parse(fs.readFileSync(path.join(RESULTS, 'summary.json'), 'utf8'));

const isCC = (s) => s.startsWith('ccoding');
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
    ['claude_turns.csv', 'input / cache_read / cache_write (_1h, _5m)', 'token theo TỪNG lượt mô hình của Claude Code; cache_write = _1h + _5m', 'Claude (chỉ C1, C2, C5)'],
    ['claude_turns.csv', 'output_partial', 'token đầu ra từ luồng sự kiện từng phần — KHÔNG dùng (≪ output thật trong runs.csv)', 'Claude'],
  ];
  const ccRuns = runs.filter((x) => isCC(x.system)), clRuns = runs.filter((x) => x.system === 'claude');
  const badCC = ccRuns.filter((r) => { const cs = callsOf(r); return !(cs.length && sum(cs, (c) => num(c.input)) === r.inp && sum(cs, (c) => num(c.output)) === r.out && sum(cs, (c) => num(c.cache_read)) === r.cr && sum(cs, (c) => num(c.cache_write)) === r.cw); }).map(rk);
  const badCl = clRuns.filter((r) => { const ts = turnsOf(r); return !(ts.length && sum(ts, (t) => num(t.cache_read)) === r.cr && sum(ts, (t) => num(t.cache_write)) === r.cw && sum(ts, (t) => num(t.cache_write_1h) + num(t.cache_write_5m)) === r.cw); }).map(rk);
  const w1h = sum(turns, (t) => num(t.cache_write_1h)), w5 = sum(turns, (t) => num(t.cache_write_5m));
  T['T-0'] = [
    md(['Tệp', 'Cột', 'Đơn vị / ý nghĩa', 'Áp dụng'], schema),
    '',
    `Đối chiếu: ${ccRuns.length - badCC.length}/${ccRuns.length} lượt CCoding có Σ(calls.csv) = runs.csv về input/output/cache_read/cache_write${badCC.length ? ' (lệch: ' + badCC.join('; ') + ')' : ''}; ${clRuns.length - badCl.length}/${clRuns.length} lượt Claude có Σ(claude_turns.csv) = runs.csv về cache_read/cache_write${badCl.length ? ' (lệch: ' + badCl.join('; ') + ')' : ''}.`,
    '',
    `Quy đổi: runs.csv là nguồn chuẩn cho tổng. calls.csv (CCoding, theo lượt gọi agent = một tiến trình) và claude_turns.csv (Claude, theo lượt mô hình) KHÔNG cùng độ mịn, nên so sánh chỉ ở mức tổng theo lượt chạy hoặc "mỗi lượt gọi agent" (CCoding) với "mỗi lượt chạy" (Claude). claude_turns.csv có ở các vòng: ${uniq(turns.map((t) => t.run)).sort().join(', ')}; không có events.jsonl trong results/C*/.`,
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
    `Kiểm lại "gấp 2,8–4 lần": theo từng ô (vòng × bài × hệ có đối chứng Claude cùng vòng) tỷ lệ ghi cache nằm trong ${f2(Math.min(...cells))}–${f2(Math.max(...cells))}; ${cells.filter((x) => x >= 2.8 && x <= 4).length}/${cells.length} ô trong khoảng 2,8–4. Tỷ lệ gộp: ${pooled.map((p) => `${p.R}/${p.sys} ${f2(p.ratio)}×`).join('; ')}. Kết luận: ${verdict}. C3, C4 không có đối chứng Claude cùng vòng nên không có hàng tỷ lệ; C6: ${NODATA}.`,
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
  T['T-d'] = [
    '**(1) Theo pha** — "tuần tự" = Σ thời gian các lượt gọi trong pha; "đường găng pha" = độ dài hợp các khoảng [ts − duration_s, ts] (thời gian thực khi các lượt chạy song song); hệ số = tuần tự / găng.',
    '',
    md(['Vòng', 'Pha', 'Số lượt chạy có pha', 'Lượt gọi / lượt chạy', 'Tuần tự TB (s)', 'Đường găng pha TB (s)', 'Hệ số song song'], rowsP),
    '',
    '**(2) Theo lượt chạy** — đường găng LLM = Σ đường găng các pha (giả định các pha nối tiếp nhau); "ngoài LLM" = thời gian tường − đường găng LLM (chạy kiểm tra, tạo/gộp worktree, chờ, điều phối; có thể âm do làm tròn duration_s).',
    '',
    md(['Vòng', 'Số lượt chạy', 'Thời gian tường TB (s)', 'Σ tuần tự LLM TB (s)', 'Đường găng LLM TB (s)', 'Tiết kiệm nhờ song song TB (s)', 'Ngoài LLM TB (s)', 'Tiết kiệm / tuần tự (%)'], rowsR),
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

// ---------- T-f: bootstrap ----------
{
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const rows = [];
  const sets = [];
  for (const R of CONFIG.rounds) {
    if (!hasRound(R)) { sets.push({ R, none: NODATA }); continue; }
    const rs = runs.filter((r) => r.run === R);
    const tasks = uniq(rs.map((r) => r.task)).filter((t) => rs.some((r) => r.task === t && r.system === 'claude') && rs.some((r) => r.task === t && r.system === 'ccoding' || r.task === t && r.system === 'ccoding-fastlane')).sort();
    if (!tasks.length) { sets.push({ R, none: 'không có đối chứng Claude cùng vòng' }); continue; }
    sets.push({ R, label: 'tất cả lượt', tasks, keep: () => true });
    if (R === 'C5') sets.push({ R, label: 'loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy', tasks, keep: (r) => !(r.task === 't3-api' && r.rep === 1 && isCC(r.system)) });
  }
  for (const s of sets) {
    if (s.none) { rows.push([s.R, '–', s.none, '', '', '', '', '']); continue; }
    const rs = runs.filter((r) => r.run === s.R && s.tasks.includes(r.task) && s.keep(r));
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
      rows.push([s.R, s.label, name, `${s.tasks.length} bài; ${sum(vals, (c) => c.cc.length)} CC / ${sum(vals, (c) => c.cl.length)} Claude`, fm(point[0]), `[${fm(lo)}; ${fm(hi)}]`, `${f1(100 * point[1])}% [${f1(100 * quant(rel, 0.025))}; ${f1(100 * quant(rel, 0.975))}]`, lo > 0 ? 'CC > Claude' : hi < 0 ? 'CC < Claude' : 'CI chứa 0']);
    }
  }
  T['T-f'] = [
    `> **MINH HỌA, n nhỏ — không đủ lực thống kê để khái quát.** Mỗi ô (bài × hệ) chỉ 1–2 lượt. Bootstrap phân tầng theo bài (lấy lại mẫu các lượt trong từng ô; B = ${CONFIG.bootstrapB}, seed = ${CONFIG.seed}, phân vị 2,5/97,5); thống kê = TB các bài của (CCoding − Claude). CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế (thiếu nhiễu giữa bài/ngày/hạn mức). Các hệ ccoding* trong cùng vòng gộp thành "CC".`,
    '',
    md(['Vòng', 'Tập con', 'Chỉ số', 'Cỡ mẫu', 'Chênh lệch (CC − Claude)', 'CI 95% (bootstrap)', 'Chênh lệch tương đối so với Claude [CI]', 'Nhận xét'], rows),
    '',
    `C6: ${NODATA}.`,
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
};
const render = (k) => `### ${TITLES[k]}\n\n${T[k]}\n`;
const args = process.argv.slice(2);
const ti = args.indexOf('--table'), ci = args.indexOf('--check');
if (ci >= 0) {
  const doc = fs.readFileSync(path.resolve(args[ci + 1]), 'utf8').replace(/\r\n/g, '\n');
  const miss = Object.keys(T).filter((k) => !doc.includes(render(k)));
  if (miss.length) { console.error(`LỆCH: bảng không trùng đầu ra script: ${miss.join(', ')}`); process.exit(1); }
  console.log(`OK: ${Object.keys(T).length} bảng trong ${args[ci + 1]} trùng đầu ra script.`);
} else if (ti >= 0) {
  const k = args[ti + 1];
  if (!T[k]) { console.error(`Bảng không tồn tại: ${k} (có: ${Object.keys(T).join(', ')})`); process.exit(2); }
  process.stdout.write(render(k));
} else {
  console.log(`<!-- sinh bởi token-analysis.mjs; vòng trong summary.json: ${Object.keys(summary.summary || {}).join(', ')}; C6: ${hasRound('C6') ? 'có' : NODATA} -->\n`);
  for (const k of Object.keys(T)) console.log(render(k));
}
