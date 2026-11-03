#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function main(argv) {
  let query, agg, format = 'json', stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== undefined) return usage('option --stats takes no value');
      stats = true;
      continue;
    }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === undefined) {
        if (i + 1 >= argv.length) return usage('missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
      continue;
    }
    return usage('unknown option ' + a);
  }
  if (format !== 'json' && format !== 'table') return usage('invalid format ' + format);
  if (format === 'table' && agg === undefined) return usage('--format table requires --agg');

  let pred = () => true;
  try {
    if (query !== undefined) pred = compile(query);
    if (agg !== undefined) aggregate([], agg);
  } catch (e) {
    process.stderr.write('logq: ' + e.message + '\n');
    process.exitCode = 2;
    return;
  }

  const sources = files.length ? files : ['-'];
  const texts = [];
  for (const f of sources) {
    try {
      let buf;
      if (f === '-') {
        try { buf = fs.readFileSync(0); } catch (e) { if (e.code === 'EOF' || e.code === 'EAGAIN') buf = Buffer.alloc(0); else throw e; }
      } else buf = fs.readFileSync(f);
      texts.push(buf.toString('utf8').replace(/^﻿/, ''));
    } catch (e) {
      process.stderr.write('logq: cannot read ' + f + '\n');
      process.exitCode = 1;
      return;
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const text of texts) {
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
  if (agg === undefined) {
    for (const rec of matched) {
      const copy = Object.assign({}, rec);
      delete copy['@t'];
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
      const w = Math.max(3, ...rows.map((r) => r[0].length));
      out = 'key'.padEnd(w) + '  count\n';
      for (const [k, c] of rows) out += k.padEnd(w) + '  ' + c + '\n';
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
