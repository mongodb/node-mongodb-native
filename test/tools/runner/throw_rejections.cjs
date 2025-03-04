// eslint-disable-next-line @typescript-eslint/no-require-imports
const process = require('process');

process.on('unhandledRejection', error => {
  throw error;
});
