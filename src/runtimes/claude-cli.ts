import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { quickRun, runProcess } from './spawn.js';
import { scrubEnv } from '../tools/workspace.js';
import { isGitReadCommand } from '../tools/shell-policy.js';
import { estimateTokens } from '../util/tokens.js';
import { combinedPrompt } from './common.js';
import { logSandboxDeny, logSandboxUnavailable, type SandboxBackend } from '../tools/claude-guard.js';
import type { OsSandboxConfig, RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability, ToolCallRecord } from '../types.js';

/** Tên công cụ Claude Code → tên công cụ CCoding (KPI nhận "đã chạy test" qua run_command, đọc/ghi qua read_file/edit_file…). */
const CLAUDE_TOOL_NAMES: Record<string, string> = {
  Bash: 'run_command',
  PowerShell: 'run_command',
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  MultiEdit: 'edit_file',
  NotebookEdit: 'edit_file',
  Grep: 'search',
  Glob: 'list_files',
  LS: 'list_files',
  WebFetch: 'fetch_url',
  WebSearch: 'web_search',
};

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// ───────── B-18: sandbox cấp hệ điều hành (lớp 2) ─────────

/** Khóa `sandbox` trộn vào chuỗi --settings (hàm thuần). strictAllowlist: thiếu thì ở bypassPermissions host ngoài allowlist vẫn qua. */
export function buildSandboxSettings(root: string, osSandbox: OsSandboxConfig = {}): Record<string, unknown> {
  return {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: { allowWrite: [root], denyRead: ['.env*', ...(osSandbox.denyRead ?? [])] },
    network: { allowedDomains: [...(osSandbox.extraAllowedDomains ?? [])], strictAllowlist: true },
  };
}

export interface SandboxAvailability {
  ok: boolean;
  backend: 'native' | 'wsl2' | 'none';
  reason?: string;
}

/** Có WSL2 với ít nhất một distro? (`wsl.exe -l -q` in UTF-16LE.) Chưa kiểm trên máy thật — xem spike G1. */
function probeWsl(): boolean {
  const r = spawnSync('wsl.exe', ['-l', '-q'], { timeout: 5000 });
  if (r.error || r.status !== 0) return false;
  return String(r.stdout ?? '').replace(/\u0000/g, '').split(/\r?\n/).some((l) => l.trim());
}

/** Nền tảng có sandbox không? Linux/macOS: gốc (Claude Code tự báo nếu thiếu bwrap nhờ failIfUnavailable). Windows: chỉ qua WSL2. */
export function sandboxAvailable(platform: NodeJS.Platform = process.platform, probe: () => boolean = probeWsl, backend: NonNullable<OsSandboxConfig['platformBackend']> = 'auto'): SandboxAvailability {
  if (backend === 'appcontainer') return { ok: false, backend: 'none', reason: 'backend appcontainer chưa được hỗ trợ' };
  if (platform === 'win32') return probe() ? { ok: true, backend: 'wsl2' } : { ok: false, backend: 'none', reason: 'Windows không có WSL2 với distro nào' };
  if (backend === 'wsl2') return { ok: false, backend: 'none', reason: 'backend wsl2 chỉ dùng trên Windows' };
  return { ok: true, backend: 'native' };
}

const WIN_PATH = /^[A-Za-z]:[\\/]/;

/** C:\a\b → /mnt/c/a/b. Đường dẫn POSIX giữ nguyên; UNC/không có ổ đĩa → lỗi (không đoán). Chưa kiểm trên máy thật. */
export function toWslPath(p: string): string {
  const m = /^([A-Za-z]):[\\/]*(.*)$/.exec(p);
  if (m) {
    const rest = m[2].replace(/\\/g, '/').replace(/\/+$/, '');
    return `/mnt/${m[1].toLowerCase()}${rest ? `/${rest}` : ''}`;
  }
  if (p.startsWith('/') && !p.startsWith('//')) return p;
  throw new Error(`Không đổi được đường dẫn sang WSL: ${p.slice(0, 60)}`);
}

/** Đổi đường dẫn Windows trong một chuỗi: nguyên chuỗi là đường dẫn, hoặc đoạn trong "…" (vd. `node "C:/x/claude-guard.js"`). */
function mapPathsInString(v: string): string {
  if (WIN_PATH.test(v)) return toWslPath(v);
  return v.replace(/"([A-Za-z]:[\\/][^"]*)"/g, (_m, q: string) => `"${toWslPath(q)}"`);
}

