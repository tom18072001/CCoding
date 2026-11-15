#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) usage(`missing value for ${a}`);
      o[a.slice(2)] = argv[++i];
    } else if (a === '--stats') o.stats = true;
    else if (a === '-' || !a.startsWith('-')) o.files.push(a);
    else usage(`unknown option ${a}`);
  }
  if (o.format !== 'json' && o.format !== 'table') usage(`invalid --format ${o.format}`);
  if (o.format === 'table' && o.agg === undefined) usage('--format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function formatTable(res) {
  if (res.buckets) {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const out = ['key'.padEnd(w) + '  count'];
    res.buckets.forEach((b, i) => out.push(keys[i].padEnd(w) + '  ' + b.count));
    return out.join('\n') + '\n';
  }
  return String(res.value) + '\n';
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let pred = () => true;
  try {
    if (o.query !== undefined) pred = compile(o.query);
    if (o.agg !== undefined) aggregate([], o.agg);
  } catch (e) {
    if (e instanceof QuerySyntaxError || (e && /^invalid aggregation/.test(e.message))) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }

  const sources = o.files.length ? o.files : ['-'];
  const texts = [];
  for (const f of sources) {
    try {
      texts.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
    } catch (e) {
      process.stderr.write(`logq: cannot read ${f}\n`);
      process.exit(1);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const t of texts) {
    for (const line of splitLines(t)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (pred(r.record)) matched.push(r.record);
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
    out = o.format === 'table' ? formatTable(res) : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
