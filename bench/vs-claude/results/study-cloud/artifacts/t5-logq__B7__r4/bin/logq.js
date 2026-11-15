#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'src');
const { parseLine } = require(path.join(root, 'parse'));
const { compile } = require(path.join(root, 'query'));
const { aggregate } = require(path.join(root, 'agg'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { o.files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== undefined) usage('option --stats takes no value');
      o.stats = true;
    } else if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === undefined) {
        if (i + 1 >= argv.length) usage('missing value for ' + a);
        v = argv[++i];
      }
      o[a.slice(2)] = v;
    } else usage('unknown option ' + a);
  }
  if (o.format !== 'json' && o.format !== 'table') usage('invalid format ' + o.format);
  if (o.agg === undefined && o.format === 'table') usage('--format table requires --agg');
  return o;
}

function readSource(name) {
  const buf = name === '-' ? fs.readFileSync(0) : fs.readFileSync(name);
  return buf.toString('utf8');
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function table(res) {
  if (!Array.isArray(res.buckets)) return String(res.value) + '\n';
  const keys = res.buckets.map((b) => String(b.key));
  const w = Math.max(3, ...keys.map((k) => k.length));
  let out = 'key'.padEnd(w) + '  count\n';
  res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
  return out;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let match = () => true;
  try {
    match = compile(o.query === undefined ? '' : o.query);
    if (o.agg !== undefined) aggregate([], o.agg);
  } catch (e) {
    process.stderr.write('logq: ' + e.message + '\n');
    process.exit(2);
  }
  const sources = o.files.length ? o.files : ['-'];
  let lines = 0, malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try { text = readSource(f); } catch (e) {
      process.stderr.write('logq: cannot read ' + (f === '-' ? 'stdin' : f) + '\n');
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
    for (const r of matched) {
      const c = Object.assign({}, r);
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
}

main();
