const totalStart = performance.now();
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const process = require('node:process');
const { MongoClient } = require('./lib/index.js');
const { ModernConnection } = require('./lib/cmap/connection.js');

const tweet = require('./test/benchmarks/driverBench/spec/single_and_multi_document/tweet.json');

const client = new MongoClient(process.env.MONGODB_URI, { connectionType: ModernConnection });

async function main() {
  console.log('modern connection');

  const db = client.db('test');
  let collection = db.collection('test');
  await collection.drop().catch(() => null);
  collection = await db.createCollection('test');
  await collection.insertOne(tweet);

  const total = 10_000;

  for (let i = 0; i < total; i++) {
    await collection.findOne();
  }

  const start = performance.now() - totalStart;
  for (let i = 0; i < total; i++) {
    await collection.findOne();
  }
  const end = performance.now() - totalStart;

  console.log(
    `end - start = ms time for 10k findOne calls (script boot: ${totalStart.toFixed(3)})`
  );
  console.log(`${end.toFixed(3)} - ${start.toFixed(3)} = ${(end - start).toFixed(4)}`);
  console.log(`avg findOne: ${((end - start) / total).toFixed(3)} ms`);

  await client.close();
}

main().catch(console.error);
