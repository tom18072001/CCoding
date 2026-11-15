#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function main(argv) {
  let query = '', agg = null, format = 'json', stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) return fail(2, 'usage error: missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
    } else if (a === '--stats' && inline === null) {
      stats = true;
    } else if (a === '-' || !a.startsWith('-')) {
      files.push(argv[i]);
    } else {
      return fail(2, 'usage error: unknown option ' + a);
    }
  }
  if (format !== 'json' && format !== 'table') return fail(2, 'usage error: invalid --format ' + format);
  if (format === 'table' && agg === null) return fail(2, 'usage error: --format table requires --agg');

  let matcher;
  try {
    matcher = compile(query);
    if (agg !== null) aggregate([], agg); // kiểm tra spec sớm
  } catch (e) {
    return fail(2, e.message);
  }

  const sources = [];
  if (files.length === 0) files.push('-');
  for (const f of files) {
    try {
      sources.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
    } catch (e) {
      return fail(1, 'cannot read ' + f);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const text of sources) {
    if (text === '') continue;
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (matcher(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === null) {
    for (const rec of matched) {
      const c = Object.assign({}, rec);
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') {
      out = JSON.stringify(res) + '\n';
    } else if (res.buckets) {
      const keys = res.buckets.map((b) => String(b.key));
      const w = Math.max(3, ...keys.map((k) => k.length));
      out = 'key'.padEnd(w) + '  count\n';
      res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
    } else {
      out = String(res.value) + '\n';
    }
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
