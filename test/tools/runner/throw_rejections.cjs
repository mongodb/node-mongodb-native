/* eslint-disable no-console */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const process = require('process');

process.on('unhandledRejection', (error, promise) => {
  console.log('promise:', promise, 'unhandledRejection:', error);
  throw error;
});
