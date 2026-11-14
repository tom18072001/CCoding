#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\n');
  process.exitCode = 2;
}

function main(argv) {
  let query = null;
  let agg = null;
  let format = 'json';
  let stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (name === '--query' || name === '--agg' || name === '--format') {
      let val;
      if (eq > 0) val = a.slice(eq + 1);
      else {
        if (i + 1 >= argv.length) return usage('missing value for ' + name);
        val = argv[++i];
      }
      if (name === '--query') query = val;
      else if (name === '--agg') agg = val;
      else format = val;
    } else if (a === '--stats') stats = true;
    else if (a !== '-' && a.startsWith('-')) return usage('unknown option ' + a);
    else files.push(a);
  }
  if (format !== 'json' && format !== 'table') return usage('invalid --format ' + format);
  if (format === 'table' && agg === null) return usage('--format table requires --agg');

  let match = () => true;
  if (query !== null) {
    try { match = compile(query); } catch (e) {
      if (e && e.name === 'QuerySyntaxError') return usage(e.message);
      throw e;
    }
  }
  if (agg !== null) {
    try { aggregate([], agg); } catch (e) { return usage(e.message); }
  }

  const sources = files.length ? files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      if (f === '-' && e.code === 'EOF') text = '';
      else {
        process.stderr.write('logq: cannot read ' + f + '\n');
        process.exitCode = 1;
        return;
      }
    }
    const arr = text.split('\n');
    if (arr[arr.length - 1] === '') arr.pop();
    for (const line of arr) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
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
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
      const w = Math.max(3, ...rows.map((r) => r[0].length));
      out = 'key'.padEnd(w) + '  count\n';
      for (const r of rows) out += r[0].padEnd(w) + '  ' + r[1] + '\n';
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
