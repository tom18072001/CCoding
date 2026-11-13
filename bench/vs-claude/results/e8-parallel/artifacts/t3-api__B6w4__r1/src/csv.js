'use strict';

const HEADER = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(items) {
  let out = '﻿' + HEADER.join(',') + '\r\n';
  for (const t of items) out += HEADER.map((k) => cell(t[k])).join(',') + '\r\n';
  return out;
}

module.exports = { toCsv };
