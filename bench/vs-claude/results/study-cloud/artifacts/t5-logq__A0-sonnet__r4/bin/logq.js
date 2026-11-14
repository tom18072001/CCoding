#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine } = require('../src/parse');
const { compile } = require('../src/query');
const { aggregate } = require('../src/agg');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function main(argv) {
  let query = null, agg = null, format = 'json', stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '--stats') {
      if (inline !== null) return fail(2, 'usage: --stats takes no value');
      stats = true;
    } else if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) return fail(2, 'usage: missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
    } else return fail(2, 'usage: unknown option ' + a);
  }
  if (format !== 'json' && format !== 'table') return fail(2, 'usage: --format must be json or table');
  if (format === 'table' && agg === null) return fail(2, 'usage: --format table requires --agg');

  let match;
  try {
    match = compile(query === null ? '' : query);
    if (agg !== null) aggregate([], agg); // validate spec
  } catch (e) {
    return fail(2, e.message);
  }

  const sources = files.length ? files : ['-'];
  const texts = [];
  for (const f of sources) {
    try {
      texts.push(f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));
    } catch (e) {
      if (f === '-' && e.code === 'EOF') { texts.push(''); continue; }
      return fail(1, 'cannot read ' + f);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const text of texts) {
    if (text === '') continue;
    const ls = text.split('\n');
    if (ls[ls.length - 1] === '') ls.pop();
    for (const line of ls) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (agg === null) {
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
      const w = Math.max(3, ...rows.map((x) => x[0].length));
      out = 'key'.padEnd(w) + '  count\n';
      for (const [k, c] of rows) out += k.padEnd(w) + '  ' + c + '\n';
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main(process.argv.slice(2));
