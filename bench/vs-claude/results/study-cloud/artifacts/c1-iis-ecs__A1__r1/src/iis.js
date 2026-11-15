/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

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

function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] === undefined) cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
}

export function parseIisLog(text) {
  const results = [];
  let fields = null;
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.trim() === '') continue;
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
    let date, time;
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i];
      const v = values[i];
      if (v === '-') continue;
      if (name === 'date') date = v;
      else if (name === 'time') time = v;
      else if (STRING_FIELDS[name]) setPath(rec, STRING_FIELDS[name], v);
      else if (NUMBER_FIELDS[name]) {
        const n = Number(v);
        if (v !== '' && Number.isFinite(n)) setPath(rec, NUMBER_FIELDS[name], n);
      } else if (name === 'time-taken') {
        const n = Number(v);
        if (v !== '' && Number.isFinite(n)) setPath(rec, ['event', 'duration'], n * 1e6);
      } else if (name === 'cs(User-Agent)') {
        setPath(rec, ['user_agent', 'original'], v.replace(/\+/g, ' '));
      }
    }
    if (date !== undefined && time !== undefined) {
      const d = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(d.getTime())) rec['@timestamp'] = d.toISOString();
    }
    results.push(rec);
  }
  return results;
}
