'use strict';

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlugs(titles) {
  const used = new Set();
  return titles.map((t) => {
    const base = slugify(t) || 'untitled';
    let s = base;
    for (let n = 2; used.has(s); n++) s = base + '-' + n;
    used.add(s);
    return s;
  });
}

module.exports = { slugify, uniqueSlugs };
