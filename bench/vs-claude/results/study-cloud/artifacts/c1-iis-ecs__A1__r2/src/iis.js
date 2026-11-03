/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

const num = (v) => {
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  return Number(v);
};

// field name -> [path, transform]; transform returns undefined to omit
const MAP = {
  's-ip': [['server', 'ip']],
  'c-ip': [['client', 'ip']],
  'cs-method': [['http', 'request', 'method']],
  'cs-uri-stem': [['url', 'path']],
  'cs-uri-query': [['url', 'query']],
  'sc-status': [['http', 'response', 'status_code'], num],
  'time-taken': [['event', 'duration'], (v) => {
    const n = num(v);
    return n === undefined ? undefined : Math.round(n * 1e6);
  }],
  'cs(User-Agent)': [['user_agent', 'original'], (v) => v.replace(/\+/g, ' ')],
  'cs-username': [['user', 'name']],
  's-port': [['server', 'port'], num],
};

function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]] ??= {};
  }
  cur[path[path.length - 1]] = value;
}

function timestamp(date, time) {
  if (!date || !time) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(time);
  if (!m || !t) return undefined;
  const ms = t[4] ? Number(t[4].padEnd(3, '0').slice(0, 3)) : 0;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], +t[3], ms));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (let line of String(text).split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
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
    let date, time;
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i];
      const v = cols[i];
      if (v === '-') continue;
      if (name === 'date') date = v;
      else if (name === 'time') time = v;
      else if (Object.hasOwn(MAP, name)) {
        const [path, fn] = MAP[name];
        const val = fn ? fn(v) : v;
        if (val !== undefined) setPath(rec, path, val);
      }
    }
    const ts = timestamp(date, time);
    const result = ts ? { '@timestamp': ts, ...rec } : rec;
    out.push(result);
  }
  return out;
}
