#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

class Usage extends Error {}

function parseArgs(argv) {
  const o = { query: null, agg: null, format: 'json', stats: false, files: [] };
  const needVal = (name, i) => {
    if (i + 1 >= argv.length) throw new Usage(`option ${name} requires a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let name = a;
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      name = a.slice(0, a.indexOf('='));
      inline = a.slice(a.indexOf('=') + 1);
    }
    if (name === '--query' || name === '--agg' || name === '--format') {
      let v = inline;
      if (v === null) { v = needVal(name, i); i++; }
      o[name.slice(2)] = v;
    } else if (name === '--stats' && inline === null) {
      o.stats = true;
    } else if (a === '-' || !a.startsWith('-')) {
      o.files.push(a);
    } else {
      throw new Usage(`unknown option: ${a}`);
    }
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Usage(`invalid format: ${o.format}`);
  if (o.format === 'table' && o.agg === null) throw new Usage('--format table requires --agg');
  return o;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function table(res) {
  if (res.buckets) {
    const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    return ['key'.padEnd(w) + '  count', ...rows.map((r) => r[0].padEnd(w) + '  ' + r[1])].join('\n') + '\n';
  }
  return String(res.value) + '\n';
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(`usage error: ${e.message}\n`);
    return 2;
  }
  let match;
  try {
    match = compile(o.query === null ? '' : o.query);
    if (o.agg !== null) aggregate([], o.agg);
  } catch (e) {
    if (e instanceof QuerySyntaxError || /^invalid aggregation/.test(e.message)) {
      process.stderr.write(e.message + '\n');
      return 2;
    }
    throw e;
  }

  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    if (f === '-') {
      try { text = await readStdin(); } catch (e) { text = ''; }
    } else {
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch (e) {
        process.stderr.write(`cannot read ${f}\n`);
        return 1;
      }
    }
    if (text === '') continue;
    const arr = text.split('\n');
    if (arr[arr.length - 1] === '') arr.pop();
    for (const line of arr) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (o.agg === null) {
    for (const rec of matched) {
      const c = {};
      for (const k of Object.keys(rec)) {
        if (k !== '@t') Object.defineProperty(c, k, { value: rec[k], writable: true, enumerable: true, configurable: true });
      }
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => {
  process.stderr.write(String(e && e.stack || e) + '\n');
  process.exitCode = 1;
});
