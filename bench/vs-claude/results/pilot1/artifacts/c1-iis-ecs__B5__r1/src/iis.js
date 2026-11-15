/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

const STRING_FIELDS = {
  's-ip': 'server.ip',
  'c-ip': 'client.ip',
  'cs-method': 'http.request.method',
  'cs-uri-stem': 'url.path',
  'cs-uri-query': 'url.query',
  'cs-username': 'user.name',
};
const NUMBER_FIELDS = {
  'sc-status': 'http.response.status_code',
  's-port': 'server.port',
};

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur[parts[i]] ??= {};
  }
  cur[parts[parts.length - 1]] = value;
}

export function parseIisLog(text) {
  const out = [];
  let fields = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(/ +/);
      }
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;

    const rec = {};
    let date;
    let time;
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i];
      const val = cols[i];
      if (val === '-') continue;
      if (name === 'date') date = val;
      else if (name === 'time') time = val;
      else if (name in STRING_FIELDS) setPath(rec, STRING_FIELDS[name], val);
      else if (name in NUMBER_FIELDS) {
        const n = Number(val);
        if (Number.isFinite(n)) setPath(rec, NUMBER_FIELDS[name], n);
      } else if (name === 'time-taken') {
        const n = Number(val);
        if (Number.isFinite(n)) setPath(rec, 'event.duration', Math.round(n * 1e6));
      } else if (name === 'cs(User-Agent)') {
        setPath(rec, 'user_agent.original', val.replaceAll('+', ' '));
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
