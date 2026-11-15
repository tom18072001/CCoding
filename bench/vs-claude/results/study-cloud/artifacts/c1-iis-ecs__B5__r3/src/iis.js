/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

const num = (v) => {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
};

// field name -> [ECS path, converter]
const MAP = {
  's-ip': ['server.ip'],
  'c-ip': ['client.ip'],
  'cs-method': ['http.request.method'],
  'cs-uri-stem': ['url.path'],
  'cs-uri-query': ['url.query'],
  'sc-status': ['http.response.status_code', num],
  'time-taken': ['event.duration', (v) => {
    const n = num(v);
    return n === undefined ? undefined : n * 1e6;
  }],
  'cs(User-Agent)': ['user_agent.original', (v) => v.replaceAll('+', ' ')],
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
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      const m = /^#Fields:\s?(.*)$/.exec(line);
      if (m) fields = m[1].trim().split(/ +/).filter(Boolean);
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;

    const rec = {};
    let date, time;
    fields.forEach((name, i) => {
      const v = cols[i];
      if (v === '-') return;
      if (name === 'date') date = v;
      else if (name === 'time') time = v;
      const spec = Object.hasOwn(MAP, name) ? MAP[name] : null;
      if (!spec) return;
      const val = spec[1] ? spec[1](v) : v;
      if (val !== undefined) setPath(rec, spec[0], val);
    });
    if (date && time) {
      const d = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(d.getTime())) rec['@timestamp'] = d.toISOString();
    }
    out.push(rec);
  }
  return out;
}
