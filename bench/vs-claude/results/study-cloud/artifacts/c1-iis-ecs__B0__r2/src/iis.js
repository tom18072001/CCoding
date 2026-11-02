/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const asNumber = (v) => {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
};

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

export function parseIisLog(text) {
  const results = [];
  let fields = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\r+$/, '');
    if (line.trim() === '') continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(/ +/).filter((f) => f !== '');
      }
      continue;
    }

    if (fields === null) continue;
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
      else if (STRING_FIELDS[name]) setPath(rec, STRING_FIELDS[name], val);
      else if (NUMBER_FIELDS[name]) {
        const n = asNumber(val);
        if (n !== undefined) setPath(rec, NUMBER_FIELDS[name], n);
      } else if (name === 'time-taken') {
        const n = asNumber(val);
        if (n !== undefined) setPath(rec, 'event.duration', Math.round(n * 1e6));
      } else if (name === 'cs(User-Agent)') {
        setPath(rec, 'user_agent.original', val.replace(/\+/g, ' '));
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
