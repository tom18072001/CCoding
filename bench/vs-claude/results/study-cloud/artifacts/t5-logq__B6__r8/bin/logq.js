#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require(path.join(__dirname, '..', 'src', 'index.js'));

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: undefined, stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    let name = a, val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
    if (name === '--stats') {
      if (val !== undefined) usage('option --stats takes no argument');
      o.stats = true;
    } else if (name === '--query' || name === '--agg' || name === '--format') {
      if (val === undefined) {
        if (i + 1 >= argv.length) usage(`missing argument for ${name}`);
        val = argv[++i];
      }
      o[name.slice(2)] = val;
    } else usage(`unknown option ${a}`);
  }
  if (o.format !== undefined && o.format !== 'json' && o.format !== 'table') usage(`invalid format ${o.format}`);
  if (o.format === 'table' && o.agg === undefined) usage('--format table requires --agg');
  return o;
}

function readSource(f) {
  const buf = f === '-' ? fs.readFileSync(0) : fs.readFileSync(f);
  return buf.toString('utf8');
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let pred;
  try {
    pred = compile(o.query === undefined ? '' : o.query);
    if (o.agg !== undefined) aggregate([], o.agg);
  } catch (e) {
    if (e instanceof QuerySyntaxError || (e && e.name === 'QuerySyntaxError') ||
        (e && typeof e.message === 'string' && e.message.startsWith('invalid aggregation'))) {
      process.stderr.write(e.message + '\n');
      process.exit(2);
    }
    throw e;
  }

  const sources = o.files.length ? o.files : ['-'];
  const texts = [];
  for (const f of sources) {
    try { texts.push(readSource(f)); } catch (e) {
      process.stderr.write(`cannot read ${f}\n`);
      process.exit(1);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const text of texts) {
    if (text === '') continue;
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
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
    if (o.format === 'table') {
      if (Array.isArray(res.buckets)) {
        const keys = res.buckets.map((b) => String(b.key));
        const w = Math.max(3, ...keys.map((k) => k.length));
        out += 'key'.padEnd(w) + '  count\n';
        res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
      } else {
        out += (res.value === null || res.value === undefined ? 'null' : String(res.value)) + '\n';
      }
    } else out += JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
