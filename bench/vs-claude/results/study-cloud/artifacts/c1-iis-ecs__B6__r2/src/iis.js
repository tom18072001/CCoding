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

function toNumber(v) {
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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

export function parseIisLog(text) {
  const results = [];
  let fields = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(' ').filter((f) => f !== '');
      }
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
      const d = new Date(`${raw.date}T${raw.time}Z`);
      if (!Number.isNaN(d.getTime())) setPath(rec, '@timestamp', d.toISOString());
    }
    for (const [f, v] of Object.entries(raw)) {
      if (STRING_FIELDS[f]) {
        setPath(rec, STRING_FIELDS[f], v);
      } else if (NUMBER_FIELDS[f]) {
        const n = toNumber(v);
        if (n !== undefined) setPath(rec, NUMBER_FIELDS[f], n);
      } else if (f === 'time-taken') {
        const n = toNumber(v);
        if (n !== undefined) setPath(rec, 'event.duration', n * 1e6);
      } else if (f === 'cs(User-Agent)') {
        setPath(rec, 'user_agent.original', v.replace(/\+/g, ' '));
      }
    }
    results.push(rec);
  }
  return results;
}
