/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
  cur[parts[parts.length - 1]] = value;
}

const num = (v) => {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
};

const SIMPLE = {
  's-ip': 'server.ip',
  'c-ip': 'client.ip',
  'cs-method': 'http.request.method',
  'cs-uri-stem': 'url.path',
  'cs-uri-query': 'url.query',
  'cs-username': 'user.name',
};

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      const m = /^#Fields:\s*(.*)$/.exec(line);
      if (m) fields = m[1].trim().split(/\s+/);
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;
    const rec = {};
    const v = {};
    fields.forEach((f, i) => {
      if (cols[i] !== '-') v[f] = cols[i];
    });
    if (v.date !== undefined && v.time !== undefined) {
      const d = new Date(`${v.date}T${v.time}Z`);
      if (!isNaN(d)) setPath(rec, '@timestamp', d.toISOString());
    }
    for (const [f, path] of Object.entries(SIMPLE)) {
      if (v[f] !== undefined) setPath(rec, path, v[f]);
    }
    if (v['sc-status'] !== undefined) {
      const n = num(v['sc-status']);
      if (n !== undefined) setPath(rec, 'http.response.status_code', n);
    }
    if (v['s-port'] !== undefined) {
      const n = num(v['s-port']);
      if (n !== undefined) setPath(rec, 'server.port', n);
    }
    if (v['time-taken'] !== undefined) {
      const n = num(v['time-taken']);
      if (n !== undefined) setPath(rec, 'event.duration', Math.round(n * 1e6));
    }
    if (v['cs(User-Agent)'] !== undefined) {
      setPath(rec, 'user_agent.original', v['cs(User-Agent)'].replaceAll('+', ' '));
    }
    out.push(rec);
  }
  return out;
}
