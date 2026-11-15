#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate } = require(path.join(__dirname, '..', 'src', 'index.js'));

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const opts = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stats') { opts.stats = true; continue; }
    if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) throw new Error('usage: missing value for ' + a);
      const v = argv[++i];
      if (a === '--query') opts.query = v;
      else if (a === '--agg') opts.agg = v;
      else opts.format = v;
      continue;
    }
    if (a !== '-' && a.startsWith('-')) throw new Error('usage: unknown option ' + a);
    opts.files.push(a);
  }
  if (opts.format !== 'json' && opts.format !== 'table') {
    throw new Error('usage: --format must be json or table');
  }
  if (opts.format === 'table' && opts.agg === null) {
    throw new Error('usage: --format table requires --agg');
  }
  return opts;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function renderTable(res) {
  if (res.buckets) {
    const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    const out = ['key'.padEnd(w) + '  count'];
    for (const [k, c] of rows) out.push(k.padEnd(w) + '  ' + c);
    return out.join('\n') + '\n';
  }
  return String(res.value === undefined ? null : res.value) + '\n';
}

function main() {
  let opts, matcher;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    return fail(2, e.message);
  }
  try {
    matcher = compile(opts.query);
  } catch (e) {
    return fail(2, e.message);
  }
  if (opts.agg !== null) {
    try { aggregate([], opts.agg); } catch (e) { return fail(2, e.message); }
  }

  const sources = opts.files.length ? opts.files : ['-'];
  const matched = [];
  let lines = 0, malformed = 0;
  for (const f of sources) {
    let text;
    try {
      text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
    } catch (e) {
      return fail(1, 'cannot read ' + f);
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (matcher(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (opts.agg === null) {
    for (const rec of matched) {
      const rest = Object.assign({}, rec);
      delete rest['@t'];
      out += JSON.stringify(rest) + '\n';
    }
  } else {
    let res;
    try { res = aggregate(matched, opts.agg); } catch (e) { return fail(2, e.message); }
    out = opts.format === 'table' ? renderTable(res) : JSON.stringify(res) + '\n';
  }
  if (opts.stats) {
    process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  }
  process.stdout.write(out);
}

main();
