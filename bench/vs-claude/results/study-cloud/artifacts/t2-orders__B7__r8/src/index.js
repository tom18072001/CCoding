'use strict';
module.exports = {
  ...require('./money'),
  ...require('./catalog'),
  ...require('./inventory'),
  ...require('./promotions'),
  ...require('./tax'),
  ...require('./cart'),
  ...require('./checkout'),
};
