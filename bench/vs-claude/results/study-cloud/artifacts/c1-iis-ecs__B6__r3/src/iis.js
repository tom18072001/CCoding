/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const MAPPING = {
  's-ip': ['server.ip', (v) => v],
  'c-ip': ['client.ip', (v) => v],
  'cs-method': ['http.request.method', (v) => v],
  'cs-uri-stem': ['url.path', (v) => v],
  'cs-uri-query': ['url.query', (v) => v],
  'sc-status': ['http.response.status_code', num],
  'time-taken': ['event.duration', (v) => { const n = num(v); return n === undefined ? undefined : n * 1e6; }],
  'cs(User-Agent)': ['user_agent.original', (v) => v.replace(/\+/g, ' ')],
  'cs-username': ['user.name', (v) => v],
  's-port': ['server.port', num],
};

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(/\s+/).filter(Boolean);
      }
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;
    const rec = {};
    let date, time;
    for (let i = 0; i < fields.length; i++) {
      const v = cols[i];
      if (v === '-') continue;
      const f = fields[i];
      if (f === 'date') date = v;
      else if (f === 'time') time = v;
      else if (Object.hasOwn(MAPPING, f)) {
        const [path, conv] = MAPPING[f];
        const val = conv(v);
        if (val !== undefined) setPath(rec, path, val);
      }
    }
    if (date && time) {
      const d = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(d.getTime())) rec['@timestamp'] = d.toISOString();
    }
    out.push(rec);
  }
  return out;
}