function mapPathsDeep(v: unknown): unknown {
  if (typeof v === 'string') return mapPathsInString(v);
  if (Array.isArray(v)) return v.map(mapPathsDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapPathsDeep(x)]));
  return v;
}

/**
 * Bọc lệnh claude để chạy trong WSL2: cmd → wsl.exe, ánh xạ cwd, root/state trong CCODING_GUARD, và đường dẫn trong chuỗi --settings
 * (hook claude-guard.js, allowWrite). Biến môi trường qua WSLENV (không phải trích dẫn trên dòng lệnh). Hàm thuần.
 * CHƯA KIỂM TRÊN MÁY THẬT — cần distro WSL2 có node + claude (spike G1, docs/research/context/d10-implementation-2026-11-04.md).
 */
export function wrapForWsl(p: { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }): { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const args = p.args.map((a, i) => (p.args[i - 1] === '--settings' ? JSON.stringify(mapPathsDeep(JSON.parse(a))) : a));
  const env: NodeJS.ProcessEnv = { ...p.env };
  if (env.CCODING_GUARD) {
    const g = JSON.parse(env.CCODING_GUARD) as Record<string, unknown>;
    for (const k of ['root', 'state', 'dataDir']) if (typeof g[k] === 'string' && WIN_PATH.test(g[k] as string)) g[k] = toWslPath(g[k] as string);
    env.CCODING_GUARD = JSON.stringify(g);
  }
  const share = Object.keys(env).filter((k) => k === 'CCODING_GUARD' || k === 'BASH_MAX_OUTPUT_LENGTH');
  env.WSLENV = [...(env.WSLENV ? [env.WSLENV] : []), ...share].join(':');
  return { cmd: 'wsl.exe', args: ['--cd', toWslPath(p.cwd), '--exec', p.cmd, ...args], cwd: p.cwd, env };
}

/** Nhận diện kết quả công cụ bị sandbox từ chối. null = không phải. `rule` là nhãn cố định (không chứa lệnh/đường dẫn). Mẫu chuỗi chưa đo thật — spike G1. */
export function parseSandboxDeny(text: string): { rule: string } | null {
  if (/read-only file system/i.test(text)) return { rule: 'fs-readonly' };
  if (/\b403\b[^\n]*(proxy|forbidden|blocked|not allowed)|(proxy|blocked|not allowed)[^\n]*\b403\b/i.test(text)) return { rule: 'net-403' };
  if (/(host|domain)[^\n]*(blocked|not allowed|denied)|(blocked|denied)[^\n]*(host|domain)/i.test(text)) return { rule: 'net-host' };
  if (/sandbox/i.test(text)) return { rule: 'unknown' };
  return null;
}

/** Bóc tách luồng stream-json của `claude -p --output-format stream-json --verbose`. */
export class ClaudeStreamParser {
  text = '';
  resultText?: string;
  usage: ClaudeUsage = {};
  turnUsage: ClaudeUsage = {};
  costUsd = 0;
  model = '';
  isError = false;
  errorText = '';
  /** subtype của sự kiện result (vd. error_max_turns khi chạm --max-turns) — B-07. */
  subtype = '';
  sawResult = false;
  /** Lượt gọi công cụ của Claude Code, quy về tên công cụ của CCoding — để log tool.call và KPI (kiểm chứng, đọc/ghi) tính được. */
  toolCalls: ToolCallRecord[] = [];
  private pending = new Map<string, { rec: ToolCallRecord; t0: number }>();

  /** `onSandboxDeny` chỉ truyền khi osSandbox bật (tắt thì chuỗi như 'Read-only file system' là lỗi thường, không báo). */
  constructor(private hooks: RunHooks = {}, private onSandboxDeny?: (d: { tool: string; rule: string }) => void) {}

