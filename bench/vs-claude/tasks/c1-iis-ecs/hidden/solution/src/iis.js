const MAP = {
  's-ip': ['server', 'ip'], 'c-ip': ['client', 'ip'], 'cs-method': ['http', 'request', 'method'],
  'cs-uri-stem': ['url', 'path'], 'cs-uri-query': ['url', 'query'], 'sc-status': ['http', 'response', 'status_code'],
  'time-taken': ['event', 'duration'], 'cs(User-Agent)': ['user_agent', 'original'], 'cs-username': ['user', 'name'], 's-port': ['server', 'port'],
};
function set(o, p, v) { let c = o; for (let i = 0; i < p.length - 1; i++) c = c[p[i]] ??= {}; c[p.at(-1)] = v; }
export function parseIisLog(text) {
  const out = []; let fields = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('#')) { if (line.startsWith('#Fields:')) fields = line.slice(8).trim().split(/\s+/); continue; }
    if (!fields) continue;
    const vals = line.split(' ');
    if (vals.length !== fields.length) continue;
    const rec = {}; let date, time;
    fields.forEach((f, i) => {
      const v = vals[i];
      if (v === '-') return;
      if (f === 'date') { date = v; return; }
      if (f === 'time') { time = v; return; }
      const p = MAP[f]; if (!p) return;
      let val = v;
      if (f === 'sc-status' || f === 's-port') val = Number(v);
      else if (f === 'time-taken') val = Number(v) * 1e6;
      else if (f === 'cs(User-Agent)') val = v.replace(/\+/g, ' ');
      set(rec, p, val);
    });
    if (date && time) rec['@timestamp'] = new Date(`${date}T${time}Z`).toISOString();
    out.push(rec);
  }
  return out;
}
