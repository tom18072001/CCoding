#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));
const { compile } = require(path.join(__dirname, '..', 'src', 'query'));
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

function die(code, msg) {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exitCode = code;
}

function usage(msg) {
  die(2, `logq: ${msg}\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]`);
}

function main(argv) {
  let query = null;
  let agg = null;
  let format = 'json';
  let stats = false;
  const files = [];
  const valued = ['--query', '--agg', '--format'];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { files.push(a); continue; }
    if (a === '--stats') { stats = true; continue; }
    let name = a;
    let val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
    if (!valued.includes(name)) return usage(`unknown option ${a}`);
    if (val === undefined) {
      if (i + 1 >= argv.length) return usage(`option ${name} requires a value`);
      val = argv[++i];
    }
    if (name === '--query') query = val;
    else if (name === '--agg') agg = val;
    else format = val;
  }
  if (format !== 'json' && format !== 'table') return usage(`invalid format ${format}`);
  if (format === 'table' && agg === null) return usage('--format table requires --agg');

  let match = () => true;
  if (query !== null) {
    try { match = compile(query); } catch (e) {
      if (e && e.name === 'QuerySyntaxError') return die(2, `logq: ${e.message}`);
      throw e;
    }
  }
  if (agg !== null) {
    try { aggregate([], agg); } catch (e) { return die(2, `logq: ${e.message}`); }
  }

  const sources = files.length ? files : ['-'];
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const f of sources) {
    let text;
    try { text = f === '-' ? readStdin() : fs.readFileSync(f, 'utf8'); } catch (e) {
      return die(1, `logq: cannot read ${f}`);
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
  if (agg === null) {
    for (const rec of matched) {
      const copy = { ...rec };
      delete copy['@t'];
      out += JSON.stringify(copy) + '\n';
    }
  } else {
    const res = aggregate(matched, agg);
    if (format === 'json') out = JSON.stringify(res) + '\n';
    else if (res.buckets) {
      const rows = res.buckets.map((b) => [String(b.key), String(b.count)]);
      const w = Math.max(3, ...rows.map((r) => r[0].length));
      out = `${'key'.padEnd(w)}  count\n`;
      for (const [k, c] of rows) out += `${k.padEnd(w)}  ${c}\n`;
    } else out = String(res.value) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n;
    try { n = fs.readSync(0, buf, 0, buf.length, null); } catch (e) {
      if (e.code === 'EAGAIN') continue;
      if (e.code === 'EOF') break;
      throw e;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

main(process.argv.slice(2));
