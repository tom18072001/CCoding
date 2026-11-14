#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  let i = 0;
  const value = (name, inline) => {
    if (inline !== undefined) return inline;
    if (i + 1 >= argv.length) throw new UsageError('option ' + name + ' requires a value');
    i++;
    return argv[i];
  };
  let onlyFiles = false;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (onlyFiles || a === '-' || !a.startsWith('-')) { opts.files.push(a); continue; }
    if (a === '--') { onlyFiles = true; continue; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    if (name === '--query') opts.query = value(name, inline);
    else if (name === '--agg') opts.agg = value(name, inline);
    else if (name === '--format') {
      const f = value(name, inline);
      if (f !== 'json' && f !== 'table') throw new UsageError('invalid format: ' + f);
      opts.format = f;
    } else if (name === '--stats' && inline === undefined) opts.stats = true;
    else throw new UsageError('unknown option: ' + a);
  }
  if (opts.format === 'table' && opts.agg === undefined) {
    throw new UsageError('--format table requires --agg');
  }
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

function formatTable(result) {
  if (Array.isArray(result.buckets)) {
    const rows = result.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    const out = ['key'.padEnd(w) + '  count'];
    for (const [k, c] of rows) out.push(k.padEnd(w) + '  ' + c);
    return out.join('\n') + '\n';
  }
  return String(result.value) + '\n';
}

async function main() {
  let opts;
  let matcher = () => true;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.query !== undefined) matcher = compile(opts.query);
    if (opts.agg !== undefined) aggregate([], opts.agg);
  } catch (e) {
    if (e instanceof UsageError || e instanceof QuerySyntaxError || (e instanceof Error && e.message.startsWith('invalid aggregation'))) {
      process.stderr.write(e.message + '\n');
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  const sources = opts.files.length ? opts.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  let stdinUsed = false;
  for (const f of sources) {
    let text;
    if (f === '-') {
      text = stdinUsed ? '' : await readStdin();
      stdinUsed = true;
    } else {
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch (e) {
        process.stderr.write('cannot read ' + f + '\n');
        process.exitCode = 1;
        return;
      }
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (matcher(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (opts.agg === undefined) {
    for (const rec of matched) {
      const copy = {};
      for (const k of Object.keys(rec)) {
        if (k !== '@t') Object.defineProperty(copy, k, { value: rec[k], writable: true, enumerable: true, configurable: true });
      }
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const result = aggregate(matched, opts.agg);
    out = opts.format === 'table' ? formatTable(result) : JSON.stringify(result) + '\n';
  }
  process.stdout.write(out);
  if (opts.stats) {
    process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
  }
}

main().catch((e) => {
  process.stderr.write(String(e && e.stack || e) + '\n');
  process.exitCode = 1;
});
