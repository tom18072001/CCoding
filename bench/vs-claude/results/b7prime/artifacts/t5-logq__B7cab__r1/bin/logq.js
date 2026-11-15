#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine } = require('../src/parse');
const { compile, QuerySyntaxError } = require('../src/query');
const { aggregate } = require('../src/agg');

function fail(code, msg) {
  process.stderr.write('logq: ' + msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  const withValue = ['--query', '--agg', '--format'];
  let i = 0;
  let rest = false;
  while (i < argv.length) {
    const a = argv[i++];
    if (rest || a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    if (a === '--') { rest = true; continue; }
    if (a === '--stats') { o.stats = true; continue; }
    let name = a;
    let val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
    if (!withValue.includes(name)) throw new Error('unknown option ' + a);
    if (val === undefined) {
      if (i >= argv.length) throw new Error('missing value for ' + name);
      val = argv[i++];
    }
    o[name.slice(2)] = val;
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Error('invalid --format ' + o.format);
  if (o.format === 'table' && o.agg === null) throw new Error('--format table requires --agg');
  return o;
}

function formatTable(res) {
  if (!Array.isArray(res.buckets)) return [String(res.value)];
  const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
  const w = Math.max(3, ...rows.map((r) => r[0].length));
  return ['key'.padEnd(w) + '  count', ...rows.map((r) => r[0].padEnd(w) + '  ' + r[1])];
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { return fail(2, e.message); }
  let match;
  try { match = compile(o.query); } catch (e) {
    if (e instanceof QuerySyntaxError) return fail(2, e.message);
    throw e;
  }
  if (o.agg !== null) {
    try { aggregate([], o.agg); } catch (e) { return fail(2, e.message); }
  }
  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f === '-' ? 0 : f, 'utf8'); } catch (e) {
      return fail(1, 'cannot read ' + f);
    }
    if (text === '') continue;
    const parts = text.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }
  let out = '';
  if (o.agg === null) {
    for (const rec of matched) {
      const copy = { ...rec };
      delete copy['@t'];
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = (o.format === 'table' ? formatTable(res).join('\n') : JSON.stringify(res)) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
