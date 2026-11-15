#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate } = require(path.join(__dirname, '..', 'src'));

function fail(code, msg) {
  process.stderr.write(msg.replace(/\n?$/, '\n'));
  process.exitCode = code;
}

function main(argv) {
  let query = '';
  let agg = null;
  let format = null;
  let stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-') { files.push(a); continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(0, eq) : a;
      if (name === '--stats') {
        if (eq >= 0) return fail(2, `usage error: option ${name} takes no value`);
        stats = true;
        continue;
      }
      if (name === '--query' || name === '--agg' || name === '--format') {
        let val;
        if (eq >= 0) val = a.slice(eq + 1);
        else {
          if (i + 1 >= argv.length) return fail(2, `usage error: option ${name} requires a value`);
          val = argv[++i];
        }
        if (name === '--query') query = val;
        else if (name === '--agg') agg = val;
        else format = val;
        continue;
      }
    }
    if (a.startsWith('-')) return fail(2, `usage error: unknown option ${a}`);
    files.push(a);
  }
  if (format === null) format = 'json';
  if (format !== 'json' && format !== 'table') return fail(2, `usage error: invalid format ${format}`);
  if (format === 'table' && agg === null) return fail(2, 'usage error: --format table requires --agg');

  let pred;
  try {
    pred = compile(query);
    if (agg !== null) aggregate([], agg);
  } catch (e) {
    return fail(2, e.message);
  }

  const sources = [];
  if (files.length === 0) files.push('-');
  for (const f of files) {
    try {
      sources.push(f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));
    } catch (e) {
      return fail(1, `cannot read ${f}`);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const text of sources) {
    const arr = text.split('\n');
    if (arr[arr.length - 1] === '') arr.pop();
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
      const c = { ...rec };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const keys = res.buckets.map((b) => String(b.key));
      const w = Math.max(3, ...keys.map((k) => k.length));
      out = 'key'.padEnd(w) + '  count\n';
      res.buckets.forEach((b, i) => { out += keys[i].padEnd(w) + '  ' + b.count + '\n'; });
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
