/** Parse an IIS W3C extended log into ECS-style objects. See the task brief. */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] ??= {};
  }
  cur[keys[keys.length - 1]] = value;
}

const NUM = /^\d+(\.\d+)?$/;
const toNumber = (v) => (NUM.test(v) ? Number(v) : undefined);

const SIMPLE = {
  's-ip': 'server.ip',
  'c-ip': 'client.ip',
  'cs-method': 'http.request.method',
  'cs-uri-stem': 'url.path',
  'cs-uri-query': 'url.query',
  'cs-username': 'user.name',
};

function timestamp(date, time) {
  if (date === undefined || time === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(time)) return undefined;
  const d = new Date(`${date}T${time}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseIisLog(text) {
  const result = [];
  let fields = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#Fields:')) {
        fields = line.slice('#Fields:'.length).trim().split(' ');
      }
      continue;
    }
    if (!fields) continue;
    const cols = line.split(' ');
    if (cols.length !== fields.length) continue;

    const v = {};
    fields.forEach((f, i) => {
      if (cols[i] !== '-' && !(f in v)) v[f] = cols[i];
    });

    const doc = {};
    const ts = timestamp(v.date, v.time);
    if (ts !== undefined) doc['@timestamp'] = ts;
    for (const [f, path] of Object.entries(SIMPLE)) {
      if (v[f] !== undefined) setPath(doc, path, v[f]);
    }
    if (v['sc-status'] !== undefined) {
      const n = toNumber(v['sc-status']);
      if (n !== undefined) setPath(doc, 'http.response.status_code', n);
    }
    if (v['s-port'] !== undefined) {
      const n = toNumber(v['s-port']);
      if (n !== undefined) setPath(doc, 'server.port', n);
    }
    if (v['time-taken'] !== undefined) {
      const n = toNumber(v['time-taken']);
      if (n !== undefined) setPath(doc, 'event.duration', Math.round(n * 1e6));
    }
    if (v['cs(User-Agent)'] !== undefined) {
      setPath(doc, 'user_agent.original', v['cs(User-Agent)'].replace(/\+/g, ' '));
    }
    if (Object.keys(doc).length > 0) result.push(doc);
  }
  return result;
}
