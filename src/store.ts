import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJsonFile, readJsonl, safeName, writeJsonAtomic } from './util/fsx.js';
import type { LogStore } from './logger.js';
import type { AgentFeedback, ChatMessage, ProjectDef, PromptDef, Task } from './types.js';

/**
 * Lưu trạng thái nhiệm vụ (data/runs/<id>/task.json), hội thoại (transcript.jsonl)
 * và danh sách dự án (data/projects.json).
 */
export class Store {
  tasks = new Map<string, Task>();
  private saveTimers = new Map<string, NodeJS.Timeout>();

  constructor(private dataDir: string, private logs: LogStore) {
    ensureDir(this.runsDir());
    this.loadTasks();
  }

  runsDir(): string {
    return path.join(this.dataDir, 'runs');
  }

  runDir(taskId: string): string {
    return path.join(this.runsDir(), safeName(taskId));
  }

  private loadTasks(): void {
    for (const e of fs.readdirSync(this.runsDir(), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const t = readJsonFile<Task | null>(path.join(this.runsDir(), e.name, 'task.json'), null);
      if (!t) continue;
      if (t.status === 'running' || t.status === 'queued') {
        // tiến trình trước bị dừng giữa chừng → tạm dừng, có thể tiếp tục từ checkpoint
        t.status = 'paused';
        t.pause = { reason: 'interrupted', detail: 'Bị gián đoạn do server khởi động lại — bấm "Tiếp tục" để chạy tiếp từ chỗ đã xong', at: new Date().toISOString() };
        for (const r of t.runs) if (r.status === 'running') r.status = 'paused';
        for (const r of t.runs) for (const s of r.subtasks) if (s.status === 'running') s.status = 'pending';
      }
      this.tasks.set(t.id, t);
    }
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  put(task: Task, immediate = false): void {
    this.tasks.set(task.id, task);
    const file = path.join(this.runDir(task.id), 'task.json');
    if (immediate) {
      clearTimeout(this.saveTimers.get(task.id));
      this.saveTimers.delete(task.id);
      writeJsonAtomic(file, task);
      return;
    }
    if (this.saveTimers.has(task.id)) return;
    this.saveTimers.set(
      task.id,
      setTimeout(() => {
        this.saveTimers.delete(task.id);
        writeJsonAtomic(file, this.tasks.get(task.id));
      }, 300),
    );
  }

  flush(): void {
    for (const [id, t] of this.saveTimers) {
      clearTimeout(t);
      writeJsonAtomic(path.join(this.runDir(id), 'task.json'), this.tasks.get(id));
    }
    this.saveTimers.clear();
  }

  addMessage(msg: ChatMessage): void {
    this.logs.append(path.join(this.runDir(msg.taskId), 'transcript.jsonl'), msg);
  }

  transcript(taskId: string): ChatMessage[] {
    return readJsonl<ChatMessage>(path.join(this.runDir(taskId), 'transcript.jsonl'));
  }

  callsFile(taskId: string): string {
    return path.join(this.runDir(taskId), 'calls.jsonl');
  }

  outputs(taskId: string): string[] {
    const dir = path.join(this.runDir(taskId), 'outputs');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  }

  readRunFile(taskId: string, rel: string): string | undefined {
    const base = this.runDir(taskId);
    const p = path.resolve(base, rel);
    if (!p.startsWith(path.resolve(base) + path.sep)) return undefined; // chặn path traversal
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
  }

  // ── Dự án ────────────────────────────────────────────────────────────
  private projectsFile(): string {
    return path.join(this.dataDir, 'projects.json');
  }

  projects(): ProjectDef[] {
    return readJsonFile<ProjectDef[]>(this.projectsFile(), []);
  }

  project(id: string): ProjectDef | undefined {
    return this.projects().find((p) => p.id === id);
  }

  saveProject(p: ProjectDef): ProjectDef {
    const list = this.projects().filter((x) => x.id !== p.id);
    list.push(p);
    list.sort((a, b) => a.id.localeCompare(b.id));
    writeJsonAtomic(this.projectsFile(), list);
    return p;
  }

  removeProject(id: string): boolean {
    const list = this.projects();
    const next = list.filter((p) => p.id !== id);
    writeJsonAtomic(this.projectsFile(), next);
    return next.length !== list.length;
  }

  // ── Góp ý cho agent (data/feedback/<agent>.json) ─────────────────────
  private feedbackFile(agentId: string): string {
    return path.join(this.dataDir, 'feedback', `${safeName(agentId)}.json`);
  }

  feedback(agentId: string): AgentFeedback[] {
    return readJsonFile<AgentFeedback[]>(this.feedbackFile(agentId), []);
  }

  addFeedback(agentId: string, f: { text: string; rating?: 'up' | 'down'; taskId?: string }): AgentFeedback {
    const list = this.feedback(agentId);
    const item: AgentFeedback = { id: `F${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, agentId, text: f.text, rating: f.rating, taskId: f.taskId, active: true, at: new Date().toISOString() };
    list.push(item);
    ensureDir(path.dirname(this.feedbackFile(agentId)));
    writeJsonAtomic(this.feedbackFile(agentId), list.slice(-200));
    return item;
  }

  updateFeedback(agentId: string, id: string, patch: { active?: boolean }): AgentFeedback | undefined {
    const list = this.feedback(agentId);
    const item = list.find((x) => x.id === id);
    if (!item) return undefined;
    if (patch.active !== undefined) item.active = patch.active;
    writeJsonAtomic(this.feedbackFile(agentId), list);
    return item;
  }

  removeFeedback(agentId: string, id: string): boolean {
    const list = this.feedback(agentId);
    const next = list.filter((x) => x.id !== id);
    if (next.length === list.length) return false;
    writeJsonAtomic(this.feedbackFile(agentId), next);
    return true;
  }

  /** Góp ý đang bật (mới nhất trước, tối đa `limit`) — đưa vào hồ sơ agent khi gọi model. */
  activeFeedback(agentId: string, limit = 5): AgentFeedback[] {
    return this.feedback(agentId)
      .filter((x) => x.active && x.text.trim())
      .slice(-limit)
      .reverse();
  }

  // ── Thư viện prompt (data/prompts.json) ──────────────────────────────
  private promptsFile(): string {
    return path.join(this.dataDir, 'prompts.json');
  }

  prompts(): PromptDef[] {
    return readJsonFile<PromptDef[]>(this.promptsFile(), []);
  }

  savePrompt(p: PromptDef): PromptDef {
    const list = this.prompts().filter((x) => x.id !== p.id);
    list.push(p);
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    writeJsonAtomic(this.promptsFile(), list.slice(0, 500));
    return p;
  }

  removePrompt(id: string): boolean {
    const list = this.prompts();
    const next = list.filter((x) => x.id !== id);
    writeJsonAtomic(this.promptsFile(), next);
    return next.length !== list.length;
  }

  usePrompt(id: string): PromptDef | undefined {
    const list = this.prompts();
    const p = list.find((x) => x.id === id);
    if (!p) return undefined;
    p.uses = (p.uses ?? 0) + 1;
    writeJsonAtomic(this.promptsFile(), list);
    return p;
  }
}