  feed(line: string): void {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    switch (ev.type) {
      case 'system':
        if (ev.model) this.model = ev.model;
        break;
      case 'assistant': {
        const msg = ev.message ?? {};
        if (msg.model) this.model = msg.model;
        for (const block of msg.content ?? []) {
          if (block.type === 'text' && block.text) {
            this.text += (this.text ? '\n' : '') + block.text;
            this.hooks.onText?.(block.text);
          } else if (block.type === 'tool_use') {
            const inp = block.input ?? {};
            const detail = inp.command ?? inp.file_path ?? inp.pattern ?? inp.url ?? inp.query ?? '';
            this.hooks.onActivity?.(`${block.name}${detail ? `: ${String(detail).slice(0, 60)}` : ''}`);
            // lệnh shell chỉ xem lịch sử git (log/show/diff…) ghi là git_read — không tính là "chạy lệnh"/"đọc code qua shell" trong KPI
            const gitRead = (block.name === 'Bash' || block.name === 'PowerShell') && isGitReadCommand(String(inp.command ?? ''));
            const rec: ToolCallRecord = { name: gitRead ? 'git_read' : (CLAUDE_TOOL_NAMES[block.name] ?? String(block.name)), args: String(detail).slice(0, 400), ok: true, ms: 0, outputChars: 0 };
            this.toolCalls.push(rec);
            if (block.id) this.pending.set(String(block.id), { rec, t0: Date.now() });
          }
        }
        const u = msg.usage as ClaudeUsage | undefined;
        if (u) {
          // cộng dồn theo từng lượt — dự phòng khi không có sự kiện result
          for (const k of Object.keys(u) as Array<keyof ClaudeUsage>) {
            if (typeof u[k] === 'number') this.turnUsage[k] = (this.turnUsage[k] ?? 0) + (u[k] as number);
          }
        }
        break;
      }
      case 'user': {
        // kết quả công cụ (tool_result) — thời gian, độ dài đầu ra, lỗi (kể cả bị hook CCoding chặn)
        for (const block of ev.message?.content ?? []) {
          if (block?.type !== 'tool_result') continue;
          const p = this.pending.get(String(block.tool_use_id));
          if (!p) continue;
          this.pending.delete(String(block.tool_use_id));
          const out = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          p.rec.ms = Date.now() - p.t0;
          p.rec.outputChars = out.length;
          if (block.is_error) {
            p.rec.ok = false;
            p.rec.error = out.slice(0, 200);
            const deny = this.onSandboxDeny ? parseSandboxDeny(out) : null;
            if (deny) this.onSandboxDeny?.({ tool: p.rec.name, rule: deny.rule });
          }
        }
        break;
      }
      case 'result':
        this.sawResult = true;
        if (typeof ev.subtype === 'string') this.subtype = ev.subtype;
        if (typeof ev.result === 'string') this.resultText = ev.result;
        if (ev.usage) this.usage = ev.usage;
        if (typeof ev.total_cost_usd === 'number') this.costUsd = ev.total_cost_usd;
        if (ev.modelUsage && typeof ev.modelUsage === 'object') {
          const names = Object.keys(ev.modelUsage);
          if (names.length) this.model = names.join('+');
        }
        if (ev.subtype === 'error_max_turns') break; // chạm --max-turns: không phải lỗi — run() báo capped để CCoding chạy tiếp (B-07)
        if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) {
          this.isError = true;
          this.errorText = String(ev.result ?? ev.subtype ?? 'lỗi không rõ');
        }
        break;
    }
  }

  finalUsage(): ClaudeUsage {
    return this.sawResult && Object.keys(this.usage).length ? this.usage : this.turnUsage;
  }
}

function toolTurnCap(req: RunRequest): number {
  const n = req.toolPolicy?.maxTurns;
  return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
}

/**
 * B-14b: bộ công cụ cố định khi runtimes.claude-cli.stablePrefix bật — hợp của mọi pha để --tools giống nhau cả nhiệm vụ.
 * Quyền thật theo pha/dự án do hook claude-guard quyết định (phase + callTools), không do danh sách này.
 */
export const STABLE_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'WebSearch', 'WebFetch', 'Edit', 'Write', 'MultiEdit', 'Bash'];

