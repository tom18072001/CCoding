#!/usr/bin/env node
// Bộ probe thử thách cho sub-agent của CCoding — chạy hồ sơ agent.md thật trên model cục bộ (Ollama, API gốc có num_ctx) hoặc API
// tương thích OpenAI (--api openai). Kết quả ghi trong data/probes/ (đã che bí mật/PII, chuỗi băm).
//   node bench/agent-probes/probe.mjs --models qwen3:8b,qwen3:14b --ctx 32768 --repeats 2
//   node bench/agent-probes/probe.mjs --self-test            (không gọi model: đáp án mẫu phải đạt 1.00, đáp án rác ~0)
// Cần `npm run build` trước (dùng parser và KPI của CCoding trong dist/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../dist/config.js';
import { LogStore } from '../../dist/logger.js';
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
  // bộ chấm phải: đáp án mẫu = 1.00; trả lời rác/rỗng và CHÉP LẠI ĐỀ thấp (≤ 0.35); các câu trả lời đối kháng của từng probe
  // (gian lận bộ chấm, báo nhầm mồi nhử…) không vượt ngưỡng riêng; không probe nào crash
  let bad = 0;
  let badAdv = 0;
  let checks = 0;
  for (const { a, p } of plan) {
    const built = p.build(a, ctx);
    const ref = p.grade(p.reference(a, built), built, a, ctx);
    const junk = p.grade('Xin lỗi, tôi không chắc.', built, a, ctx);
    const copy = p.grade(built.user, built, a, ctx);
    checks++;
    const ok = Math.abs(ref.score - 1) < 1e-9 && junk.score <= 0.35 && copy.score <= 0.35;
    if (!ok) { bad++; console.log(`✖ ${a.id} · ${p.id}: mẫu ${ref.score.toFixed(2)} rác ${junk.score.toFixed(2)} chép đề ${copy.score.toFixed(2)} ${JSON.stringify(ref.details)}`); }
  }
  // câu trả lời đối kháng: chạy một lần mỗi probe (agent áp dụng đầu tiên). Đặt khóa giả để kiểm mã ứng viên không đọc được env.
  process.env.PROBE_API_KEY ||= 'sk-probe-selftest-000';
  let adv = 0;
  for (const p of probes) {
    const a = agents.find((x) => p.applies(x));
    if (!a || !p.adversarial) continue;
    const built = p.build(a, ctx);
    for (const x of p.adversarial) {
      adv++;
      x.before?.();
      const g = p.grade(x.answer(a, built), built, a, ctx);
      const ok = g.score <= x.max && (!x.check || x.check(g));
      if (!ok) { badAdv++; console.log(`✖ đối kháng ${p.id} · ${x.name}: ${g.score.toFixed(2)} (ngưỡng ≤ ${x.max}) ${JSON.stringify(g.details).slice(0, 300)}`); }
    }
  }
  console.log(`${checks - bad}/${checks} cặp agent × probe: đáp án mẫu 1.00, đáp án rác và chép đề ≤ 0.35`);
  console.log(`${adv - badAdv}/${adv} câu trả lời đối kháng bị chấm thấp đúng ngưỡng`);
  process.exit(bad || badAdv ? 1 : 0);
}

