import os from 'os';
import { readFileSync } from 'fs';
import { MongoClient, ObjectId } from 'mongodb';

async function main() {
  const testCluster = 'mongodb+srv://...';
  const client = new MongoClient(testCluster);
  try {
    await client.connect();

    const buildInfo = await client.db('admin').command({ buildInfo: 1 });
    const { version: driverVersion } = JSON.parse(
      readFileSync(new URL('./node_modules/mongodb/package.json', import.meta.url), 'utf8')
    );

    console.log('Node.js version:   ', process.version);
    console.log('Driver version:    ', driverVersion);
    console.log('Server version:    ', buildInfo.version);
    console.log('OS:                ', `${os.type()} ${os.release()} (${os.arch()})`);
    console.log('---');

    // Basic read smoke test (cluster user has read-only access)
    const doc = await client
      .db('sample_mflix')
      .collection('movies')
      .findOne({ _id: new ObjectId('573a1390f29313caabcd42e8') });
    if (doc?.title !== 'The Great Train Robbery')
      throw new Error(`Unexpected title: ${doc?.title}`);
    console.log('Read smoke test:   PASS');
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
