#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

function fail(code, msg) {
  process.stderr.write(msg + '\n');
  process.exitCode = code;
}

function parseArgs(argv) {
  const o = { query: '', agg: null, format: 'json', stats: false, files: [] };
  let i = 0;
  const need = (name) => {
    if (i + 1 >= argv.length) throw new Error('usage: ' + name + ' requires a value');
    i += 1;
    return argv[i];
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.files.push(...argv.slice(i + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { o.files.push(a); continue; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : null;
    const val = () => (inline !== null ? inline : need(name));
    if (name === '--query') o.query = val();
    else if (name === '--agg') o.agg = val();
    else if (name === '--format') o.format = val();
    else if (name === '--stats' && inline === null) o.stats = true;
    else throw new Error('usage: unknown option ' + a);
  }
  if (o.format !== 'json' && o.format !== 'table') throw new Error('usage: --format must be json or table');
  if (o.format === 'table' && o.agg === null) throw new Error('usage: --format table requires --agg');
  return o;
}

function table(res) {
  if (res.buckets) {
    const keys = res.buckets.map((b) => String(b.key));
    const w = Math.max(3, ...keys.map((k) => k.length));
    const lines = ['key'.padEnd(w) + '  count'];
    res.buckets.forEach((b, idx) => lines.push(keys[idx].padEnd(w) + '  ' + b.count));
    return lines.join('\n') + '\n';
  }
  return String(res.value) + '\n';
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
  let stdinCache = null;
  const texts = [];
  for (const f of o.files.length ? o.files : ['-']) {
    try {
      if (f === '-') {
        if (stdinCache === null) {
          try { stdinCache = fs.readFileSync(0, 'utf8'); } catch (e) {
            if (e.code === 'EOF') stdinCache = ''; else throw e;
          }
        }
        texts.push(stdinCache);
      } else texts.push(fs.readFileSync(f, 'utf8'));
    } catch (e) { return fail(1, 'cannot read ' + f); }
  }
  let lines = 0;
  let malformed = 0;
  const matched = [];
  for (const text of texts) {
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
      const c = { ...rec };
      delete c['@t'];
      out += JSON.stringify(c) + '\n';
    }
  } else {
    const res = aggregate(matched, o.agg);
    out = o.format === 'table' ? table(res) : JSON.stringify(res) + '\n';
  }
  process.stdout.write(out);
  if (o.stats) process.stderr.write(`lines=${lines} matched=${matched.length} malformed=${malformed}\n`);
}

main();
