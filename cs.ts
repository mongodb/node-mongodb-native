import { promisify } from 'util';

import { MongoClient } from './src';

async function main() {
  const client = new MongoClient('');

  const cs = client.db('test').collection('test-collection').watch();

  cs.on('change', change => {
    if (change.operationType === 'insert') {
      console.log(Date.now(), change.operationType, change.fullDocument);
    } else if (change.operationType === 'delete') {
      console.log(Date.now(), change.operationType);
    }
  });

  //   while (true) {
  //     const { insertedId } = await client
  //       .db('test')
  //       .collection('test-collection')
  //       .insertOne({ name: 'bumpy' });
  //     await promisify(setTimeout)(2000);
  //     await client.db('test').collection('test-collection').deleteOne({ _id: insertedId });
  //     await promisify(setTimeout)(2000);
  //   }
}

main();
