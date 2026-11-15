export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export function seed() {
  const names = ['an', 'binh', 'chi', 'dung'];
  const out = [];
  for (let i = 1; i <= 23; i++) {
    out.push({ id: i, title: `Ticket ${i}`, status: STATUSES[(i * 7) % 4], assignee: i % 5 === 0 ? null : names[(i * 3) % 4], priority: (i * 5) % 4 + 1, createdAt: `2026-10-${String(((i * 11) % 28) + 1).padStart(2, '0')}T00:00:00Z` });
  }
  return out;
}