/** Dựng cờ CLI + biến môi trường của `claude -p` (hàm thuần, không spawn) — dùng cho run() và bench/vs-claude/cache-diagnostic.mjs (B-07, B-14a). */
export function buildClaudeArgs(cfg: RuntimeConfig, req: RunRequest, model: string, osSandbox: OsSandboxConfig | undefined = cfg.osSandbox): { args: string[]; env: NodeJS.ProcessEnv } {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--no-session-persistence'];
    const env: NodeJS.ProcessEnv = {};
    if (req.allowTools && req.tools.length) {
      const stable = cfg.stablePrefix === true;
      const toolList = stable ? STABLE_TOOLS : req.tools;
      args.push('--tools', toolList.join(','), '--permission-mode', cfg.permissionMode ?? 'acceptEdits');
      // B-07: trần lượt mô hình như vòng công cụ của runtime API (phases.toolTurns); tắt bằng runtimes.claude-cli.maxTurns=false
      if (cfg.maxTurns !== false && toolTurnCap(req) > 0) args.push('--max-turns', String(toolTurnCap(req)));
      // Hook PreToolUse áp cùng chính sách với vòng công cụ của CCoding (lệnh cấm mặc định + denyCommands
      // của dự án + chặn tạo/chuyển nhánh) và giữ mọi thao tác tệp trong thư mục làm việc của nhiệm vụ.
      const policy = req.toolPolicy;
      const guard = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'claude-guard.js').replace(/\\/g, '/');
      const settings: Record<string, unknown> = { hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: `node "${guard}"`, timeout: 15 }] }] } };
      // B-18: khóa `sandbox` chung chuỗi --settings (chỉ khi bật; tắt thì chuỗi trùng từng byte bản trước)
      if (osSandbox?.enabled === true) settings.sandbox = buildSandboxSettings(policy?.root ?? req.cwd, osSandbox);
      args.push('--settings', JSON.stringify(settings));
      env.CCODING_GUARD = JSON.stringify({
        root: policy?.root ?? req.cwd,
        deny: policy?.denyCommands ?? [],
        allowGitCommit: policy?.allowGitCommit ?? false,
        // vai trò không có quyền chạy lệnh: Bash chỉ để xem lịch sử git (tương ứng git_read của vòng công cụ CCoding)
        shell: policy?.gitReadOnly ? 'git-read' : 'full',
        // giới hạn khảo sát như vòng công cụ của CCoding: chỉ ở pha phải tạo sản phẩm bằng tệp (thực thi/sửa)
        readsBeforeWrite: policy?.expectWrites && policy.guardState ? policy.readsBeforeWrite ?? 0 : 0,
        state: policy?.guardState,
        closeStdin: cfg.closeStdin !== false,
        // B-08: công tắc đọc đường dẫn của hook (undefined → mặc định bật)
        useEventCwd: policy?.guard?.useEventCwd,
        allowOwnToolResults: policy?.guard?.allowOwnToolResults,
        // B-14b: pha + danh sách công cụ thật của lượt này để hook quyết định (thiếu/sai pha → chỉ đọc)
        ...(stable ? { stablePrefix: true, phase: req.phase, callTools: req.tools } : {}),
      });
      // cắt đầu ra lệnh shell (kết quả công cụ bị gửi lại ở mọi lượt sau) — chỉ khi nhiệm vụ/cấu hình đặt (benchtest trước khi đổi mặc định)
      if (policy?.bashMaxOutput && policy.bashMaxOutput > 0) env.BASH_MAX_OUTPUT_LENGTH = String(Math.floor(policy.bashMaxOutput));
      // công cụ đã được CCoding cấp theo quyền dự án/pha → chạy không hỏi (chế độ -p không hỏi được); hook vẫn chặn trước
      args.push('--allowedTools', toolList.join(','));
    } else {
      args.push('--tools', '');
    }
    // Không nạp MCP/plugin/hook cấu hình cấp người dùng: mỗi lượt gọi bớt ~85k token ngữ cảnh (đo 28/10: 93k → 7,6k)
    // và agent không chạm công cụ ngoài chính sách của CCoding. Đặt userSettings: true để nạp lại.
    if (!cfg.userSettings) args.push('--strict-mcp-config', '--setting-sources', 'project,local');
    args.push(...(cfg.extraArgs ?? []));
  return { args, env };
}

export class ClaudeCliRuntime implements Runtime {
  id = 'claude-cli';
  label = 'Claude Code CLI';
  local = false;
  supportsTools = true;

  constructor(private cfg: RuntimeConfig, private models: Record<string, string>, private deps: { sandboxAvailable?: typeof sandboxAvailable } = {}) {}

