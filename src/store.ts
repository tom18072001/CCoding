import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJsonFile, readJsonl, safeName, writeJsonAtomic } from './util/fsx.js';
import type { LogStore } from './logger.js';
import type { ChatMessage, ProjectDef, Task } from './types.js';

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
        // tiến trình trước bị dừng giữa chừng
        t.status = 'failed';
        t.error = t.error ?? 'Bị gián đoạn do server khởi động lại';
        for (const r of t.runs) if (r.status === 'running') r.status = 'failed';
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
}
