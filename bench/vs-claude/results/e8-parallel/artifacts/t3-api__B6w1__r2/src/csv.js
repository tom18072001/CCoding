'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
const FORMULA_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let s = String(value);
  if (s.length > 0 && FORMULA_CHARS.includes(s[0])) s = "'" + s;
  if (/[,"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  let out = '﻿' + COLUMNS.join(',') + '\r\n';
  for (const t of tasks || []) {
    out += COLUMNS.map((c) => escapeCell(t[c])).join(',') + '\r\n';
  }
  return out;
}

module.exports = { toCsv, escapeCell, COLUMNS };
