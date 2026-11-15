#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function main(argv) {
  let query = null, agg = null, format = 'json', stats = false;
  const files = [];
  let rest = false;
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (rest || a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    if (a === '--') { rest = true; continue; }
    if (a === '--stats') { stats = true; continue; }
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) return usage('missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else {
        if (v !== 'json' && v !== 'table') return usage('invalid format: ' + v);
        format = v;
      }
      continue;
    }
    return usage('unknown option: ' + a);
  }
  if (format === 'table' && agg === null && argv.some((x) => x === '--format' || x.startsWith('--format='))) {
    return usage('--format table requires --agg');
  }
  let pred;
  try {
    pred = compile(query === null ? '' : query);
    if (agg !== null) aggregate([], agg);
  } catch (e) {
    process.stderr.write((e instanceof QuerySyntaxError || e instanceof Error ? e.message : String(e)) + '\n');
    process.exitCode = 2;
    return;
  }

  let lines = 0, malformed = 0;
  const matched = [];
  const sources = files.length ? files : ['-'];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      if (f === '-' && e.code === 'EOF') text = '';
      else {
        process.stderr.write('cannot read ' + f + '\n');
        process.exitCode = 1;
        return;
      }
    }
    if (text === '') continue;
    const ls = text.split('\n');
    if (ls[ls.length - 1] === '') ls.pop();
    for (const line of ls) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (pred(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === null) {
    for (const rec of matched) {
      const c = Object.assign({}, rec);
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
    } else {
      out = String(res.value) + '\n';
    }
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
