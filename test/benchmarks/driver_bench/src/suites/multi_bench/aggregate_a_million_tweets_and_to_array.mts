import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 1500;

let db: mongodb.Db;
let tweet: Record<string, any>;

export async function before() {
  await driver.drop();
  await driver.create();

  tweet = await driver.load('single_and_multi_document/tweet.json', 'json');

  db = driver.db;
}

export async function run() {
  await db
    .aggregate([
      { $documents: [tweet] },
      {
        $set: {
          field: {
            $reduce: {
              input: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
              initialValue: [0],
              in: { $concatArrays: ['$$value', '$$value'] }
            }
          }
        }
      },
      { $unwind: '$field' },
      { $limit: 1000000 }
    ])
    .toArray();
}

export async function after() {
  await driver.drop();
  await driver.close();
}
