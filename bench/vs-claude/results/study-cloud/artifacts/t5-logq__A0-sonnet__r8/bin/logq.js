#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exit(2);
}

const args = process.argv.slice(2);
let query = '', agg = null, format = 'json', stats = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  let a = args[i];
  if (a === '--') { files.push(...args.slice(i + 1)); break; }
  if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
  let inline = null;
  const eq = a.indexOf('=');
  if (a.startsWith('--') && eq !== -1) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
  const val = () => {
    if (inline !== null) return inline;
    if (i + 1 >= args.length) usage('missing value for ' + a);
    return args[++i];
  };
  if (a === '--query') query = val();
  else if (a === '--agg') agg = val();
  else if (a === '--format') format = val();
  else if (a === '--stats' && inline === null) stats = true;
  else usage('unknown option ' + a);
}
if (format !== 'json' && format !== 'table') usage('invalid format ' + format);
if (format === 'table' && agg === null) usage('--format table requires --agg');

let match;
try {
  match = compile(query);
  if (agg !== null) aggregate([], agg);
} catch (e) {
  process.stderr.write('logq: ' + e.message + '\n');
  process.exit(2);
}

const sources = files.length ? files : ['-'];
let lines = 0, malformed = 0;
const matched = [];
for (const f of sources) {
  let text;
  try {
    text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
  } catch (e) {
    process.stderr.write('logq: cannot read ' + f + '\n');
    process.exit(1);
  }
  const ls = text.split('\n');
  if (ls[ls.length - 1] === '') ls.pop();
  for (const line of ls) {
    lines++;
    const r = parseLine(line);
    if (!r.ok) { malformed++; continue; }
    if (match(r.record)) matched.push(r.record);
  }
}

let out = '';
if (agg === null) {
  for (const r of matched) {
    const c = { ...r };
    delete c['@t'];
    out += JSON.stringify(c) + '\n';
  }
} else {
  const res = aggregate(matched, agg);
  if (format === 'json') out = JSON.stringify(res) + '\n';
  else if (res.buckets) {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    out = 'key'.padEnd(w) + '  count\n';
    res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
  } else out = String(res.value) + '\n';
}
if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
process.stdout.write(out);
