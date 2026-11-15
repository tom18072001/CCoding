/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] ??= {};
  }
  cur[keys[keys.length - 1]] = value;
}

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

function toNumber(v) {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseIisLog(text) {
  const results = [];
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
    const values = line.split(' ');
    if (values.length !== fields.length) continue;

    const rec = {};
    let date;
    let time;
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i];
      const v = values[i];
      if (v === '-') continue;

      if (name === 'date') date = v;
      else if (name === 'time') time = v;
      else if (Object.hasOwn(STRING_FIELDS, name)) setPath(rec, STRING_FIELDS[name], v);
      else if (Object.hasOwn(NUMBER_FIELDS, name)) {
        const n = toNumber(v);
        if (n !== undefined) setPath(rec, NUMBER_FIELDS[name], n);
      } else if (name === 'time-taken') {
        const n = toNumber(v);
        if (n !== undefined) setPath(rec, 'event.duration', Math.round(n * 1e6));
      } else if (name === 'cs(User-Agent)') {
        setPath(rec, 'user_agent.original', v.replaceAll('+', ' '));
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
