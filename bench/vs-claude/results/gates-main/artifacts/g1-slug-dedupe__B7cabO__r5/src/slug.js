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
  return Array.from(titles, (t) => {
    const base = slugify(t) || 'untitled';
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = base + '-' + n;
    used.add(slug);
    return slug;
  });
}

module.exports = { slugify, uniqueSlugs };
