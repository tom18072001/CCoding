'use strict';
const { UNITS } = require('./units');

function isValidUnit(u) {
  return Object.prototype.hasOwnProperty.call(UNITS, String(u).toUpperCase());
}

module.exports = { isValidUnit };
