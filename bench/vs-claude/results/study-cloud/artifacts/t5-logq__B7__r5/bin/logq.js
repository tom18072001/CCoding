#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine } = require('../src/parse.js');
const { compile } = require('../src/query.js');
const { aggregate } = require('../src/agg.js');

function usage(msg) {
  process.stderr.write('usage error: ' + msg + '\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
let query = '';
let agg = null;
let format = null;
let stats = false;
const files = [];
for (let i = 0; i < argv.length; i++) {
  let a = argv[i];
  if (a === '--') {
    files.push(...argv.slice(i + 1));
    break;
  }
  let inline = null;
  if (a.startsWith('--') && a.includes('=')) {
    inline = a.slice(a.indexOf('=') + 1);
    a = a.slice(0, a.indexOf('='));
  }
  const val = () => {
    if (inline !== null) return inline;
    if (i + 1 >= argv.length) usage('missing value for ' + a);
    return argv[++i];
  };
  if (a === '--query') query = val();
  else if (a === '--agg') agg = val();
  else if (a === '--format') format = val();
  else if (a === '--stats') stats = true;
  else if (a !== '-' && a.startsWith('-')) usage('unknown option ' + a);
  else files.push(a);
}
if (format !== null && format !== 'json' && format !== 'table') usage('invalid --format ' + format);
if (format === 'table' && agg === null) usage('--format table requires --agg');

let match;
try {
  match = compile(query);
  if (agg !== null) aggregate([], agg); // kiểm tra spec sớm
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(2);
}

const records = [];
let lines = 0;
let malformed = 0;
function consume(text) {
  if (text === '') return;
  const arr = text.split('\n');
  if (arr[arr.length - 1] === '') arr.pop();
  for (const line of arr) {
    lines++;
    const r = parseLine(line);
    if (!r.ok) malformed++;
    else if (match(r.record)) records.push(r.record);
  }
}

const sources = files.length ? files : ['-'];
for (const f of sources) {
  let text;
  try {
    text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
  } catch (e) {
    process.stderr.write('cannot read ' + f + '\n');
    process.exit(1);
  }
  consume(text);
}

let out = '';
if (agg === null) {
  for (const r of records) {
    const c = { ...r };
    delete c['@t'];
    out += JSON.stringify(c) + '\n';
  }
} else {
  const res = aggregate(records, agg);
  if (format === 'table') {
    if (res.buckets) {
      const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
      out += 'key'.padEnd(w) + '  count\n';
      for (const b of res.buckets) out += String(b.key).padEnd(w) + '  ' + b.count + '\n';
    } else {
      out += String(res.value) + '\n';
    }
  } else {
    out += JSON.stringify(res) + '\n';
  }
}
if (stats) process.stderr.write(`lines=${lines} matched=${records.length} malformed=${malformed}\n`);
process.stdout.write(out);
