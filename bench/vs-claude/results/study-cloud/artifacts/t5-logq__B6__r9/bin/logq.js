#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src/index');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { query: null, agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '--agg' || a === '--format') {
      if (i + 1 >= argv.length) throw new Error(`usage: ${a} requires an argument`);
      const v = argv[++i];
      if (a === '--query') o.query = v;
      else if (a === '--agg') o.agg = v;
      else {
        if (v !== 'json' && v !== 'table') throw new Error(`usage: invalid --format ${v} (expected json or table)`);
        o.format = v;
      }
    } else if (a === '--stats') o.stats = true;
    else if (a === '-' || !a.startsWith('-')) o.files.push(a);
    else throw new Error(`usage: unknown option ${a}`);
  }
  if (o.format === 'table' && o.agg === null) throw new Error('usage: --format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function formatTable(r) {
  if (Array.isArray(r.buckets)) {
    const keys = r.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const out = ['key'.padEnd(w) + '  count'];
    r.buckets.forEach((b, i) => out.push(keys[i].padEnd(w) + '  ' + b.count));
    return out.join('\n') + '\n';
  }
  return String(r.value) + '\n';
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { return fail(2, e.message); }

  let matcher;
  try { matcher = compile(opts.query === null ? '' : opts.query); }
  catch (e) { return fail(2, e.message); }
  if (opts.agg !== null) {
    try { aggregate([], opts.agg); } catch (e) { return fail(2, e.message); }
  }

  const files = opts.files.length ? opts.files : ['-'];
  const texts = [];
  for (const f of files) {
    try { texts.push(fs.readFileSync(f === '-' ? 0 : f, 'utf8')); }
    catch (e) { return fail(1, `cannot read ${f}: ${e.message}`); }
  }

  let total = 0, malformed = 0;
  const matched = [];
  for (const t of texts) {
    for (const line of splitLines(t)) {
      total++;
      const p = parseLine(line);
      if (!p.ok) { malformed++; continue; }
      if (matcher(p.record)) matched.push(p.record);
    }
  }

  let out = '';
  if (opts.agg === null) {
    for (const r of matched) {
      const c = Object.assign({}, r);
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    let res;
    try { res = aggregate(matched, opts.agg); } catch (e) { return fail(2, e.message); }
    out = opts.format === 'table' ? formatTable(res) : JSON.stringify(res) + '\n';
  }
  if (opts.stats) process.stderr.write(`lines=${total} matched=${matched.length} malformed=${malformed}\n`);
  process.stdout.write(out);
}

main();
