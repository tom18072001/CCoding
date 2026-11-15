#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function main(argv) {
  let query = '';
  let agg = null;
  let format = 'json';
  let stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    const value = () => {
      if (inline !== null) return inline;
      if (i + 1 >= argv.length) return undefined;
      return argv[++i];
    };
    if (a === '--query' || a === '--agg' || a === '--format') {
      const v = value();
      if (v === undefined) return usage('option ' + a + ' requires a value');
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
    } else if (a === '--stats') {
      if (inline !== null) return usage('unknown option ' + argv[i]);
      stats = true;
    } else if (a === '--') {
      files.push(...argv.slice(i + 1));
      break;
    } else if (a.startsWith('-') && a !== '-') {
      return usage('unknown option ' + argv[i]);
    } else {
      files.push(argv[i]);
    }
  }
  if (format !== 'json' && format !== 'table') return usage('invalid format: ' + format);
  if (format === 'table' && agg === null) return usage('--format table requires --agg');

  let pred;
  try {
    pred = compile(query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  if (agg !== null) {
    try {
      aggregate([], agg);
    } catch (e) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
  }

  const sources = files.length ? files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? readStdin() : fs.readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write('cannot read ' + f + '\n');
      process.exitCode = 1;
      return;
    }
    if (text === '') continue;
    const arr = text.split('\n');
    if (text.endsWith('\n')) arr.pop();
    for (const line of arr) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (pred(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === null) {
    for (const rec of matched) {
      const copy = {};
      for (const k of Object.keys(rec)) {
        if (k === '@t') continue;
        Object.defineProperty(copy, k, { value: rec[k], writable: true, enumerable: true, configurable: true });
      }
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
      const w = Math.max(3, ...rows.map((r) => r[0].length));
      out = 'key'.padEnd(w) + '  count\n';
      for (const [k, c] of rows) out += k.padEnd(w) + '  ' + c + '\n';
    } else {
      out = String(res.value) + '\n';
    }
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n;
    try {
      n = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      if (e.code === 'EOF') break;
      throw e;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

main(process.argv.slice(2));
