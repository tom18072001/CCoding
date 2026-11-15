#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

function usage(msg) {
  process.stderr.write(`logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    if (a === '--stats') { o.stats = true; continue; }
    if (a !== '--query' && a !== '--agg' && a !== '--format') return { error: `unknown option ${a}` };
    if (i + 1 >= argv.length) return { error: `missing value for ${a}` };
    o[a.slice(2)] = argv[++i];
  }
  if (o.format !== 'json' && o.format !== 'table') return { error: `invalid format ${o.format}` };
  if (o.format === 'table' && o.agg === null) return { error: '--format table requires --agg' };
  return { opts: o };
}

function table(res) {
  if (!res.buckets) return [String(res.value)];
  const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
  const w = Math.max(3, ...rows.map((r) => r[0].length));
  return [`${'key'.padEnd(w)}  count`, ...rows.map((r) => `${r[0].padEnd(w)}  ${r[1]}`)];
}

function readSource(f) {
  const buf = f === '-' ? fs.readFileSync(0) : fs.readFileSync(f);
  return buf.toString('utf8');
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) return usage(parsed.error);
  const o = parsed.opts;

  let match;
  try {
    match = compile(o.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  if (o.agg !== null) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = readSource(f);
    } catch (e) {
      if (f === '-' && e && e.code === 'EOF') text = '';
      else {
        process.stderr.write(`logq: cannot read ${f}\n`);
        process.exitCode = 1;
        return;
      }
    }
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out;
  if (o.agg === null) {
    out = matched.map((r) => {
      const c = { ...r };
      delete c['@t'];
      return JSON.stringify(c);
    });
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : [JSON.stringify(res)];
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
