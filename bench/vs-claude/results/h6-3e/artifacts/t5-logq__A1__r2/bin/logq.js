#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse.js'));
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query.js'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg.js'));

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { query: '', agg: null, format: 'json', stats: false, files: [] };
  const valued = new Set(['--query', '--agg', '--format']);
  let i = 0;
  let rest = false;
  while (i < argv.length) {
    const a = argv[i++];
    if (rest || a === '-' || !a.startsWith('-')) { opts.files.push(a); continue; }
    if (a === '--') { rest = true; continue; }
    if (a === '--stats') { opts.stats = true; continue; }
    let name = a;
    let val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
    if (!valued.has(name)) throw new UsageError('unknown option: ' + a);
    if (val === undefined) {
      if (i >= argv.length) throw new UsageError('option ' + name + ' requires a value');
      val = argv[i++];
    }
    if (name === '--query') opts.query = val;
    else if (name === '--agg') opts.agg = val;
    else {
      if (val !== 'json' && val !== 'table') throw new UsageError('invalid format: ' + val);
      opts.format = val;
    }
  }
  if (opts.format === 'table' && opts.agg === null) throw new UsageError('--format table requires --agg');
  return opts;
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function splitLines(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function renderTable(result) {
  if (result.buckets) {
    const keys = result.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const out = ['key'.padEnd(w) + '  count'];
    result.buckets.forEach((b, i) => out.push(keys[i].padEnd(w) + '  ' + b.count));
    return out;
  }
  return [String(result.value)];
}

async function main() {
  let opts;
  let matcher;
  try {
    opts = parseArgs(process.argv.slice(2));
    matcher = compile(opts.query);
    if (opts.agg !== null) aggregate([], opts.agg);
  } catch (e) {
    if (e instanceof UsageError || e instanceof QuerySyntaxError || (e && /^invalid aggregation/.test(e.message))) {
      process.stderr.write(e.message + '\n');
      return 2;
    }
    throw e;
  }

  const files = opts.files.length ? opts.files : ['-'];
  let total = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    if (f === '-') {
      text = await readStdin();
    } else {
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch (e) {
        process.stderr.write('cannot read ' + f + '\n');
        return 1;
      }
    }
    for (const line of splitLines(text)) {
      total++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (matcher(r.record)) matched.push(r.record);
    }
  }

  const out = [];
  if (opts.agg === null) {
    for (const rec of matched) {
      const copy = {};
      for (const k of Object.keys(rec)) {
        if (k !== '@t') Object.defineProperty(copy, k, { value: rec[k], writable: true, enumerable: true, configurable: true });
      }
      out.push(JSON.stringify(copy));
    }
  } else {
    const result = aggregate(matched, opts.agg);
    if (opts.format === 'table') out.push(...renderTable(result));
    else out.push(JSON.stringify(result));
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (opts.stats) process.stderr.write('lines=' + total + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
  return 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  process.stderr.write(String(e && e.stack || e) + '\n');
  process.exitCode = 1;
});
