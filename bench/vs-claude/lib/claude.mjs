// Single-Claude arm: one headless `claude -p` session in the run's workspace.
import { spawn } from 'node:child_process';
import { detectRateLimit } from './infra.mjs';

export const TOOLS = 'Read,Write,Edit,Bash,Grep,Glob';

/** Biến khóa/token bị bỏ khỏi môi trường của mọi tiến trình `claude` do harness gọi — cùng mẫu với `scrubEnv` của CCoding (src/tools/workspace.ts). */
export const SECRET_VAR = /(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|^BIFROST_|^NINEROUTER|^CCODING_TOKEN|^ANTHROPIC_|^OPENAI_|^AWS_|^AZURE_|^GH_|^GITHUB_)/i;

/**
 * Môi trường cho `claude -p` của harness: bỏ mọi biến khóa/token (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, …) để Claude Code
 * dùng phiên đăng nhập claude.ai của máy như runtime claude-cli của CCoding — không dùng khóa API ngoài, và arm đơn
 * cùng đường xác thực với arm CCoding. Phát hiện 13/11/2026: máy chạy có ANTHROPIC_API_KEY cấp người dùng, `claude -p`
 * của R3 lấy khóa đó trước phiên đăng nhập.
 */
export function claudeEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!SECRET_VAR.test(k)) out[k] = v;
  out.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return out;
}

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
 * Run claude -p. Returns { status, wallSec, tokens, costUsd, turns, finalText, transcript, infra, resetsAt, model, authSource, isError, timedOut }.
 * model: model thực do phiên init báo (SR-03), null nếu không có; timedOut: bị kill vì quá timeoutMin (SR-01).
 * authSource: trường `apiKeySource` của sự kiện init (nguồn xác thực Claude Code báo; null nếu không có);
 * isError: sự kiện result có is_error (khi đó finalText là thông báo lỗi của Claude Code, không phải sản phẩm).
 * subtype: `subtype` của sự kiện result (vd. 'error_max_turns' khi chạm --max-turns); assistantText: mọi khối văn bản của
 * các lượt assistant nối bằng xuống dòng — đúng như parser của runtime claude-cli trong CCoding (src/runtimes/claude-cli.ts).
 * Môi trường: claudeEnv() — không chuyển biến khóa/token cho tiến trình con.
 * infra: 'rate-limit' | 'error' | undefined; resetsAt: chuỗi thô từ thông báo (vd. '4:50pm').
 * Cờ: giữ --setting-sources project,local như CCoding và harness cũ (không nạp cài đặt/MCP/hook cấp người dùng).
 * `bin` lets you point at a wrapper (`binArgs` đứng trước mọi cờ, vd. bin = node + binArgs = [tệp claude giả] trong test; mặc định rỗng); `extraArgs` are appended verbatim.
 */
/**
 * Cờ của `claude -p` (hàm thuần). Mặc định giữ đúng từng phần tử như mọi đợt đo trước.
 * E7 (arm R3, chỉ đọc): `tools` (→ --tools), `allowedTools` (thay TOOLS), `permissionMode`, `maxTurns`;
 * `stdin: true` → prompt đi qua stdin thay vì tham số (Windows giới hạn dòng lệnh khoảng 32 nghìn ký tự).
 */
export function claudeArgs({ prompt, model, extraArgs = [], tools, allowedTools = TOOLS, permissionMode = 'acceptEdits', maxTurns, stdin = false }) {
  return ['-p', ...(stdin ? [] : [prompt]), '--output-format', 'stream-json', '--verbose', '--model', model,
    ...(tools !== undefined ? ['--tools', tools] : []),
    '--permission-mode', permissionMode, '--allowedTools', allowedTools, '--disallowedTools', 'WebFetch,WebSearch,Task',
    ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
    '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'project,local', ...extraArgs];
}

export function runClaude({ cwd, prompt, model, timeoutMin = 45, bin = 'claude', binArgs = [], extraArgs = [], tools, allowedTools, permissionMode, maxTurns, stdin = false }) {
  const args = claudeArgs({ prompt, model, extraArgs, tools, allowedTools, permissionMode, maxTurns, stdin });
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(bin, [...binArgs, ...args], { cwd, env: claudeEnv(), stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    if (stdin) { child.stdin.on('error', () => { /* tiến trình thoát sớm */ }); child.stdin.end(prompt); }
    let buf = '', err = '', result = null, model = null, authSource = null, timedOut = false, assistantText = ''; const transcript = [];
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMin * 60000);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        transcript.push(line);
        try { const ev = JSON.parse(line); if (ev.type === 'result') result = ev; if (ev.type === 'system' && ev.subtype === 'init') { if (ev.model) model = ev.model; authSource = ev.apiKeySource ?? null; }
          if (ev.type === 'assistant') for (const b of ev.message?.content ?? []) if (b?.type === 'text' && b.text) assistantText += (assistantText ? '\n' : '') + b.text; } catch { /* keep raw */ }
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
        infra, model, authSource, isError: !!result?.is_error, subtype: result?.subtype ?? null, assistantText, timedOut, ...(resetsAt ? { resetsAt } : {}),
      });
    });
  });
}
