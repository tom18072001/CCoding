#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src/index.js');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stats') o.stats = true;
    else if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) fail(2, `usage error: missing value for ${a}`);
      o[a.slice(2)] = argv[++i];
    } else if (a === '-' || !a.startsWith('-')) o.files.push(a);
    else fail(2, `usage error: unknown option ${a}`);
  }
  if (o.format !== 'json' && o.format !== 'table') fail(2, `usage error: invalid --format ${o.format}`);
  if (o.format === 'table' && o.agg === undefined) fail(2, 'usage error: --format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function formatTable(res) {
  if (res.buckets) {
    const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
    const rows = ['key'.padEnd(w) + '  count'];
    for (const b of res.buckets) rows.push(String(b.key).padEnd(w) + '  ' + b.count);
    return rows.join('\n') + '\n';
  }
  return String(res.value) + '\n';
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let match;
  try {
    match = compile(o.query === undefined ? '' : o.query);
    if (o.agg !== undefined) aggregate([], o.agg);
  } catch (e) {
    fail(2, e && e.message ? e.message : String(e));
  }

  const sources = o.files.length ? o.files : ['-'];
  const texts = [];
  for (const f of sources) {
    try {
      texts.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
    } catch (e) {
      fail(1, `cannot read ${f}`);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const t of texts) {
    for (const line of splitLines(t)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (o.agg === undefined) {
    for (const rec of matched) {
      const c = { ...rec };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    let res;
    try {
      res = aggregate(matched, o.agg);
    } catch (e) {
      fail(2, e && e.message ? e.message : String(e));
    }
    out = o.format === 'table' ? formatTable(res) : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
