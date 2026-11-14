#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine } = require('../src/parse');
const { compile } = require('../src/query');
const { aggregate } = require('../src/agg');

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
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

function main(argv) {
  let query, agg, format = 'json', stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== undefined) return usage('option --stats takes no value');
      stats = true;
    } else if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === undefined) {
        if (i + 1 >= argv.length) return usage('missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
    } else {
      return usage('unknown option ' + a);
    }
  }
  if (format !== 'json' && format !== 'table') return usage('invalid format ' + format);
  if (format === 'table' && agg === undefined) return usage('--format table requires --agg');

  let pred = () => true;
  if (query !== undefined) {
    try { pred = compile(query); } catch (e) {
      if (e && e.name === 'QuerySyntaxError') { process.stderr.write(e.message + '\n'); process.exitCode = 2; return; }
      throw e;
    }
  }
  if (agg !== undefined) {
    try { aggregate([], agg); } catch (e) {
      process.stderr.write(e.message + '\n'); process.exitCode = 2; return;
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  const sources = files.length ? files : ['-'];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? readStdin() : fs.readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write('cannot read ' + f + '\n');
      process.exitCode = 1;
      return;
    }
    const ls = text.split('\n');
    if (ls[ls.length - 1] === '') ls.pop();
    for (const l of ls) {
      lines++;
      const r = parseLine(l);
      if (!r.ok) { malformed++; continue; }
      if (pred(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === undefined) {
    for (const r of matched) {
      const c = { ...r };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
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
  if (out) process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
