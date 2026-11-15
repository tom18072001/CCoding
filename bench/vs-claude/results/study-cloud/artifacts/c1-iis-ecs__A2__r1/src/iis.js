/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */
function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] ??= {};
  cur[path[path.length - 1]] = value;
}

const STRING_FIELDS = {
  's-ip': ['server', 'ip'],
  'c-ip': ['client', 'ip'],
  'cs-method': ['http', 'request', 'method'],
  'cs-uri-stem': ['url', 'path'],
  'cs-uri-query': ['url', 'query'],
  'cs-username': ['user', 'name'],
};
const NUMBER_FIELDS = {
  'sc-status': ['http', 'response', 'status_code'],
  's-port': ['server', 'port'],
};

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const raw of String(text).split('\n')) {
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
    let date, time;
    fields.forEach((f, i) => {
      const v = cols[i];
      if (v === '-') return;
      if (f === 'date') date = v;
      else if (f === 'time') time = v;
      else if (f in STRING_FIELDS) setPath(rec, STRING_FIELDS[f], v);
      else if (f in NUMBER_FIELDS) {
        const n = Number(v);
        if (Number.isFinite(n)) setPath(rec, NUMBER_FIELDS[f], n);
      } else if (f === 'time-taken') {
        const n = Number(v);
        if (Number.isFinite(n)) setPath(rec, ['event', 'duration'], n * 1e6);
      } else if (f === 'cs(User-Agent)') {
        setPath(rec, ['user_agent', 'original'], v.replace(/\+/g, ' '));
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
