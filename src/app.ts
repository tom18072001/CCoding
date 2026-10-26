import { loadConfig, type Config } from './config.js';
import { EventBus } from './events.js';
import { Herdr } from './herdr.js';
import { LogStore } from './logger.js';
import { ensureDataDirs, Orchestrator } from './orchestrator.js';
import { Registry } from './registry.js';
import { RuntimeManager } from './runtimes/index.js';
import { Store } from './store.js';
import { Uploads } from './uploads.js';
import { UsageLedger } from './usage.js';

export interface App {
  config: Config;
  bus: EventBus;
  logs: LogStore;
  usage: UsageLedger;
  registry: Registry;
  runtimes: RuntimeManager;
  store: Store;
  herdr: Herdr;
  uploads: Uploads;
  orchestrator: Orchestrator;
}

/** Lắp ráp toàn bộ thành phần (dùng chung cho server, CLI độc lập và kiểm thử). */
export function createApp(overrides: Partial<Config> = {}, opts: { root?: string } = {}): App {
  const base = loadConfig({ root: opts.root });
  const config: Config = { ...base, ...overrides };
  ensureDataDirs(config.dataDir);
  const bus = new EventBus();
  const dp = config.dataProtection;
  const logs = new LogStore(config.dataDir, { redactSecrets: dp.redactSecrets, redactPii: dp.redactPii, hashChain: dp.hashChain }, bus);
  const usage = new UsageLedger(config.dataDir, logs, bus);
  const registry = new Registry(config.agentsDir, config.departmentsDir);
  const runtimes = new RuntimeManager(config);
  // hạn mức token/ngày tính từ sổ cái; thay đổi sức khỏe runtime phát lên giao diện
  runtimes.setUsageSource((rt, model) => usage.today(rt, model));
  runtimes.onChange = (id) => bus.publish({ type: 'runtime', id, status: { health: runtimes.health.get(id) ?? null } });
  const store = new Store(config.dataDir, logs);
  const herdr = new Herdr(config);
  const uploads = new Uploads(config.dataDir);
  try {
    const purged = uploads.purgeOlderThan();
    if (purged) logs.write({ level: 'info', kind: 'upload.purge', msg: `Xóa ${purged} tệp tải lên không dùng (> 24 giờ)` });
  } catch {
    /* thư mục tạm lỗi: bỏ qua */
  }
  const orchestrator = new Orchestrator({ config, registry, runtimes, logs, usage, store, bus, herdr, uploads });
  for (const e of registry.errors) logs.write({ level: 'warn', kind: 'registry', msg: e });
  return { config, bus, logs, usage, registry, runtimes, store, herdr, uploads, orchestrator };
}
