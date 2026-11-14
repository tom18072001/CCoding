#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exit(2);
}

const opts = { query: '', agg: null, format: 'json', stats: false };
const files = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { files.push(...argv.slice(i + 1)); break; }
  if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
  let name = a, inline = null;
  const eq = a.indexOf('=');
  if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); inline = a.slice(eq + 1); }
  if (name === '--stats' && inline === null) { opts.stats = true; continue; }
  if (name === '--query' || name === '--agg' || name === '--format') {
    let v = inline;
    if (v === null) {
      if (i + 1 >= argv.length) usage('missing value for ' + name);
      v = argv[++i];
    }
    opts[name.slice(2)] = v;
    continue;
  }
  usage('unknown option ' + a);
}
if (opts.format !== 'json' && opts.format !== 'table') usage('invalid --format ' + opts.format);
if (opts.format === 'table' && opts.agg === null) usage('--format table requires --agg');

let match;
try {
  match = compile(opts.query);
  if (opts.agg !== null) aggregate([], opts.agg);
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(2);
}

if (files.length === 0) files.push('-');
let lines = 0, malformed = 0;
const matched = [];
for (const f of files) {
  let text;
  try {
    text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
  } catch (e) {
    process.stderr.write('cannot read ' + f + '\n');
    process.exit(1);
  }
  if (text === '') continue;
  const arr = text.split('\n');
  if (text.endsWith('\n')) arr.pop();
  for (const line of arr) {
    lines++;
    const r = parseLine(line);
    if (!r.ok) { malformed++; continue; }
    if (match(r.record)) matched.push(r.record);
  }
}

let out = '';
if (opts.agg === null) {
  for (const rec of matched) {
    const c = {};
    for (const k of Object.keys(rec)) {
      if (k !== '@t') Object.defineProperty(c, k, { value: rec[k], writable: true, enumerable: true, configurable: true });
    }
    out += JSON.stringify(c) + '\n';
  }
} else {
  const res = aggregate(matched, opts.agg);
  if (opts.format === 'json') out = JSON.stringify(res) + '\n';
  else if (res.buckets) {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    out = 'key'.padEnd(w) + '  count\n';
    res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
  } else out = String(res.value) + '\n';
}
process.stdout.write(out);
if (opts.stats) process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
