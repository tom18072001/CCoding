#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate } = require('../src');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { files: [], format: 'json', stats: false, query: null, agg: null };
  let i = 0;
  let rest = false;
  const val = (name, inline) => {
    if (inline !== undefined) return inline;
    if (i + 1 >= argv.length) throw new Error('usage: option ' + name + ' requires a value');
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
    else if (name === '--format') {
      o.format = val(name, inline);
      if (o.format !== 'json' && o.format !== 'table') throw new Error('usage: invalid --format ' + o.format);
    } else if (name === '--stats' && inline === undefined) o.stats = true;
    else throw new Error('usage: unknown option ' + a);
  }
  if (o.format === 'table' && o.agg === null) throw new Error('usage: --format table requires --agg');
  return o;
}

function readInput(f) {
  if (f === '-') {
    try { return fs.readFileSync(0, 'utf8'); } catch (e) {
      if (e.code === 'EOF' || e.code === 'EAGAIN') return '';
      throw e;
    }
  }
  return fs.readFileSync(f, 'utf8');
}

function table(res) {
  if (res.buckets === undefined) return [String(res.value)];
  const w = Math.max(3, ...res.buckets.map((b) => String(b.key).length));
  const lines = ['key'.padEnd(w) + '  count'];
  for (const b of res.buckets) lines.push(String(b.key).padEnd(w) + '  ' + b.count);
  return lines;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { return fail(2, e.message); }
  let match;
  try { match = compile(o.query === null ? '' : o.query); } catch (e) { return fail(2, e.message); }
  if (o.agg !== null) {
    try { aggregate([], o.agg); } catch (e) { return fail(2, e.message); }
  }
  const files = o.files.length ? o.files : ['-'];
  const contents = [];
  for (const f of files) {
    try { contents.push(readInput(f)); } catch (e) { return fail(1, 'cannot read ' + f + ': ' + e.message); }
  }
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const c of contents) {
    if (c === '') continue;
    const parts = c.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const line of parts) {
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
