import * as fs from 'fs/promises';

import { MongoClient } from './lib/index.js';

const client = await MongoClient.connect('mongodb://localhost/');
const cursor = client.db('test').aggregate([
  {
    $documents: [
      JSON.parse(
        await fs.readFile(
          'test/benchmarks/driverBench/spec/single_and_multi_document/tweet.json',
          'utf8'
        )
      )
    ]
  },
  {
    $set: {
      field: {
        $reduce: {
          input: [...Array(20).keys()],
          initialValue: [0],
          in: { $concatArrays: ['$$value', '$$value'] }
        }
      }
    }
  },
  { $unwind: '$field' },
  { $limit: 1000000 }
]);

await cursor.toArray();
await client.close();