  async available(): Promise<RuntimeAvailability> {
    const r = await quickRun(this.cfg.command ?? 'claude', ['--version']);
    return { ok: r.ok, detail: r.ok ? r.out.split('\n')[0] : `không tìm thấy (${r.out.slice(0, 80)})` };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const model = this.models[req.model] ?? req.model;
    const { args, env } = buildClaudeArgs(this.cfg, req, model);
    const prompt = combinedPrompt(req);
    const os = this.cfg.osSandbox;
    let backend: SandboxBackend = 'none';
    if (os?.enabled === true) {
      const av = (this.deps.sandboxAvailable ?? sandboxAvailable)(process.platform, undefined, os.platformBackend ?? 'auto');
      if (!av.ok) {
        // fail-closed: không có sandbox thì KHÔNG chạy (không tụt về chạy không sandbox)
        const logged = logSandboxUnavailable({ backend: av.backend, platform: process.platform }, { state: req.toolPolicy?.guardState });
        // Dọn tệp trạng thái hook. Trên Linux, rmSync ném ENOTDIR khi một thành phần của đường dẫn là tệp; force chỉ bỏ qua ENOENT.
        if (req.toolPolicy?.guardState) try { fs.rmSync(req.toolPolicy.guardState, { force: true }); } catch { /* không có gì để dọn */ }
        return {
          text: '',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
          estimated: true,
          model,
          runtime: this.id,
          durationMs: Date.now() - started,
          error: `Sandbox hệ điều hành đã bật (runtimes.claude-cli.osSandbox) nhưng nền tảng không có sandbox: ${av.reason ?? 'không rõ lý do'}. Không chạy — cài WSL2 hoặc tắt osSandbox.${logged.ok ? '' : ` Cảnh báo: không ghi được sự kiện sandbox.unavailable vào nhật ký (${logged.kind}).`}`,
        };
      }
      backend = av.backend;
    }
    let denyLogFailures = 0;
    const parser = new ClaudeStreamParser(
      hooks,
      os?.enabled === true
        ? (d) => {
            if (!logSandboxDeny({ ...d, backend }, { state: req.toolPolicy?.guardState }).ok) denyLogFailures++;
          }
        : undefined,
    );
    let spec: { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } = { cmd: this.cfg.command ?? 'claude', args, cwd: req.cwd, env };
    if (backend === 'wsl2') spec = wrapForWsl(spec);
    const proc = await runProcess({
      cmd: spec.cmd,
      args: spec.args,
      cwd: spec.cwd,
      // Dùng phiên đăng nhập claude.ai của máy (gói đăng ký), KHÔNG dùng ANTHROPIC_API_KEY/BASE_URL hay khóa khác
      // (scrubEnv bỏ mọi biến khóa/token) — trừ khi cấu hình useApiKey.
      env: { ...(this.cfg.useApiKey ? process.env : scrubEnv(process.env)), ...spec.env },
      replaceEnv: true,
      stdin: prompt,
      timeoutMs: req.timeoutMs,
      signal: hooks.signal,
      onLine: (l) => parser.feed(l),
    });
    if (req.toolPolicy?.guardState) fs.rmSync(req.toolPolicy.guardState, { force: true });
    const text = (parser.resultText ?? parser.text).trim();
    const u = parser.finalUsage();
    const estimated = !u.input_tokens && !u.output_tokens;
    let error: string | undefined;
    if (proc.timedOut) error = `Hết thời gian (${Math.round(req.timeoutMs / 1000)}s)`;
    else if (proc.aborted) error = 'Đã hủy';
    else if (parser.isError) error = parser.errorText;
    else if (proc.code !== 0 && !text) error = `claude thoát mã ${proc.code}: ${proc.stderr.slice(-400)}`;
    const capped = !error && parser.subtype === 'error_max_turns' ? ('turns' as const) : undefined;
    return {
      text,
      usage: {
        input: estimated ? estimateTokens(prompt) : u.input_tokens ?? 0,
        output: estimated ? estimateTokens(text) : u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        costUsd: parser.costUsd,
      },
      estimated,
      model: parser.model || model,
      runtime: this.id,
      durationMs: Date.now() - started,
      error,
      toolCalls: parser.toolCalls.length ? parser.toolCalls : undefined,
      capped,
      diag:
        [
          capped ? `chạm trần ${toolTurnCap(req) || '?'} lượt (--max-turns của claude-cli)` : '',
          denyLogFailures ? `không ghi được ${denyLogFailures} sự kiện sandbox.deny vào nhật ký (xem stderr)` : '',
        ]
          .filter(Boolean)
          .join('; ') || undefined,
    };
  }
}
