'use strict';
const { createServer } = require('./server');
const port = Number(process.env.PORT || 3000);
createServer().listen(port, () => console.log(`task-tracker-api: http://127.0.0.1:${port}`));
