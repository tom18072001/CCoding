/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] ??= {};
  }
  cur[keys[keys.length - 1]] = value;
}

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const SIMPLE = {
  's-ip': ['server.ip'],
  'c-ip': ['client.ip'],
  'cs-method': ['http.request.method'],
  'cs-uri-stem': ['url.path'],
  'cs-uri-query': ['url.query'],
  'sc-status': ['http.response.status_code', toNumber],
  'time-taken': ['event.duration', (v) => {
    const n = toNumber(v);
    return n === undefined ? undefined : n * 1_000_000;
  }],
  'cs(User-Agent)': ['user_agent.original', (v) => v.replace(/\+/g, ' ')],
  'cs-username': ['user.name'],
  's-port': ['server.port', toNumber],
};

export function parseIisLog(text) {
  const result = [];
  let fields = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(/\s+/).filter(Boolean);
      }
      continue;
    }
    if (!fields) continue;
    const values = line.split(' ');
    if (values.length !== fields.length) continue;

    const rec = {};
    let date;
    let time;
    fields.forEach((name, i) => {
      const v = values[i];
      if (v === '-') return;
      if (name === 'date') date = v;
      else if (name === 'time') time = v;
      else if (SIMPLE[name]) {
        const [path, conv] = SIMPLE[name];
        const out = conv ? conv(v) : v;
        if (out !== undefined) setPath(rec, path, out);
      }
    });
    if (date && time) {
      const d = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(d.getTime())) rec['@timestamp'] = d.toISOString();
    }
    result.push(rec);
  }
  return result;
}
