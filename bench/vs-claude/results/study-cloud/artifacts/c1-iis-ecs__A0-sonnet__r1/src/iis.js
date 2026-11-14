/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] ??= {};
  }
  cur[keys[keys.length - 1]] = value;
}

const num = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);

const STRING_FIELDS = {
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
  for (const raw of String(text).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
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
      else if (STRING_FIELDS[f]) setPath(rec, STRING_FIELDS[f], v);
      else if (f === 'sc-status') {
        const n = num(v);
        if (n !== undefined) setPath(rec, 'http.response.status_code', n);
      } else if (f === 's-port') {
        const n = num(v);
        if (n !== undefined) setPath(rec, 'server.port', n);
      } else if (f === 'time-taken') {
        const n = num(v);
        if (n !== undefined) setPath(rec, 'event.duration', Math.round(n * 1e6));
      } else if (f === 'cs(User-Agent)') {
        setPath(rec, 'user_agent.original', v.replaceAll('+', ' '));
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
