#! /usr/bin/env node --unhandled-rejections=strict --enable-source-maps
import util from 'node:util';

import { Code, MongoClient } from './lib/index.js';

util.inspect.defaultOptions.depth = 1000;
const client = new MongoClient(process.env.MONGODB_URI);

async function main() {
  await client.connect();
  const collection = client.db('test_db').collection('test_collection');
  await collection.insertMany([{}]);

  const updateOne = {
    filter: { $where: new Code('function () { sleep(1 * 100); return true; }') },
    update: { $inc: { x: 1 } }
  };
  const fnRes = await collection.bulkWrite([{ updateOne }], { maxTimeMS: 4 }).then(
    res => ({ res }),
    err => ({ err })
  );
  console.log({ fnRes });
}

main(process.argv)
  .then(console.log)
  .catch(console.error)
  .finally(() => client.close());
// node --unhandled-rejections=strict --enable-source-maps script.js