// ── chạy thật ──
// Ngoại lệ có chủ đích: probe gọi model TRỰC TIẾP (không qua Orchestrator.call) — xem README "Ngoại lệ Orchestrator.call()".
const config = loadConfig();
const api = flag('api', 'ollama'); // ollama: API gốc /api/chat (đặt được num_ctx) · openai: /v1/chat/completions
if (!['ollama', 'openai'].includes(api)) {
  console.error(`--api phải là "ollama" hoặc "openai" (nhận "${api}")`);
  process.exit(2);
}
const defaultBase = api === 'ollama' ? (process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://localhost:11434') : (process.env.OLLAMA_OPENAI_URL ?? 'http://localhost:11434/v1');
const baseUrl = flag('base-url', defaultBase).replace(/\/$/, '');
const models = flag('models', 'qwen3:8b').split(',');
const repeats = Number(flag('repeats', '2'));
const temperature = Number(flag('temperature', '0.2'));
const timeoutMs = Number(flag('timeout', '600')) * 1000;
const numCtx = ctx.contextTokens;
// kết quả (có câu trả lời của model, đã che bí mật/PII) chỉ ghi trong data/ — như mọi dữ liệu khác của CCoding
const probesRoot = path.join(config.dataDir, 'probes');
const out = path.resolve(flag('out', path.join(probesRoot, new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))));
if (path.relative(config.dataDir, out).startsWith('..') || path.isAbsolute(path.relative(config.dataDir, out))) {
  console.error(`--out phải nằm trong thư mục dữ liệu ${config.dataDir} (quy ước: không ghi dữ liệu ra ngoài data/).`);
  process.exit(2);
}
const rowsFile = path.join(out, 'probes.jsonl');
// lượt lỗi (hạ tầng: mạng, HTTP 5xx, hết thời gian…) KHÔNG coi là đã xong — chạy lại cùng lệnh thì thử lại
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.key) : []);
if (has('dry-run')) {
  console.log(`${plan.length * models.length * repeats} lượt → ${out} (API ${api}${api === 'ollama' ? `, num_ctx ${numCtx}` : ''})`);
  for (const { a, p } of plan) console.log(`${a.id} · ${p.id}`);
  process.exit(0);
}
if (api === 'openai')
  console.warn(`⚠ --api openai: endpoint tương thích OpenAI KHÔNG đặt được num_ctx — model chạy với num_ctx trong Modelfile (Ollama mặc định chỉ 2.048–4.096), probe ngữ cảnh dài (~${Math.round(numCtx * 0.85)} token) sẽ bị cắt đầu prompt. Đặt num_ctx bằng Modelfile, hoặc dùng --api ollama.`);
fs.mkdirSync(out, { recursive: true });
// ghi qua LogStore: che bí mật/PII (luôn bật, kể cả khi cấu hình tắt) + chuỗi băm từng dòng
const logs = new LogStore(config.dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
const authHeader = () => (process.env.PROBE_API_KEY ? { authorization: `Bearer ${process.env.PROBE_API_KEY}` } : {});

async function chat(model, system, user, maxTokens) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  try {
    const r =
      api === 'ollama'
        ? await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            signal: ac.signal,
            headers: { 'content-type': 'application/json', ...authHeader() },
            // num_ctx tường minh: không đặt thì Ollama dùng mặc định của Modelfile và lặng lẽ cắt đầu prompt dài
            body: JSON.stringify({ model, messages, stream: false, options: { num_ctx: numCtx, temperature, num_predict: maxTokens } }),
          })
        : await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: ac.signal,
            headers: { 'content-type': 'application/json', ...authHeader() },
            body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
          });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `${r.status} ${JSON.stringify(body).slice(0, 300)}`, ms: Date.now() - t0 };
    if (api === 'ollama') {
      if (body.error) return { error: String(body.error).slice(0, 300), ms: Date.now() - t0 };
      return { text: body.message?.content ?? '', finish: body.done_reason === 'length' ? 'length' : body.done_reason, usage: { prompt_tokens: body.prompt_eval_count, completion_tokens: body.eval_count }, ms: Date.now() - t0 };
    }
    return { text: body.choices?.[0]?.message?.content ?? '', finish: body.choices?.[0]?.finish_reason, usage: body.usage ?? {}, ms: Date.now() - t0 };
  } catch (e) {
    return { error: String(e?.message ?? e), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

let n = 0;
let infra = 0;
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
      // lỗi hạ tầng: không chấm (score null), không tính vào trung bình — báo riêng trong report và thử lại ở lần chạy sau
      const g = r.error ? { score: null, details: {} } : p.grade(answer, built, a, ctx);
      if (r.error) infra++;
      const row = {
        key, model, agent: a.id, department: a.department, role: a.role, probe: p.id, dim: p.dim, rep, api, numCtx: api === 'ollama' ? numCtx : null,
        score: g.score === null ? null : Math.round(g.score * 1000) / 1000, details: g.details, error: r.error, infra: !!r.error, finish: r.finish, ms: r.ms,
        promptTokens: r.usage?.prompt_tokens, completionTokens: r.usage?.completion_tokens, thinkChars, answerChars: answer.length,
        answer: answer.slice(0, 4000),
      };
      logs.record(rowsFile, row);
      console.log(r.error ? `LỖI HẠ TẦNG (không tính điểm, chạy lại lệnh để thử lại) ${r.error.slice(0, 80)}` : `${row.score.toFixed(2)} · ${(r.ms / 1000).toFixed(1)}s`);
    }
console.log(`\nXong${infra ? ` — ${infra} lượt lỗi hạ tầng không tính điểm; chạy lại cùng lệnh (cùng --out) để thử lại` : ''}. Báo cáo: node ${path.relative(process.cwd(), path.join(HERE, 'report.mjs'))} ${out}`);
