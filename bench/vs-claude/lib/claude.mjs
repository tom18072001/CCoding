// Single-Claude arm: one headless `claude -p` session in the run's workspace.
import { spawn } from 'node:child_process';
import { detectRateLimit } from './infra.mjs';

export const TOOLS = 'Read,Write,Edit,Bash,Grep,Glob';

export const PROCESS_SUFFIX = `

Work in four explicit stages and do not skip any:
1. PLAN - restate the requirements as a numbered checklist, including edge cases and anything ambiguous or contradictory (state your assumption).
2. IMPLEMENT - produce the deliverable.
3. SELF-REVIEW - re-read the brief line by line and check every requirement against your output; run the tests if there are any; look for bugs, missed edge cases and unsupported claims.
4. FIX - correct everything the review found, then give a short final report.`;

/** Weighted tokens (input-token units at API price ratios), same formula as `ccoding bench`. */
export function weighted(u) {
  return Math.round(u.input + 1.25 * (u.cacheWrite ?? 0) + 0.1 * u.cacheRead + 5 * u.output);
}

/**
 * Run claude -p. Returns { status, wallSec, tokens, costUsd, turns, finalText, transcript, infra, resetsAt }.
 * infra: 'rate-limit' | 'error' | undefined; resetsAt: chuỗi thô từ thông báo (vd. '4:50pm').
 * Cờ: giữ --setting-sources project,local như CCoding và harness cũ (không nạp cài đặt/MCP/hook cấp người dùng).
 * `bin` lets you point at a wrapper; `extraArgs` are appended verbatim.
 */
export function runClaude({ cwd, prompt, model, timeoutMin = 45, bin = 'claude', extraArgs = [] }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model,
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS, '--disallowedTools', 'WebFetch,WebSearch,Task',
    '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'project,local', ...extraArgs];
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '', result = null; const transcript = [];
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMin * 60000);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        transcript.push(line);
        try { const ev = JSON.parse(line); if (ev.type === 'result') result = ev; } catch { /* keep raw */ }
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    let spawnErr = null;
    child.on('error', (e) => { spawnErr = e; });
    child.on('close', (code) => {
      clearTimeout(timer);
      let infra, resetsAt;
      if (spawnErr) infra = 'error';
      else if (!(result && !result.is_error && code === 0)) {
        const tail = transcript.slice(-5).join('\n');
        const rl = detectRateLimit([result?.is_error || !result ? result?.result : '', err, tail].join('\n'));
        if (rl.rateLimited) { infra = 'rate-limit'; resetsAt = rl.resetsAt; }
        else if (!result && code !== 0 && !transcript.length) infra = 'error';
      }
      const u = result?.usage ?? {};
      const tokens = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
      tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
      tokens.weighted = weighted(tokens);
      resolve({
        status: result && !result.is_error && code === 0 ? 'done' : 'failed',
        wallSec: (Date.now() - t0) / 1000,
        tokens, costUsd: result?.total_cost_usd ?? 0, turns: result?.num_turns ?? 0,
        finalText: result?.result ?? '', transcript, stderr: (spawnErr ? `${spawnErr.message}\n` : '') + err.slice(-4000),
        infra, ...(resetsAt ? { resetsAt } : {}),
      });
    });
  });
}
