'use strict';

const VALID = ['B', 'KB', 'MB', 'GB'];

function isValidUnit(u) { return VALID.includes(String(u).toUpperCase()); }

module.exports = { isValidUnit };
