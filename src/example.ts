import { MongoClient } from './index';
import { Collection } from './collection';

(async () => {
  console.log('running');

  const client = new MongoClient('mongodb://127.0.0.1');

  await client.connect();

  console.log('connected');

  const db = client.db('test');

  const collection = db.collection('test');
  if (!(collection instanceof Collection)) throw new Error();

  const results = await collection.insertOne({ name: 'thomas' });

  console.log(results.result.n);
  // console.log(results.result.n);
  // console.log(results.result.ok);
  // console.log(results.connection);
  // console.log(results.connection);
  client.close();
})();
