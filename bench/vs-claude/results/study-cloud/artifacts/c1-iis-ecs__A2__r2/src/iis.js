/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */
function set(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] ??= {};
  o[keys[keys.length - 1]] = value;
}

const STRING_FIELDS = {
  's-ip': 'server.ip',
  'c-ip': 'client.ip',
  'cs-method': 'http.request.method',
  'cs-uri-stem': 'url.path',
  'cs-uri-query': 'url.query',
  'cs-username': 'user.name',
};

function num(v) {
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  return Number(v);
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
    const raw = {};
    fields.forEach((f, i) => {
      if (cols[i] !== '-') raw[f] = cols[i];
    });
    if (raw.date !== undefined && raw.time !== undefined) {
      const t = /^(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/.exec(raw.time);
      if (t) {
        const ms = (t[2] || '').padEnd(3, '0').slice(0, 3) || '000';
        const d = new Date(`${raw.date}T${t[1]}.${ms}Z`);
        if (!isNaN(d)) rec['@timestamp'] = d.toISOString();
      }
    }
    for (const [f, v] of Object.entries(raw)) {
      if (STRING_FIELDS[f]) set(rec, STRING_FIELDS[f], v);
      else if (f === 'cs(User-Agent)') set(rec, 'user_agent.original', v.replaceAll('+', ' '));
      else if (f === 'sc-status') {
        const n = num(v);
        if (n !== undefined) set(rec, 'http.response.status_code', n);
      } else if (f === 's-port') {
        const n = num(v);
        if (n !== undefined) set(rec, 'server.port', n);
      } else if (f === 'time-taken') {
        const n = num(v);
        if (n !== undefined) set(rec, 'event.duration', Math.round(n * 1e6));
      }
    }
    out.push(rec);
  }
  return out;
}
