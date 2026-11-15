#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src');

function usage(msg) {
  process.stderr.write('usage error: ' + msg + '\n');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', files: [], stats: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) usage('missing value for ' + a);
      const v = argv[++i];
      if (a === '--query') o.query = v;
      else if (a === '--agg') o.agg = v;
      else {
        if (v !== 'json' && v !== 'table') usage('invalid format: ' + v);
        o.format = v;
      }
    } else if (a === '--stats') o.stats = true;
    else if (a === '-' || !a.startsWith('-')) o.files.push(a);
    else usage('unknown option: ' + a);
  }
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.format === 'table' && o.agg === undefined) usage('--format table requires --agg');

  let match;
  try {
    match = compile(o.query === undefined ? '' : o.query);
  } catch (e) {
    if (e && e.name === 'QuerySyntaxError') {
      process.stderr.write(e.message + '\n');
      process.exit(2);
    }
    throw e;
  }
  if (o.agg !== undefined) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      process.stderr.write(String(e && e.message) + '\n');
      process.exit(2);
    }
  }

  const sources = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try {
      text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
    } catch (e) {
      process.stderr.write('cannot read ' + f + '\n');
      process.exit(1);
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (o.agg === undefined) {
    for (const rec of matched) {
      const c = Object.assign({}, rec);
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    let res;
    try {
      res = aggregate(matched, o.agg);
    } catch (e) {
      process.stderr.write(String(e && e.message) + '\n');
      process.exit(2);
    }
    if (o.format === 'json') out = JSON.stringify(res) + '\n';
    else if (Array.isArray(res.buckets)) {
      const keys = res.buckets.map((b) => String(b.key));
      const w = Math.max(3, ...keys.map((k) => k.length));
      out = 'key'.padEnd(w) + '  count\n';
      res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
    } else out = String(res.value) + '\n';
  }
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  process.stdout.write(out);
}

main();
