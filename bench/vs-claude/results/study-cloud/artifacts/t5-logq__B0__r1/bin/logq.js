#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stats') o.stats = true;
    else if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) throw new UsageError(`missing value for ${a}`);
      const v = argv[++i];
      if (a === '--query') o.query = v;
      else if (a === '--agg') o.agg = v;
      else {
        if (v !== 'json' && v !== 'table') throw new UsageError(`invalid format: ${v}`);
        o.format = v;
      }
    } else if (a !== '-' && a.startsWith('-')) throw new UsageError(`unknown option: ${a}`);
    else o.files.push(a);
  }
  if (o.agg === null && o.format === 'table') throw new UsageError('--format table requires --agg');
  return o;
}

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    if (e.code === 'EOF') return '';
    throw e;
  }
}

function splitLines(text) {
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
    return out.join('\n');
  }
  return result.value === null ? 'null' : String(result.value);
}

function main() {
  let opts, match;
  try {
    opts = parseArgs(process.argv.slice(2));
    match = compile(opts.query);
    if (opts.agg !== null) aggregate([], opts.agg);
  } catch (e) {
    if (e instanceof UsageError || e instanceof QuerySyntaxError || e.name === 'QuerySyntaxError' ||
        /^invalid aggregation/.test(e.message)) return fail(2, e.message);
    throw e;
  }

  const texts = [];
  const files = opts.files.length ? opts.files : ['-'];
  for (const f of files) {
    try {
      texts.push(f === '-' ? readStdin() : fs.readFileSync(f, 'utf8'));
    } catch (e) {
      return fail(1, `cannot read ${f === '-' ? 'stdin' : f}`);
    }
  }

  let lines = 0, malformed = 0;
  const matched = [];
  for (const t of texts) {
    for (const line of splitLines(t)) {
      lines++;
      const p = parseLine(line);
      if (!p.ok) { malformed++; continue; }
      if (match(p.record)) matched.push(p.record);
    }
  }

  let out;
  if (opts.agg === null) {
    out = matched.map((r) => {
      const c = { ...r };
      delete c['@t'];
      return JSON.stringify(c) + '\n';
    }).join('');
  } else {
    const res = aggregate(matched, opts.agg);
    out = (opts.format === 'table' ? formatTable(res) : JSON.stringify(res)) + '\n';
  }
  if (out) process.stdout.write(out);
  if (opts.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
