#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '-' || !a.startsWith('--')) {
      if (a !== '-' && a.startsWith('-')) throw new Error('unknown option ' + a);
      o.files.push(a);
      continue;
    }
    let inline;
    const eq = a.indexOf('=');
    if (eq !== -1) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== undefined) throw new Error('option --stats takes no value');
      o.stats = true;
      continue;
    }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === undefined) {
        if (i + 1 >= argv.length) throw new Error('missing value for ' + a);
        v = argv[++i];
      }
      o[a.slice(2)] = v;
      continue;
    }
    throw new Error('unknown option ' + a);
  }
  return o;
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    return usage(e.message);
  }
  if (o.format !== 'json' && o.format !== 'table') return usage('invalid format ' + o.format);
  if (o.format === 'table' && o.agg === undefined) return usage('--format table requires --agg');
  let match;
  try {
    match = compile(o.query === undefined ? '' : o.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  if (o.agg !== undefined) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
  }

  const sources = o.files.length ? o.files : ['-'];
  let lines = 0, malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write('cannot read ' + f + '\n');
      process.exitCode = 1;
      return;
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
  if (o.agg === undefined) {
    for (const rec of matched) {
      const c = { ...rec };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    if (o.format === 'json') {
      out = JSON.stringify(res) + '\n';
    } else if (res.buckets) {
      const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
      out = 'key'.padEnd(w) + '  count\n';
      for (const b of res.buckets) out += String(b.key).padEnd(w) + '  ' + b.count + '\n';
    } else {
      out = String(res.value) + '\n';
    }
  }
  if (out) process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
