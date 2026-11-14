#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let query = '';
let agg = null;
let format = 'json';
let stats = false;
const files = [];
for (let i = 0; i < argv.length; i++) {
  let a = argv[i];
  if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
  let inline = null;
  const eq = a.indexOf('=');
  if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
  if (a === '--stats') {
    if (inline !== null) usage('option --stats takes no value');
    stats = true;
  } else if (a === '--query' || a === '--agg' || a === '--format') {
    let v = inline;
    if (v === null) {
      if (i + 1 >= argv.length) usage(`option ${a} requires a value`);
      v = argv[++i];
    }
    if (a === '--query') query = v;
    else if (a === '--agg') agg = v;
    else format = v;
  } else usage(`unknown option ${a}`);
}
if (format !== 'json' && format !== 'table') usage(`invalid format ${format}`);
if (format === 'table' && agg === null) usage('--format table requires --agg');

let matcher;
try { matcher = compile(query); } catch (e) {
  if (e instanceof QuerySyntaxError) { process.stderr.write(e.message + '\n'); process.exit(2); }
  throw e;
}
if (agg !== null) {
  try { aggregate([], agg); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(2); }
}

let lines = 0;
let malformed = 0;
const matched = [];
const sources = files.length ? files : ['-'];
for (const f of sources) {
  let text;
  try { text = fs.readFileSync(f === '-' ? 0 : f, 'utf8'); } catch (e) {
    process.stderr.write(`cannot read ${f}\n`);
    process.exit(1);
  }
  if (text === '') continue;
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  for (const line of parts) {
    lines++;
    const r = parseLine(line);
    if (!r.ok) { malformed++; continue; }
    if (matcher(r.record)) matched.push(r.record);
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
process.stdout.write(out);
if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
