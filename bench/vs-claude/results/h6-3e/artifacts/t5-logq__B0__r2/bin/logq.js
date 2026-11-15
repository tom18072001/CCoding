#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
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
    if (onlyFiles || a === '-' || !a.startsWith('-')) {
      o.files.push(a);
      continue;
    }
    if (a === '--') {
      onlyFiles = true;
      continue;
    }
    if (a === '--stats') {
      o.stats = true;
      continue;
    }
    let name = a;
    let val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) {
      name = a.slice(0, eq);
      val = a.slice(eq + 1);
    }
    if (name === '--query' || name === '--agg' || name === '--format') {
      if (val === undefined) {
        if (i + 1 >= argv.length) throw new Error('missing value for ' + name);
        val = argv[++i];
      }
      if (name === '--query') o.query = val;
      else if (name === '--agg') o.agg = val;
      else o.format = val;
    } else {
      throw new Error('unknown option ' + a);
    }
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Error('invalid format ' + o.format);
  if (o.format === 'table' && o.agg === null) throw new Error('--format table requires --agg');
  return o;
}

function formatTable(res) {
  if (!Array.isArray(res.buckets)) return [String(res.value)];
  const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
  const w = Math.max(3, ...rows.map((r) => r[0].length));
  return ['key'.padEnd(w) + '  count', ...rows.map((r) => r[0].padEnd(w) + '  ' + r[1])];
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
    process.stderr.write('logq: ' + e.message + '\n');
    process.exitCode = 2;
    return;
  }
  if (o.agg !== null) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      process.stderr.write('logq: ' + e.message + '\n');
      process.exitCode = 2;
      return;
    }
  }

  const sources = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      if (f === '-' && e && e.code === 'EAGAIN') text = '';
      else if (f === '-' && e && e.code === 'EOF') text = '';
      else {
        process.stderr.write('logq: cannot read ' + f + '\n');
        process.exitCode = 1;
        return;
      }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text === '') continue;
    const arr = text.split('\n');
    if (arr[arr.length - 1] === '') arr.pop();
    for (const line of arr) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) {
        malformed++;
        continue;
      }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (o.agg === null) {
    for (const rec of matched) {
      const copy = Object.assign({}, rec);
      delete copy['@t'];
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = (o.format === 'table' ? formatTable(res) : [JSON.stringify(res)]).join('\n') + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
}

main();
