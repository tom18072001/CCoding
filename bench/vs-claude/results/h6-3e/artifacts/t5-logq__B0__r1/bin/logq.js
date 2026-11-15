#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  let onlyFiles = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (onlyFiles || a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    if (a === '--') { onlyFiles = true; continue; }
    if (a === '--stats') { o.stats = true; continue; }
    const m = /^(--query|--agg|--format)(?:=([\s\S]*))?$/.exec(a);
    if (!m) throw new Error('unknown option ' + a);
    let v = m[2];
    if (v === undefined) {
      if (i + 1 >= argv.length) throw new Error('missing value for ' + m[1]);
      v = argv[++i];
    }
    o[m[1].slice(2)] = v;
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Error('invalid format ' + o.format);
  if (o.format === 'table' && o.agg === null && argv.some((a) => a === '--format' || a.startsWith('--format='))) {
    throw new Error('--format table requires --agg');
  }
  return o;
}

function table(res) {
  if (!Array.isArray(res.buckets)) return [String(res.value)];
  const keys = res.buckets.map((b) => String(b.key));
  const w = Math.max(3, ...keys.map((k) => k.length));
  const lines = ['key'.padEnd(w) + '  count'];
  res.buckets.forEach((b, i) => lines.push(keys[i].padEnd(w) + '  ' + b.count));
  return lines;
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    return usage(e.message);
  }
  let pred;
  try {
    pred = compile(o.query);
    if (o.agg !== null) aggregate([], o.agg);
  } catch (e) {
    process.stderr.write('logq: ' + e.message + '\n');
    process.exitCode = 2;
    return;
  }

  const sources = o.files.length ? o.files : ['-'];
  const texts = [];
  for (const f of sources) {
    try {
      texts.push(f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));
    } catch (e) {
      process.stderr.write('logq: cannot read ' + f + '\n');
      process.exitCode = 1;
      return;
    }
  }

  let lines = 0;
  let malformed = 0;
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
  if (o.agg === null) {
    for (const rec of matched) {
      const { '@t': _t, ...rest } = rec;
      out += JSON.stringify(rest) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res).join('\n') + '\n' : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
