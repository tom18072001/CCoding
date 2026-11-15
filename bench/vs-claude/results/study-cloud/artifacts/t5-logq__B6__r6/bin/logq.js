#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src/index.js');

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '-' || !a.startsWith('--')) { o.files.push(a); continue; }
    let val = null;
    const eq = a.indexOf('=');
    if (eq > 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (val !== null) usage('option --stats takes no value');
      o.stats = true;
    } else if (a === '--query' || a === '--agg' || a === '--format') {
      if (val === null) {
        if (i + 1 >= argv.length) usage(`missing value for ${a}`);
        val = argv[++i];
      }
      o[a.slice(2)] = val;
    } else usage(`unknown option ${a}`);
  }
  if (o.format !== 'json' && o.format !== 'table') usage(`invalid --format ${o.format}`);
  if (o.format === 'table' && o.agg === null) usage('--format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function table(result) {
  if (!Array.isArray(result.buckets)) return [String(result.value)];
  const keys = result.buckets.map((b) => String(b.key));
  const w = Math.max(3, ...keys.map((k) => k.length));
  const out = ['key'.padEnd(w) + '  count'];
  result.buckets.forEach((b, i) => out.push(keys[i].padEnd(w) + '  ' + b.count));
  return out;
}

function fail(code, e) {
  process.stderr.write(`logq: ${e.message}\n`);
  process.exit(code);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let match;
  try { match = compile(o.query); } catch (e) { fail(2, e); }
  if (o.agg !== null) {
    try { aggregate([], o.agg); } catch (e) { fail(2, e); }
  }
  const files = o.files.length ? o.files : ['-'];
  let lines = 0, malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f === '-' ? 0 : f, 'utf8'); } catch (e) {
      if (f === '-' && e.code === 'EOF') text = '';
      else {
        process.stderr.write(`logq: cannot read ${f}: ${e.message}\n`);
        process.exit(1);
      }
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }
  let out = [];
  if (o.agg === null) {
    for (const rec of matched) {
      const c = { ...rec };
      delete c['@t'];
      out.push(JSON.stringify(c));
    }
  } else {
    let res;
    try { res = aggregate(matched, o.agg); } catch (e) { fail(2, e); }
    out = o.format === 'json' ? [JSON.stringify(res)] : table(res);
  }
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  if (out.length) fs.writeSync(1, out.join('\n') + '\n');
}

main();
