#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require(path.join(__dirname, '..', 'src'));

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  let i = 0;
  let rest = false;
  const val = (name, inline) => {
    if (inline !== undefined) return inline;
    if (i + 1 >= argv.length) throw new UsageError('option ' + name + ' requires a value');
    return argv[++i];
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (rest || a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    if (a === '--') { rest = true; continue; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    if (name === '--query') o.query = val(name, inline);
    else if (name === '--agg') o.agg = val(name, inline);
    else if (name === '--format') o.format = val(name, inline);
    else if (name === '--stats' && inline === undefined) o.stats = true;
    else throw new UsageError('unknown option ' + a);
  }
  if (o.format !== 'json' && o.format !== 'table') throw new UsageError('invalid --format: ' + o.format);
  if (o.format === 'table' && o.agg === null) throw new UsageError('--format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function table(res) {
  if (res.buckets) {
    const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
    const w = Math.max(3, ...rows.map((r) => r[0].length));
    const out = ['key'.padEnd(w) + '  count'];
    for (const r of rows) out.push(r[0].padEnd(w) + '  ' + r[1]);
    return out;
  }
  return [String(res.value)];
}

function main() {
  let o;
  let pred;
  try {
    o = parseArgs(process.argv.slice(2));
    pred = compile(o.query);
    if (o.agg !== null) aggregate([], o.agg); // kiểm tra spec trước khi đọc tệp
  } catch (e) {
    if (e instanceof UsageError || e instanceof QuerySyntaxError || /^invalid aggregation/.test(e.message)) {
      process.stderr.write((e instanceof UsageError ? 'logq: ' : '') + e.message + '\n');
      return 2;
    }
    throw e;
  }

  const files = o.files.length ? o.files : ['-'];
  const texts = [];
  for (const f of files) {
    try {
      texts.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
    } catch (e) {
      process.stderr.write('logq: cannot read ' + f + ': ' + e.message + '\n');
      return 1;
    }
  }

  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const t of texts) {
    for (const line of splitLines(t)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (pred(r.record)) matched.push(r.record);
    }
  }

  let out = [];
  if (o.agg === null) {
    for (const rec of matched) {
      const c = Object.assign({}, rec);
      delete c['@t'];
      out.push(JSON.stringify(c));
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : [JSON.stringify(res)];
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (o.stats) process.stderr.write('lines=' + lines + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
  return 0;
}

process.exitCode = main();
