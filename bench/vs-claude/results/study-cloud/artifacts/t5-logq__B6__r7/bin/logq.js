#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate } = require(path.join(__dirname, '..', 'src', 'index'));

function fail(code, msg) {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { query: undefined, agg: undefined, format: 'json', stats: false, files: [] };
  const valued = ['--query', '--agg', '--format'];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    if (valued.includes(a)) {
      let v = inline;
      if (v === undefined) {
        if (i + 1 >= argv.length) throw new Error(`usage: missing value for ${a}`);
        v = argv[++i];
      }
      o[a.slice(2)] = v;
    } else if (a === '--stats' && inline === undefined) {
      o.stats = true;
    } else if (a === '-') {
      o.files.push(a);
    } else if (a.startsWith('-') && a.length > 1) {
      throw new Error(`usage: unknown option ${a}`);
    } else {
      o.files.push(a);
    }
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Error(`usage: invalid --format ${o.format} (json|table)`);
  if (o.format === 'table' && o.agg === undefined) throw new Error('usage: --format table requires --agg');
  return o;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function renderTable(res) {
  if (res.type === 'count_by' || res.type === 'top' || res.type === 'histogram') {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const out = ['key'.padEnd(w) + '  count'];
    res.buckets.forEach((b, i) => out.push(keys[i].padEnd(w) + '  ' + b.count));
    return out.join('\n') + '\n';
  }
  return String(res.value === undefined ? null : res.value) + '\n';
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { return fail(2, e.message); }

  let match = () => true;
  if (o.query !== undefined) {
    try { match = compile(o.query); } catch (e) { return fail(2, e.message); }
  }
  if (o.agg !== undefined) {
    try { aggregate([], o.agg); } catch (e) { return fail(2, e.message); }
  }

  const files = o.files.length ? o.files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
    } catch (e) {
      if (f === '-') text = '';
      else return fail(1, `cannot read ${f}: ${e.message}`);
    }
    for (const line of splitLines(text)) {
      lines++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (match(r.record)) matched.push(r.record);
    }
  }

  let out = '';
  if (o.agg === undefined) {
    for (const rec of matched) {
      const { '@t': _t, ...rest } = rec;
      out += JSON.stringify(rest) + '\n';
    }
  } else {
    let res;
    try { res = aggregate(matched, o.agg); } catch (e) { return fail(2, e.message); }
    out = o.format === 'table' ? renderTable(res) : JSON.stringify(res) + '\n';
  }
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
  process.stdout.write(out);
}

main();
