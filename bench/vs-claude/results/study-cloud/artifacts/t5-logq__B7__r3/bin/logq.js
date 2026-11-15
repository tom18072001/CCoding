#!/usr/bin/env node
'use strict';
const fs = require('fs');
const root = require('path').dirname(__dirname);
const { parseLine } = require(root + '/src/parse');
const { compile, QuerySyntaxError } = require(root + '/src/query');
const { aggregate } = require(root + '/src/agg');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    if (a === '--stats' && inline === null) { o.stats = true; continue; }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v = inline;
      if (v === null) {
        if (i + 1 >= argv.length) throw new Error('usage: missing value for ' + a);
        v = argv[++i];
      }
      if (a === '--query') o.query = v;
      else if (a === '--agg') o.agg = v;
      else {
        if (v !== 'json' && v !== 'table') throw new Error('usage: invalid --format ' + v);
        o.format = v;
      }
      continue;
    }
    if (a === '-' || !a.startsWith('-')) { o.files.push(argv[i]); continue; }
    throw new Error('usage: unknown option ' + a);
  }
  return o;
}

function table(res) {
  if (!Array.isArray(res.buckets)) return [String(res.value)];
  const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
  return ['key'.padEnd(w) + '  count', ...res.buckets.map((b) => String(b.key).padEnd(w) + '  ' + b.count)];
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    return fail(2, e.message);
  }
  if (o.format === 'table' && o.agg === null) return fail(2, 'usage: --format table requires --agg');
  let match;
  try {
    match = compile(o.query);
  } catch (e) {
    if (e instanceof QuerySyntaxError) return fail(2, e.message);
    throw e;
  }
  if (o.agg !== null) {
    try {
      aggregate([], o.agg);
    } catch (e) {
      return fail(2, e.message);
    }
  }
  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      return fail(1, 'cannot read ' + f);
    }
    const ls = text.split('\n');
    if (ls[ls.length - 1] === '') ls.pop();
    for (const line of ls) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }
  let out = [];
  if (o.agg === null) {
    for (const r of matched) {
      const c = { ...r };
      delete c['@t'];
      out.push(JSON.stringify(c));
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : [JSON.stringify(res)];
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
