// LLM judges: checklist (per-item yes/no) and blinded pairwise preference. Both call `claude -p` with no tools.
import { spawnSync } from 'node:child_process';
import os from 'node:os';

/** Remove cues that reveal which system wrote a deliverable. */
export function blind(text) {
  return String(text ?? '')
    .replace(/CCoding|ccoding|herdr|Claude Code/gi, '[SYS]')
    .replace(/\b(orchestrator|dev-lead|research-lead|solution-architect|senior-swe|backend-dev|frontend-dev|data-engineer|devops|security|business-analyst|ba-presales|tech-writer|qa-tester|literature-researcher|data-scientist|methodologist|academic-writer|peer-reviewer|cto)\b/gi, '[ROLE]')
    .replace(/Trưởng phòng|Điều phối viên|Phòng (Phát triển|Nghiên cứu)|Kiến trúc sư|Phản biện/gi, '[ROLE]')
    .replace(/\[bench [^\]]*\]/g, '');
}

function ask(prompt, { model = 'opus', bin = 'claude' } = {}) {
  const r = spawnSync(bin, ['-p', prompt, '--output-format', 'json', '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config'], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`judge failed: ${r.stderr?.slice(-500)}`);
  const out = JSON.parse(r.stdout);
  const text = String(out.result ?? '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${text.slice(0, 300)}`);
  return { json: JSON.parse(m[0]), usage: out.usage, costUsd: out.total_cost_usd };
}

/** Returns { [itemId]: boolean }. Each item is judged strictly: partial or implied coverage = false. */
export async function judgeChecklist(text, items, opts = {}) {
  const list = items.map((it) => `- ${it.id}: ${it.question}`).join('\n');
  const prompt = `You are a strict grader. Read the DOCUMENT and answer each checklist question with true only if the document explicitly and correctly satisfies it; vague, implied or incorrect coverage is false.\n\nCHECKLIST:\n${list}\n\nDOCUMENT:\n<<<\n${blind(text).slice(0, 120000)}\n>>>\n\nReply with only a JSON object mapping each id to true or false.`;
  const { json } = ask(prompt, opts);
  return Object.fromEntries(items.map((it) => [it.id, json[it.id] === true]));
}

/**
 * Blinded pairwise preference, run in both orders to cancel position bias.
 * Returns { winner: 'x'|'y'|'tie', votes: [...] } where x/y are the caller's labels.
 */
export async function judgePair(brief, rubric, x, y, opts = {}) {
  const once = (first, second) => {
    const prompt = `Two anonymous deliverables answer the same brief. Judge which better satisfies the brief and rubric: correctness first, then completeness, then clarity. Ignore length, style and language (Vietnamese or English) unless they hurt usefulness.\n\nBRIEF:\n${brief}\n\nRUBRIC:\n${rubric}\n\nDELIVERABLE A:\n<<<\n${blind(first).slice(0, 60000)}\n>>>\n\nDELIVERABLE B:\n<<<\n${blind(second).slice(0, 60000)}\n>>>\n\nReply with only JSON: {"winner":"A"|"B"|"tie","reason":"<one sentence>"}`;
    return ask(prompt, opts).json;
  };
  const v1 = once(x, y), v2 = once(y, x);
  const map1 = { A: 'x', B: 'y', tie: 'tie' }[v1.winner] ?? 'tie';
  const map2 = { A: 'y', B: 'x', tie: 'tie' }[v2.winner] ?? 'tie';
  return { winner: map1 === map2 ? map1 : 'tie', votes: [{ order: 'xy', ...v1 }, { order: 'yx', ...v2 }] };
}
