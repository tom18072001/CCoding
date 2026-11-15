#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { parseLine } = require('../src/parse');
const { compile, QuerySyntaxError } = require('../src/query');
const { aggregate } = require('../src/agg');

const USAGE = 'usage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]';

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { query: '', agg: null, format: 'json', stats: false, files: [] };
  const needValue = (name, i) => {
    if (i + 1 >= argv.length) throw new UsageError('option ' + name + ' requires a value');
    return argv[i + 1];
  };
  let onlyFiles = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (onlyFiles || a === '-' || !a.startsWith('-')) { opts.files.push(a); continue; }
    if (a === '--') { onlyFiles = true; continue; }
    let name = a;
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); inline = a.slice(eq + 1); }
    if (name === '--stats' && inline === null) { opts.stats = true; continue; }
    if (name === '--query' || name === '--agg' || name === '--format') {
      let v;
      if (inline !== null) v = inline;
      else { v = needValue(name, i); i++; }
      if (name === '--query') opts.query = v;
      else if (name === '--agg') opts.agg = v;
      else opts.format = v;
      continue;
    }
    throw new UsageError('unknown option ' + a);
  }
  if (opts.format !== 'json' && opts.format !== 'table') throw new UsageError('invalid --format: ' + opts.format);
  if (opts.format === 'table' && opts.agg === null) throw new UsageError('--format table requires --agg');
  return opts;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    if (e && e.code === 'EOF') return '';
    throw e;
  }
}

function splitLines(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function formatTable(result) {
  if (result.buckets === undefined) return [String(result.value)];
  const keys = result.buckets.map((b) => String(b.key));
  const width = Math.max(3, ...keys.map((k) => k.length));
  const out = ['key'.padEnd(width) + '  count'];
  result.buckets.forEach((b, i) => out.push(keys[i].padEnd(width) + '  ' + b.count));
  return out;
}

function main(argv) {
  let opts;
  let match;
  try {
    opts = parseArgs(argv);
    match = compile(opts.query);
    if (opts.agg !== null) aggregate([], opts.agg); // validate the spec before reading input
  } catch (e) {
    if (e instanceof UsageError) process.stderr.write('logq: ' + e.message + '\n' + USAGE + '\n');
    else if (e instanceof QuerySyntaxError || (e && /^invalid aggregation/.test(e.message))) process.stderr.write('logq: ' + e.message + '\n');
    else throw e;
    return 2;
  }

  const sources = opts.files.length === 0 ? ['-'] : opts.files;
  const texts = [];
  for (const f of sources) {
    try {
      texts.push(f === '-' ? readStdin() : fs.readFileSync(f, 'utf8'));
    } catch (e) {
      process.stderr.write('logq: cannot read ' + f + '\n');
      return 1;
    }
  }

  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const text of texts) {
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  const out = [];
  if (opts.agg === null) {
    for (const rec of matched) {
      out.push(JSON.stringify(rec, function (k, v) { return this === rec && k === '@t' ? undefined : v; }));
    }
  } else {
    const result = aggregate(matched, opts.agg);
    if (opts.format === 'table') out.push(...formatTable(result));
    else out.push(JSON.stringify(result));
  }
  if (out.length > 0) process.stdout.write(out.join('\n') + '\n');
  if (opts.stats) process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
