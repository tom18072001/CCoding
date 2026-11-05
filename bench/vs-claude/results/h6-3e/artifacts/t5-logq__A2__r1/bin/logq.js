#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile, QuerySyntaxError } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

const USAGE = 'usage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]';

function usageError(msg) {
  process.stderr.write(`logq: ${msg}\n${USAGE}\n`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const opts = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-')) {
      opts.files.push(a);
      continue;
    }
    let name = a;
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) {
      name = a.slice(0, eq);
      inline = a.slice(eq + 1);
    }
    if (name === '--stats') {
      if (inline !== null) return { error: `option ${name} takes no value` };
      opts.stats = true;
    } else if (name === '--query' || name === '--agg' || name === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) return { error: `option ${name} requires a value` };
        v = argv[++i];
      }
      if (name === '--query') opts.query = v;
      else if (name === '--agg') opts.agg = v;
      else {
        if (v !== 'json' && v !== 'table') return { error: `invalid format: ${v}` };
        opts.format = v;
        opts.formatGiven = true;
      }
    } else {
      return { error: `unknown option: ${a}` };
    }
  }
  return { opts };
}

function formatTable(result) {
  if (result.buckets) {
    const rows = result.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    const lines = ['key'.padEnd(w) + '  count'];
    for (const [k, c] of rows) lines.push(k.padEnd(w) + '  ' + c);
    return lines;
  }
  return [String(result.value)];
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) return usageError(parsed.error);
  const opts = parsed.opts;

  if (opts.agg === null && opts.format === 'table') {
    return usageError('--format table requires --agg');
  }
  let match;
  try {
    match = compile(opts.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  if (opts.agg !== null) {
    try {
      aggregate([], opts.agg);
    } catch (e) {
      process.stderr.write(`logq: ${e.message}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const files = opts.files.length ? opts.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write(`logq: cannot read ${f}\n`);
      process.exitCode = 1;
      return;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) {
        malformed++;
        continue;
      }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out;
  if (opts.agg === null) {
    out = matched.map((rec) => {
      const copy = Object.assign({}, rec);
      delete copy['@t'];
      return JSON.stringify(copy);
    });
  } else {
    const result = aggregate(matched, opts.agg);
    out = opts.format === 'table' ? formatTable(result) : [JSON.stringify(result)];
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (opts.stats) {
    process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  }
}

main();
