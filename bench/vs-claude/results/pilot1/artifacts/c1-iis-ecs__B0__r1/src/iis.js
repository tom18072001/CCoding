/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function set(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] ??= {};
  }
  cur[keys[keys.length - 1]] = value;
}

const str = (v) => v;
const num = (v) => {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
};

const SIMPLE = {
  's-ip': ['server.ip', str],
  'c-ip': ['client.ip', str],
  'cs-method': ['http.request.method', str],
  'cs-uri-stem': ['url.path', str],
  'cs-uri-query': ['url.query', str],
  'sc-status': ['http.response.status_code', num],
  'time-taken': ['event.duration', (v) => { const n = num(v); return n === undefined ? undefined : n * 1_000_000; }],
  'cs(User-Agent)': ['user_agent.original', (v) => v.replaceAll('+', ' ')],
  'cs-username': ['user.name', str],
  's-port': ['server.port', num],
};

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(' ');
      }
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
      else if (SIMPLE[f]) {
        const r = SIMPLE[f][1](v);
        if (r !== undefined) set(rec, SIMPLE[f][0], r);
      }
    });
    if (date && time) {
      const d = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(d.getTime())) rec['@timestamp'] = d.toISOString();
    }
    out.push(rec);
  }
  return out;
}
