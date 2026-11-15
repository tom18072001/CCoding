#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { parseLine } = require('../src/parse');
const { compile } = require('../src/query');
const { aggregate, parseSpec } = require('../src/agg');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function main(argv) {
  let query = '';
  let agg;
  let format = 'json';
  let stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) fail(2, `missing value for ${a}`);
      const v = argv[++i];
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else {
        if (v !== 'json' && v !== 'table') fail(2, `invalid format: ${v}`);
        format = v;
      }
    } else if (a === '--stats') stats = true;
    else if (a.startsWith('--')) fail(2, `unknown option: ${a}`);
    else files.push(a);
  }
  let pred;
  try {
    pred = compile(query);
  } catch (e) {
    fail(2, e.message);
  }
  if (agg !== undefined) {
    try {
      parseSpec(agg);
    } catch (e) {
      fail(2, e.message);
    }
  } else if (format === 'table') fail(2, 'table format requires --agg');
  const inputs = files.length ? files : ['-'];
  const texts = [];
  for (const f of inputs) {
    try {
      texts.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
    } catch {
      fail(1, `cannot read ${f}`);
    }
  }
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const text of texts) {
    if (!text) continue;
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) {
        malformed++;
        continue;
      }
      if (pred(r.record)) matched.push(r.record);
    }
  }
  let out = '';
  if (agg === undefined) {
    for (const r of matched) {
      const { '@t': _t, ...rest } = r;
      out += JSON.stringify(rest) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
      out = 'key'.padEnd(w) + '  count\n' + res.buckets.map((b) => String(b.key).padEnd(w) + '  ' + b.count + '\n').join('');
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
