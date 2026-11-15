/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const MAP = {
  's-ip': ['server.ip'],
  'c-ip': ['client.ip'],
  'cs-method': ['http.request.method'],
  'cs-uri-stem': ['url.path'],
  'cs-uri-query': ['url.query'],
  'sc-status': ['http.response.status_code', num],
  'time-taken': ['event.duration', (v) => { const n = num(v); return n === undefined ? n : n * 1e6; }],
  'cs(User-Agent)': ['user_agent.original', (v) => v.replace(/\+/g, ' ')],
  'cs-username': ['user.name'],
  's-port': ['server.port', num],
};

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
  cur[parts[parts.length - 1]] = value;
}

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) fields = line.slice(8).trim().split(/\s+/);
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;
    const rec = {};
    let date, time;
    fields.forEach((f, i) => {
      const v = cols[i];
      if (v === '-') return;
      if (f === 'date') date = v;
      else if (f === 'time') time = v;
      else if (Object.hasOwn(MAP, f)) {
        const [path, conv] = MAP[f];
        const val = conv ? conv(v) : v;
        if (val !== undefined) setPath(rec, path, val);
      }
    });
    if (date && time) {
      const d = new Date(`${date}T${time}Z`);
      if (!isNaN(d)) rec['@timestamp'] = d.toISOString();
    }
    out.push(rec);
  }
  return out;
}
