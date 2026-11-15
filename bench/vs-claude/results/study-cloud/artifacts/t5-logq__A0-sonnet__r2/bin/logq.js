#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exitCode = 2;
}

function main(argv) {
  let query = '';
  let agg = null;
  let format = null;
  let stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== null) return usage('--stats takes no value');
      stats = true;
      continue;
    }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) return usage(`missing value for ${a}`);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
      continue;
    }
    return usage(`unknown option ${a}`);
  }
  if (format !== null && format !== 'json' && format !== 'table') return usage(`invalid format ${format}`);
  if (format === 'table' && agg === null) return usage('--format table requires --agg');

  let match;
  try { match = compile(query); } catch (e) {
    if (e instanceof QuerySyntaxError) { process.stderr.write(e.message + '\n'); process.exitCode = 2; return; }
    throw e;
  }
  if (agg !== null) {
    try { aggregate([], agg); } catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 2; return; }
  }

  if (files.length === 0) files.push('-');
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try { text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'); } catch (e) {
      process.stderr.write(`cannot read ${f}\n`);
      process.exitCode = 1;
      return;
    }
    if (text === '') continue;
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === null) {
    for (const rec of matched) {
      const c = { ...rec };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
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
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
