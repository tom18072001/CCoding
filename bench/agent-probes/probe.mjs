#!/usr/bin/env node
// Bộ probe thử thách cho sub-agent của CCoding — chạy hồ sơ agent.md thật trên model cục bộ (Ollama) hoặc bất kỳ API tương thích OpenAI.
//   node bench/agent-probes/probe.mjs --models qwen3:8b,qwen3:14b --repeats 2
//   node bench/agent-probes/probe.mjs --self-test            (không gọi model: đáp án mẫu phải đạt 1.00, đáp án rác ~0)
// Cần `npm run build` trước (dùng parser và KPI của CCoding trong dist/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry } from '../../dist/registry.js';
import { systemFor } from '../../dist/prompts.js';
import { PROBES } from './probes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes(`--${k}`);

const registry = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
const agentSel = flag('agents', 'all');
const agents = [...registry.agents.values()].filter((a) => agentSel === 'all' || agentSel.split(',').some((s) => s === a.id || s === a.department || s === a.role));
const probeSel = flag('probes', 'all');
const probes = PROBES.filter((p) => probeSel === 'all' || probeSel.split(',').some((s) => s === p.id || s === p.dim));
const ctx = { registry, contextTokens: Number(flag('ctx', '32768')) };
const PHASE = { quality: 'review', planning: 'plan', routing: 'route', calibration: 'accept' };

/** Bỏ phần suy nghĩ của model lập luận (qwen3, deepseek-r1…) trước khi chấm — đếm riêng độ dài. */
function stripThink(text) {
  const m = String(text ?? '').match(/<think>[\s\S]*?<\/think>/gi) ?? [];
  return { answer: String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim(), thinkChars: m.join('').length };
}

const plan = [];
for (const a of agents) for (const p of probes) if (p.applies(a)) plan.push({ a, p });

if (has('self-test')) {
  // bộ chấm phải: đáp án mẫu = 1.00; trả lời rác/rỗng thấp; không probe nào crash
  let bad = 0;
  for (const { a, p } of plan) {
    const built = p.build(a, ctx);
    const ref = p.grade(p.reference(a, built), built, a, ctx);
    const junk = p.grade('Xin lỗi, tôi không chắc.', built, a, ctx);
    const ok = Math.abs(ref.score - 1) < 1e-9 && junk.score <= 0.35;
    if (!ok) { bad++; console.log(`✖ ${a.id} · ${p.id}: mẫu ${ref.score.toFixed(2)} rác ${junk.score.toFixed(2)} ${JSON.stringify(ref.details)}`); }
  }
  console.log(`${plan.length - bad}/${plan.length} cặp agent × probe: đáp án mẫu 1.00, đáp án rác ≤ 0.35`);
  process.exit(bad ? 1 : 0);
}

const baseUrl = flag('base-url', process.env.OLLAMA_OPENAI_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
const models = flag('models', 'qwen3:8b').split(',');
const repeats = Number(flag('repeats', '2'));
const temperature = Number(flag('temperature', '0.2'));
const timeoutMs = Number(flag('timeout', '600')) * 1000;
const out = path.resolve(flag('out', path.join(HERE, 'results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))));
const rowsFile = path.join(out, 'probes.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
if (has('dry-run')) {
  console.log(`${plan.length * models.length * repeats} lượt → ${out}`);
  for (const { a, p } of plan) console.log(`${a.id} · ${p.id}`);
  process.exit(0);
}
fs.mkdirSync(out, { recursive: true });

async function chat(model, system, user, maxTokens) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json', ...(process.env.PROBE_API_KEY ? { authorization: `Bearer ${process.env.PROBE_API_KEY}` } : {}) },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `${r.status} ${JSON.stringify(body).slice(0, 300)}`, ms: Date.now() - t0 };
    return { text: body.choices?.[0]?.message?.content ?? '', finish: body.choices?.[0]?.finish_reason, usage: body.usage ?? {}, ms: Date.now() - t0 };
  } catch (e) {
    return { error: String(e?.message ?? e), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

let n = 0;
const total = plan.length * models.length * repeats;
for (let rep = 1; rep <= repeats; rep++)
  for (const model of models)
    for (const { a, p } of plan) {
      n++;
      const key = `${model}|${a.id}|${p.id}|${rep}`;
      if (done.has(key)) continue;
      const built = p.build(a, ctx);
      const system = systemFor(a, registry.departments.get(a.department), 'internal', PHASE[p.dim] ?? 'execute');
      process.stdout.write(`[${n}/${total}] ${model} · ${a.id} · ${p.id} … `);
      const r = await chat(model, system, built.user, built.maxTokens);
      const { answer, thinkChars } = stripThink(r.text);
      const g = r.error ? { score: 0, details: { error: r.error } } : p.grade(answer, built, a, ctx);
      const row = {
        key, model, agent: a.id, department: a.department, role: a.role, probe: p.id, dim: p.dim, rep,
        score: Math.round(g.score * 1000) / 1000, details: g.details, error: r.error, finish: r.finish, ms: r.ms,
        promptTokens: r.usage?.prompt_tokens, completionTokens: r.usage?.completion_tokens, thinkChars, answerChars: answer.length,
        answer: answer.slice(0, 4000),
      };
      fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
      console.log(r.error ? `LỖI ${r.error.slice(0, 80)}` : `${row.score.toFixed(2)} · ${(r.ms / 1000).toFixed(1)}s`);
    }
console.log(`\nXong. Báo cáo: node ${path.relative(process.cwd(), path.join(HERE, 'report.mjs'))} ${out}`);
