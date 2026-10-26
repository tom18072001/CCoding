import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Classification, TaskOptions } from './types.js';

/** Thư mục gốc của repo (chứa package.json). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface RuntimeConfig {
  /** Kiểu cho runtime tùy biến: "openai-api". */
  type?: string;
  label?: string;
  /** Key ảo theo phòng ban: { "dev": "env:BIFROST_VK_DEV", "*": "…" }. */
  virtualKeys?: Record<string, string>;
  /** Header mang key ảo: "x-bf-vk" (Bifrost) hoặc "authorization" (LiteLLM). */
  virtualKeyHeader?: string;
  /** Kiểu tag gửi gateway: "bifrost" | "litellm" | "both" | "none". */
  tags?: string;
  headers?: Record<string, string>;
  /** Runtime chỉ "sẵn sàng" khi các biến môi trường này đã được đặt. */
  requireEnv?: string[];
  command?: string;
  extraArgs?: string[];
  permissionMode?: string;
  sandbox?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  maxTokens?: number;
  local?: boolean;
  defaultModel?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  [k: string]: unknown;
}

export interface Config {
  root: string;
  server: { host: string; port: number; token?: string };
  dataDir: string;
  workspacesDir: string;
  agentsDir: string;
  departmentsDir: string;
  runtime: { default: string; order: string[] };
  runner: 'auto' | 'process' | 'herdr';
  maxConcurrentTasks: number;
  defaults: TaskOptions & { timeoutMs: number };
  herdr: {
    session: string;
    workspaceLabel: string;
    agentPanes: boolean;
    closeAgentPanes: boolean;
    notify: boolean;
    bin?: string;
    /** Dịch vụ chạy kèm trong tab "Dịch vụ" (ví dụ Bifrost, Ollama). */
    services?: Array<{ label: string; command: string; cwd?: string; enabled?: boolean }>;
  };
  runtimes: Record<string, RuntimeConfig>;
  models: Record<string, Record<string, string>>;
  pricing: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>;
  dataProtection: {
    defaultClassification: Classification;
    allowedRuntimes: Record<Classification, string[]>;
    redactSecrets: boolean;
    redactPii: boolean;
    logPrompts: boolean;
    hashChain: boolean;
    retentionDays: number;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObject(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    out[k] = isObject(cur) && isObject(v) ? deepMerge(cur, v) : v;
  }
  return out as T;
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return undefined;
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Không đọc được ${file}: ${(e as Error).message}`);
  }
}

const BUILTIN: Omit<Config, 'root'> = {
  server: { host: '127.0.0.1', port: 7420 },
  dataDir: 'data',
  workspacesDir: 'workspaces',
  agentsDir: 'agents',
  departmentsDir: 'departments',
  runtime: { default: 'auto', order: ['claude-cli', 'bifrost', 'anthropic-api', 'openai-api', 'codex-cli', 'kimi-cli', 'ollama', 'mock'] },
  runner: 'auto',
  maxConcurrentTasks: 2,
  defaults: { discussionRounds: 1, review: true, maxParallel: 3, maxRevisions: 1, budgetTokens: 600000, timeoutMs: 1200000 },
  herdr: { session: 'ccoding', workspaceLabel: 'CCoding Office', agentPanes: true, closeAgentPanes: false, notify: true, services: [] },
  runtimes: {},
  models: {},
  pricing: {},
  dataProtection: {
    defaultClassification: 'internal',
    allowedRuntimes: { public: ['*'], internal: ['*'], confidential: ['local'], restricted: ['local'] },
    redactSecrets: true,
    redactPii: true,
    logPrompts: true,
    hashChain: true,
    retentionDays: 400,
  },
};

/**
 * Nạp cấu hình theo thứ tự ưu tiên tăng dần:
 * mặc định dựng sẵn → ccoding.config.json → ccoding.local.json → biến môi trường.
 */
export function loadConfig(opts: { root?: string; configFile?: string } = {}): Config {
  const root = opts.root ?? process.env.CCODING_ROOT ?? ROOT;
  let cfg = deepMerge(BUILTIN, readJson(path.join(root, 'ccoding.config.json')));
  cfg = deepMerge(cfg, readJson(path.join(root, 'ccoding.local.json')));
  const extra = opts.configFile ?? process.env.CCODING_CONFIG;
  if (extra) {
    if (!fs.existsSync(path.resolve(extra))) throw new Error(`Không thấy file cấu hình ${extra} (CCODING_CONFIG)`);
    cfg = deepMerge(cfg, readJson(path.resolve(extra)));
  }

  const env = process.env;
  if (env.CCODING_PORT) cfg.server.port = Number(env.CCODING_PORT);
  if (env.CCODING_HOST) cfg.server.host = env.CCODING_HOST;
  if (env.CCODING_TOKEN) cfg.server.token = env.CCODING_TOKEN;
  if (env.CCODING_DATA_DIR) cfg.dataDir = env.CCODING_DATA_DIR;
  if (env.CCODING_RUNTIME) cfg.runtime.default = env.CCODING_RUNTIME;
  if (env.CCODING_RUNNER) cfg.runner = env.CCODING_RUNNER as Config['runner'];
  if (env.CCODING_HERDR_SESSION) cfg.herdr.session = env.CCODING_HERDR_SESSION;
  if (env.HERDR_BIN_PATH && !cfg.herdr.bin) cfg.herdr.bin = env.HERDR_BIN_PATH;

  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
  return {
    ...cfg,
    root,
    dataDir: abs(cfg.dataDir),
    workspacesDir: abs(cfg.workspacesDir),
    agentsDir: abs(cfg.agentsDir),
    departmentsDir: abs(cfg.departmentsDir),
  };
}
