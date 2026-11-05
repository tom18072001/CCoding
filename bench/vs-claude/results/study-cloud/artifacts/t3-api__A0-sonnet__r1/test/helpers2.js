'use strict';
const { start } = require('./helpers');
const U = (id) => ({ 'x-user': id });
module.exports = { start, U };
