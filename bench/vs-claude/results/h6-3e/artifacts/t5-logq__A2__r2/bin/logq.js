#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseLine, compile, aggregate } = require(path.join(__dirname, '..', 'src'));

function usage(msg) {
  process.stderr.write('logq: ' + msg + '\nusage: logq [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file ...]\n');
  process.exitCode = 2;
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks)));
  });
}

function splitLines(buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function renderTable(result) {
  if (result.buckets) {
    const rows = result.buckets.map((b) => [String(b.key), String(b.count)]);
    const width = Math.max(3, ...rows.map((r) => r[0].length));
    return ['key'.padEnd(width) + '  count'].concat(rows.map((r) => r[0].padEnd(width) + '  ' + r[1]));
  }
  return [String(result.value)];
}

async function main() {
  const argv = process.argv.slice(2);
  let query = null, agg = null, format = null, stats = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    if (a === '--query' || a === '--agg' || a === '--format') {
      let v;
      if (inline !== null) v = inline;
      else if (i + 1 < argv.length) v = argv[++i];
      else return usage('missing value for ' + a);
      if (a === '--query') query = v;
      else if (a === '--agg') agg = v;
      else format = v;
    } else if (a === '--stats' && inline === null) {
      stats = true;
    } else if (a === '--' && inline === null) {
      files.push(...argv.slice(i + 1));
      break;
    } else if (a === '-' || !a.startsWith('-')) {
      files.push(argv[i]);
    } else {
      return usage('unknown option ' + argv[i]);
    }
  }
  if (format !== null && format !== 'json' && format !== 'table') return usage('invalid format ' + format);
  if (format === 'table' && agg === null) return usage('--format table requires --agg');

  let matcher;
  try {
    matcher = compile(query === null ? '' : query);
    if (agg !== null) aggregate([], agg);
  } catch (e) {
    process.stderr.write('logq: ' + e.message + '\n');
    process.exitCode = 2;
    return;
  }

  const sources = [];
  let stdinUsed = false;
  if (files.length === 0) files.push('-');
  for (const f of files) {
    if (f === '-') {
      sources.push(stdinUsed ? Buffer.alloc(0) : await readStdin());
      stdinUsed = true;
    } else {
      try {
        sources.push(fs.readFileSync(f));
      } catch (e) {
        process.stderr.write('logq: cannot read ' + f + '\n');
        process.exitCode = 1;
        return;
      }
    }
  }

  let total = 0, malformed = 0;
  const matched = [];
  for (const buf of sources) {
    for (const line of splitLines(buf)) {
      total++;
      const r = parseLine(line);
      if (!r.ok) { malformed++; continue; }
      if (matcher(r.record)) matched.push(r.record);
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
    const result = aggregate(matched, agg);
    out = format === 'table' ? renderTable(result).join('\n') + '\n' : JSON.stringify(result) + '\n';
  }
  process.stdout.write(out);
  if (stats) process.stderr.write('lines=' + total + ' matched=' + matched.length + ' malformed=' + malformed + '\n');
}

main();
