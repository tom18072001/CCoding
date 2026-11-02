#!/usr/bin/env node
// Báo cáo probe: node bench/agent-probes/report.mjs <thư mục kết quả> → report.md + scores.csv
// Probe KPI của một agent × model = trung bình điểm các probe áp dụng; độ ổn định = độ lệch chuẩn giữa các lần lặp.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const rows = fs.readFileSync(path.join(dir, 'probes.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const models = [...new Set(rows.map((r) => r.model))];
const agents = [...new Set(rows.map((r) => r.agent))].sort();
const probes = [...new Set(rows.map((r) => r.probe))];
const grade = (s) => (s >= 0.8 ? 'A' : s >= 0.65 ? 'B' : s >= 0.5 ? 'C' : 'D');

// điểm agent × model: trung bình theo probe (mỗi probe = trung bình các lần lặp), ổn định = SD điểm tổng giữa các lần lặp
function cell(agent, model) {
  const rs = rows.filter((r) => r.agent === agent && r.model === model);
  if (!rs.length) return undefined;
  const byProbe = probes.map((p) => rs.filter((r) => r.probe === p).map((r) => r.score)).filter((a) => a.length);
  const reps = [...new Set(rs.map((r) => r.rep))].map((rep) => mean(rs.filter((r) => r.rep === rep).map((r) => r.score)));
  return { score: mean(byProbe.map(mean)), sd: sd(reps), n: rs.length, errors: rs.filter((r) => r.error).length };
}
const csv = ['model,agent,score,sd,n,errors'];
const lines = [];
lines.push(`# Probe KPI — sub-agent × model\n\n${rows.length} lượt · ${models.length} model · ${agents.length} agent · ${probes.length} probe. Điểm 0–1 (A ≥ 0.80, B ≥ 0.65, C ≥ 0.50). ± = độ lệch chuẩn giữa các lần lặp.\n`);
lines.push(`## Điểm theo agent\n\n| Agent | ${models.join(' | ')} |\n| --- |${' --- |'.repeat(models.length)}`);
for (const a of agents) {
  const cs = models.map((m) => cell(a, m));
  cs.forEach((c, i) => c && csv.push([models[i], a, f(c.score, 3), f(c.sd, 3), c.n, c.errors].join(',')));
  lines.push(`| ${a} | ${cs.map((c) => (c ? `${f(c.score)} ${grade(c.score)} ±${f(c.sd)}${c.errors ? ` (${c.errors} lỗi)` : ''}` : '—')).join(' | ')} |`);
}
lines.push(`\n## Điểm theo probe (trung bình mọi agent áp dụng)\n\n| Probe | Kiểm tra | ${models.join(' | ')} |\n| --- | --- |${' --- |'.repeat(models.length)}`);
for (const p of probes) {
  const dim = rows.find((r) => r.probe === p)?.dim;
  lines.push(`| ${p} | ${dim} | ${models.map((m) => f(mean(rows.filter((r) => r.probe === p && r.model === m).map((r) => r.score)))).join(' | ')} |`);
}
lines.push(`\n## Vận hành model\n\n| Model | Độ trễ p50 (s) | p95 (s) | Token ra/giây | Lượt lỗi | Lượt bị cắt (finish=length) | Có suy nghĩ <think> |\n| --- | --- | --- | --- | --- | --- | --- |`);
for (const m of models) {
  const rs = rows.filter((r) => r.model === m);
  const ms = rs.filter((r) => !r.error).map((r) => r.ms / 1000);
  const tps = rs.filter((r) => r.completionTokens && r.ms).map((r) => r.completionTokens / (r.ms / 1000));
  lines.push(`| ${m} | ${f(pct(ms, 0.5), 1)} | ${f(pct(ms, 0.95), 1)} | ${f(mean(tps), 1)} | ${rs.filter((r) => r.error).length} | ${rs.filter((r) => r.finish === 'length').length} | ${rs.filter((r) => r.thinkChars > 0).length} |`);
}
const ctxRows = rows.filter((r) => r.probe === 'needle-long-context');
if (ctxRows.length) {
  lines.push(`\n## Ngữ cảnh dài (kim ở đầu prompt ~85% cửa sổ)\n\n| Model | Giữ được chỉ dẫn đầu prompt | Đếm đúng | Prompt tokens TB |\n| --- | --- | --- | --- |`);
  for (const m of models) {
    const rs = ctxRows.filter((r) => r.model === m);
    lines.push(`| ${m} | ${rs.filter((r) => r.details?.headKept).length}/${rs.length} | ${rs.filter((r) => r.details?.countOk).length}/${rs.length} | ${Math.round(mean(rs.map((r) => r.promptTokens ?? 0)))} |`);
  }
  lines.push('\nMất chỉ dẫn đầu prompt mà prompt tokens ≈ num_ctx ⇒ Ollama đã cắt đầu prompt: tăng `num_ctx` (Modelfile) và đặt `contextWindow` khớp trong `ccoding.local.json`.');
}
const worst = rows.filter((r) => !r.error).sort((x, y) => x.score - y.score).slice(0, 12);
lines.push(`\n## 12 lượt kém nhất\n\n| Model | Agent | Probe | Điểm | Chi tiết |\n| --- | --- | --- | --- | --- |\n${worst.map((r) => `| ${r.model} | ${r.agent} | ${r.probe} | ${f(r.score)} | ${JSON.stringify(r.details).replace(/\|/g, '/').slice(0, 160)} |`).join('\n')}`);
fs.writeFileSync(path.join(dir, 'report.md'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(dir, 'scores.csv'), `${csv.join('\n')}\n`);
console.log(lines.join('\n'));
