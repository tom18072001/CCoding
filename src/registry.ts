import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './util/frontmatter.js';
import type { AgentDef, DepartmentDef, Role } from './types.js';

const ROLES: Role[] = ['lead', 'member', 'reviewer', 'router'];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.md') && !/^readme\.md$/i.test(e.name) && !e.name.startsWith('_')) out.push(p);
  }
  return out.sort();
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v ? v.split(/[,\s]+/).filter(Boolean) : [];

const DEFAULT_LOOKS = [
  { hair: '#2b1d0e', shirt: '#2563eb', skin: '#f1c27d' },
  { hair: '#111827', shirt: '#0d9488', skin: '#e0ac69' },
  { hair: '#4b2e1e', shirt: '#7c3aed', skin: '#f5d0a9' },
  { hair: '#1f2937', shirt: '#d97706', skin: '#c68642' },
];

export function parseAgent(file: string, text: string, index = 0): AgentDef {
  const { data, body } = parseFrontmatter<Record<string, unknown>>(text, file);
  const id = String(data.id ?? path.basename(file, '.md'));
  const role = (ROLES.includes(data.role as Role) ? data.role : 'member') as Role;
  const lookRaw = (data.look ?? {}) as Record<string, string>;
  const fallback = DEFAULT_LOOKS[index % DEFAULT_LOOKS.length];
  return {
    id,
    name: String(data.name ?? data.title ?? id),
    short: String(data.short ?? data.name ?? id),
    title: String(data.title ?? data.name ?? id),
    department: String(data.department ?? path.basename(path.dirname(file))),
    role,
    model: String(data.model ?? 'sonnet'),
    runtime: String(data.runtime ?? 'inherit'),
    tools: arr(data.tools),
    skills: arr(data.skills).map((s) => s.toLowerCase()),
    summary: String(data.summary ?? ''),
    look: { hair: lookRaw.hair ?? fallback.hair, shirt: lookRaw.shirt ?? fallback.shirt, skin: lookRaw.skin ?? fallback.skin },
    sources: arr(data.sources),
    body,
    file,
  };
}

export function parseDepartment(file: string, text: string): DepartmentDef {
  const { data, body } = parseFrontmatter<Record<string, unknown>>(text, file);
  const id = String(data.id ?? path.basename(file, '.md'));
  return {
    id,
    name: String(data.name ?? id),
    short: String(data.short ?? data.name ?? id),
    purpose: String(data.purpose ?? ''),
    lead: String(data.lead ?? ''),
    reviewer: String(data.reviewer ?? ''),
    members: arr(data.members),
    color: String(data.color ?? '#64748b'),
    keywords: arr(data.keywords).map((k) => k.toLowerCase()),
    body,
    file,
  };
}

/** Nạp toàn bộ agent.md và hồ sơ phòng ban từ đĩa; có thể nạp lại khi file thay đổi. */
export class Registry {
  agents = new Map<string, AgentDef>();
  departments = new Map<string, DepartmentDef>();
  errors: string[] = [];

  constructor(private agentsDir: string, private departmentsDir: string) {
    this.reload();
  }

  reload(): void {
    const agents = new Map<string, AgentDef>();
    const departments = new Map<string, DepartmentDef>();
    const errors: string[] = [];
    walk(this.departmentsDir).forEach((f) => {
      try {
        const d = parseDepartment(f, fs.readFileSync(f, 'utf8'));
        departments.set(d.id, d);
      } catch (e) {
        errors.push((e as Error).message);
      }
    });
    walk(this.agentsDir).forEach((f, i) => {
      try {
        const a = parseAgent(f, fs.readFileSync(f, 'utf8'), i);
        if (agents.has(a.id)) errors.push(`${f}: trùng id "${a.id}"`);
        agents.set(a.id, a);
      } catch (e) {
        errors.push((e as Error).message);
      }
    });
    // Đồng bộ danh sách thành viên: agent khai báo department nào thì thuộc phòng đó
    for (const d of departments.values()) {
      const members = new Set(d.members.filter((m) => agents.has(m)));
      for (const a of agents.values()) if (a.department === d.id) members.add(a.id);
      d.members = [...members];
      if (d.lead && !agents.has(d.lead)) errors.push(`Phòng ${d.id}: lead "${d.lead}" không tồn tại`);
      if (!d.lead || !agents.has(d.lead)) d.lead = d.members.find((m) => agents.get(m)?.role === 'lead') ?? d.members[0] ?? '';
      if (!d.reviewer || !agents.has(d.reviewer)) d.reviewer = d.members.find((m) => agents.get(m)?.role === 'reviewer') ?? '';
    }
    this.agents = agents;
    this.departments = departments;
    this.errors = errors;
  }

  agent(id: string): AgentDef {
    const a = this.agents.get(id);
    if (!a) throw new Error(`Không có agent "${id}"`);
    return a;
  }

  department(id: string): DepartmentDef {
    const d = this.departments.get(id);
    if (!d) throw new Error(`Không có phòng ban "${id}"`);
    return d;
  }

  members(deptId: string, subset?: string[]): AgentDef[] {
    const d = this.department(deptId);
    return d.members
      .map((m) => this.agents.get(m))
      .filter((a): a is AgentDef => !!a && (!subset || subset.length === 0 || subset.includes(a.id) || a.id === d.lead));
  }

  router(): AgentDef | undefined {
    return [...this.agents.values()].find((a) => a.role === 'router');
  }
}
