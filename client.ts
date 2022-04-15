import { MongoClient } from './src';

async function main() {
  const client = new MongoClient('mongodb://bob:pwd123@localhost:27017/?', {
    heartbeatFrequencyMS: 500
  });

  await client.connect();
}

main();
