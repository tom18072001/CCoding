#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    const val = () => {
      if (inline !== null) return inline;
      if (i + 1 >= argv.length) throw new Error('missing value for ' + a);
      i++;
      return argv[i];
    };
    if (a === '--query') o.query = val();
    else if (a === '--agg') o.agg = val();
    else if (a === '--format') {
      o.format = val();
      if (o.format !== 'json' && o.format !== 'table') throw new Error('invalid format: ' + o.format);
    } else if (a === '--stats' && inline === null) o.stats = true;
    else if (a === '-' || !a.startsWith('-')) o.files.push(argv[i]);
    else throw new Error('unknown option: ' + a);
  }
  if (o.format === 'table' && o.agg === null) throw new Error('--format table requires --agg');
  return o;
}

function table(res) {
  if (res.buckets) {
    const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    return ['key'.padEnd(w) + '  count', ...rows.map((r) => r[0].padEnd(w) + '  ' + r[1])];
  }
  return [String(res.value)];
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    return usage(e.message);
  }
  let match;
  try {
    match = compile(o.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  if (o.agg !== null) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
  }
  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
    } catch (e) {
      process.stderr.write('cannot read ' + f + '\n');
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
  if (o.agg === null) {
    for (const rec of matched) {
      const c = Object.assign({}, rec);
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res).join('\n') + '\n' : JSON.stringify(res) + '\n';
  }
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  process.stdout.write(out);
}

main();
