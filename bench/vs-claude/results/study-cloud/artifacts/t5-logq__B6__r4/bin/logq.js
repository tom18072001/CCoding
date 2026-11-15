#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: null, stats: false, files: [] };
  let rest = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (rest || a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    if (a === '--') { rest = true; continue; }
    let name = a, val = null;
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    if (eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
    if (name === '--stats') {
      if (val !== null) usage(`option ${name} takes no value`);
      o.stats = true; continue;
    }
    if (name === '--query' || name === '-q' || name === '--agg' || name === '--format') {
      if (val === null) {
        if (i + 1 >= argv.length) usage(`missing value for ${name}`);
        val = argv[++i];
      }
      if (name === '--agg') o.agg = val;
      else if (name === '--format') o.format = val;
      else o.query = val;
      continue;
    }
    usage(`unknown option ${a}`);
  }
  if (o.format !== null && o.format !== 'json' && o.format !== 'table') usage(`invalid --format ${o.format}`);
  if (o.format === 'table' && o.agg === null) usage('--format table requires --agg');
  return o;
}

// Tách dòng bằng '\n'; '\n' cuối cùng không tạo thêm dòng rỗng.
function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function formatTable(res) {
  if (res.type === 'count_by' || res.type === 'top' || res.type === 'histogram') {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const out = [`${'key'.padEnd(w)}  count`];
    res.buckets.forEach((b, i) => out.push(`${keys[i].padEnd(w)}  ${b.count}`));
    return out.join('\n') + '\n';
  }
  return `${res.value === null || res.value === undefined ? 'null' : String(res.value)}\n`;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let match;
  try {
    match = compile(o.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError || (e && e.name === 'QuerySyntaxError')) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
  if (o.agg !== null) {
    try { aggregate([], o.agg); } catch (e) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exit(2);
    }
  }
  const files = o.files.length ? o.files : ['-'];
  let lines = 0, malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
    } catch (e) {
      if (f === '-') text = '';
      else {
        process.stderr.write(`logq: cannot read ${f}: ${e.code || e.message}\n`);
        process.exit(1);
      }
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r || !r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }
  let out = '';
  if (o.agg === null) {
    for (const rec of matched) {
      const { '@t': _t, ...rest } = rec;
      out += JSON.stringify(rest) + '\n';
    }
  } else {
    let res;
    try { res = aggregate(matched, o.agg); } catch (e) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exit(2);
    }
    out = o.format === 'table' ? formatTable(res) : JSON.stringify(res) + '\n';
  }
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  process.stdout.write(out);
}

main();
