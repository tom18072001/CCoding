'use strict';

const { UNITS } = require('./units');

const VALID = Object.keys(UNITS);

function isValidUnit(u) { return VALID.includes(String(u).toUpperCase()); }

module.exports = { isValidUnit };
