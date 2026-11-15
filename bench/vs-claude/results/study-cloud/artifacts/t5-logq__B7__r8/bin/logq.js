#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    let name = a;
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); inline = a.slice(eq + 1); }
    const val = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) usage(`option ${name} requires a value`);
      return argv[++i];
    };
    if (name === '--query') o.query = val();
    else if (name === '--agg') o.agg = val();
    else if (name === '--format') o.format = val();
    else if (name === '--stats' && inline === undefined) o.stats = true;
    else usage(`unknown option ${a}`);
  }
  if (o.format !== 'json' && o.format !== 'table') usage(`invalid format ${o.format}`);
  if (o.agg === null && o.format === 'table') usage('--format table requires --agg');
  return o;
}

function table(res) {
  if (res.buckets) {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const lines = ['key'.padEnd(w) + '  count'];
    res.buckets.forEach((b, i) => lines.push(keys[i].padEnd(w) + '  ' + b.count));
    return lines;
  }
  return [String(res.value)];
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let match;
  try {
    match = compile(o.query);
    if (o.agg !== null) aggregate([], o.agg);
  } catch (e) {
    if (e instanceof QuerySyntaxError || /^invalid aggregation/.test(e.message)) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
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
      if (f === '-' && e.code === 'EOF') text = '';
      else {
        process.stderr.write(`logq: cannot read ${f}\n`);
        process.exit(1);
      }
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
  let out = [];
  if (o.agg === null) {
    for (const r of matched) {
      const c = { ...r };
      delete c['@t'];
      out.push(JSON.stringify(c));
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : [JSON.stringify(res)];
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
