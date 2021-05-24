'use strict';

const performance = require('perf_hooks').performance;
const PerformanceObserver = require('perf_hooks').PerformanceObserver;
const MongoClient = require('../../../index').MongoClient;

/**
 * # BulkWriteResult class Benchmark
 * This script can be used to reproduce a performance regression between 3.6.6...3.6.8
 * - [Changes to bulk/common.js](https://github.com/mongodb/node-mongodb-native/compare/v3.6.6...v3.6.8#diff-ab41c37a93c7b6e74f6d2dd30dec67a140f0a84562b4bd28d0ffc3b150c43600)
 * - [Changes to operations/bulk_write.js](https://github.com/mongodb/node-mongodb-native/compare/v3.6.6...v3.6.8#diff-93e45847ed36e2aead01a003826fd4057104d76cdeba4807adc1f76b573a87d8)
 *
 * ## Solution
 * A nested loop was introduced through the use of getters.
 * - Results running this script (modify the mongodb import) against v3.6.6
 *   - bulkWrite took `217.664902ms` to insert 10000 documents
 * - Results with performance regression:
 *   - bulkWrite took `1713.479087ms` to insert 10000 documents
 * - Results with nested loop removal and getter caching:
 *   - bulkWrite took `190.523483ms` to insert 10000 documents
 */

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost', {
  useUnifiedTopology: true
});

const DOC_COUNT = 10000;

const MANY_DOCS = new Array(DOC_COUNT).fill(null).map((_, index) => ({
  _id: `id is ${index}`
}));

const obs = new PerformanceObserver(items => {
  items.getEntries().forEach(entry => {
    console.log(`${entry.name} took ${entry.duration}ms to insert ${MANY_DOCS.length} documents`);
  });
});

obs.observe({ entryTypes: ['measure'], buffer: true });

async function main() {
  await client.connect();
  const collection = client.db('test').collection('test');

  try {
    await collection.drop();
  } catch (_) {
    // resetting collection if exists
  }

  performance.mark('bulkWrite-start');
  await collection.insertMany(MANY_DOCS);
  performance.mark('bulkWrite-end');

  performance.measure('bulkWrite', 'bulkWrite-start', 'bulkWrite-end');
}

main(process.argv)
  .catch(console.error)
  .finally(() => client.close());
